// src/background/service-worker.js

import { API_CLIENT } from '../api/client.js';
import { STATE_MANAGER } from '../state/state-manager.js';
import { STORAGE } from '../utils/storage.js';
import { loadConfig, getConfig } from '../config/config.js';

// Import the new Application Tracker
import applicationTracker from './managers/ApplicationTracker.js';
import sessionManager from './managers/SessionManager.js';

console.log('[JobPulse] Service worker loaded');

class ServiceWorker {
  constructor() {
    console.log('[JobPulse] ServiceWorker constructor');
    this.stateManager = STATE_MANAGER;
    this.apiClient = API_CLIENT;
    this.isInitialized = false;

    this.setupListeners();
    this.initialize();
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  async initialize() {
    console.log('[JobPulse] Initializing service worker');
    try {
      // Load config
      await loadConfig();
      const config = getConfig();
      console.log('[JobPulse] Config loaded:', config);

      // Set API URL
      if (this.apiClient.setBaseURL) {
        this.apiClient.setBaseURL(config.API_URL);
      } else {
        this.apiClient.baseURL = config.API_URL;
      }
      console.log('[JobPulse] API URL:', config.API_URL);

      // Restore authentication
      const token = await STORAGE.get('access_token');
      if (token) {
        this.apiClient.setToken(token);
        console.log('[JobPulse] Token restored');
      }

      // Initialize the Application Tracker
      applicationTracker.initialize();
      console.log('[JobPulse] Application Tracker initialized');

      // Get current tab and detect job
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        this.handleTabChange(tabs[0].id, tabs[0].url);
      }

      this.isInitialized = true;
      console.log('[JobPulse] ✅ Service worker fully initialized');
    } catch (error) {
      console.error('[JobPulse] Initialization error:', error);
    }
  }

  // ============================================
  // LISTENERS
  // ============================================

  setupListeners() {
    console.log('[JobPulse] Setting up listeners');

    // Tab updates (SPA navigation)
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.url || changeInfo.status === 'complete') {
        this.handleTabChange(tabId, tab.url);
      }
    });

    // Tab activation
    chrome.tabs.onActivated.addListener((activeInfo) => {
      chrome.tabs.get(activeInfo.tabId, (tab) => {
        this.handleTabChange(tab.id, tab.url);
      });
    });

    // Tab creation (for external redirects)
    chrome.tabs.onCreated.addListener((tab) => {
      if (tab.url && tab.url !== 'chrome://newtab/') {
        console.log('[JobPulse] New tab detected:', tab.url);
      }
    });

    // Messages from content scripts and popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      return this.handleMessage(message, sender, sendResponse);
    });

    // Popup connection
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name === 'popup') {
        port.onMessage.addListener((message) => {
          this.handlePopupMessage(message, port);
        });
      }
    });

    // Session events from ApplicationTracker
    this.setupSessionEventListeners();
  }

  // ============================================
  // SESSION EVENT LISTENERS
  // ============================================

  setupSessionEventListeners() {
    applicationTracker.onApplicationEvent((eventType, data) => {
      switch (eventType) {
        case 'application_submitted':
          console.log('[JobPulse] 🎉 Application submitted!');
          console.log(`[JobPulse]   Job: ${data.jobTitle}`);
          console.log(`[JobPulse]   Company: ${data.company}`);
          console.log(`[JobPulse]   ATS: ${data.atsName}`);

          // Update state
          this.stateManager.setJobStatus({
            tracked: true,
            status: 'applied',
            appliedAt: data.submittedAt,
            ats: data.ats,
            atsName: data.atsName
          });

          // Notify popup
          chrome.runtime.sendMessage({
            type: 'APPLICATION_SUBMITTED',
            payload: data
          }).catch(() => {});
          break;

        case 'application_abandoned':
          console.log('[JobPulse] ❌ Application abandoned');
          console.log(`[JobPulse]   Job: ${data.jobTitle}`);
          console.log(`[JobPulse]   Reason: ${data.reason}`);
          break;

        case 'step_detected':
          console.log(`[JobPulse] 📄 Step: ${data.label}`);
          break;

        default:
          break;
      }
    });
  }

  // ============================================
  // TAB HANDLING
  // ============================================

  async handleTabChange(tabId, url) {
    if (!url || !this.isJobPage(url)) {
      await this.stateManager.clearJob();
      this.broadcastStateUpdate();
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: 'DETECT_JOB'
      });

      if (response && response.job) {
        await this.stateManager.setJob(response.job);
        await this.checkJobStatus(response.job);
        this.broadcastStateUpdate();
      }
    } catch (error) {
      console.log('[JobPulse] Detection not available on this page:', error.message);
    }
  }

  isJobPage(url) {
    const jobPatterns = [
      /linkedin\.com\/jobs\/view/,
      /linkedin\.com\/jobs\/search-results/,
      /naukri\.com\/job-listings/,
      /myworkdayjobs\.com/,
      /boards\.greenhouse\.io/,
      /lever\.co/
    ];
    return jobPatterns.some(pattern => pattern.test(url));
  }

  // ============================================
  // JOB STATUS
  // ============================================

  async checkJobStatus(job) {
    if (!this.apiClient.isAuthenticated()) return;

    try {
      const status = await this.apiClient.checkJobStatus(job);
      await this.stateManager.setJobStatus(status);
    } catch (error) {
      console.error('[JobPulse] Error checking job status:', error);
    }
  }

  // ============================================
  // MESSAGE HANDLING
  // ============================================

  async handleMessage(message, sender, sendResponse) {
    console.log('[JobPulse] Message received:', message.type);

    switch (message.type) {
      // ============================================
      // JOB DETECTION
      // ============================================

      case 'JOB_DETECTED':
        await this.stateManager.setJob(message.payload);
        await this.checkJobStatus(message.payload);
        this.broadcastStateUpdate();
        sendResponse({ success: true });
        break;

      case 'GET_STATE':
        const state = await this.stateManager.getState();
        sendResponse({ state });
        break;

      // ============================================
      // APPLY TRACKING
      // ============================================

      case 'APPLY_CLICKED':
        await this.handleApplyClick(message.payload, sender);
        sendResponse({ success: true });
        break;

      case 'APPLY_BUTTON_CLICKED':
        await this.handleApplyClick(message.payload, sender);
        sendResponse({ success: true });
        break;

      case 'APPLY_INITIATED':
        const result = await this.handleApplyInitiated(message.payload, sender);
        sendResponse(result);
        break;

      // ============================================
      // JOB TRACKING
      // ============================================

      case 'TRACK_JOB':
        const trackResult = await this.handleTrackJob(message.job);
        sendResponse(trackResult);
        break;

      // ============================================
      // AUTHENTICATION
      // ============================================

      case 'CHECK_AUTH':
        try {
          const auth = await this.checkAuth();
          sendResponse(auth);
        } catch (error) {
          sendResponse({ authenticated: false, error: error.message });
        }
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
    return true;
  }

  // ============================================
  // APPLY HANDLERS
  // ============================================

  /**
   * Handle apply click from content script
   * This delegates to the ApplicationTracker
   */
  async handleApplyClick(payload, sender) {
    console.log('[JobPulse] Apply click received:', payload);

    try {
      // Get current job from state
      const currentState = await this.stateManager.getState();
      const job = payload.job || currentState.job;

      if (!job) {
        console.warn('[JobPulse] No job found for apply click');
        return;
      }

      // Extract redirect URL from LinkedIn's safety redirect
      let redirectUrl = payload.redirectUrl || payload.applyUrl;
      if (payload.applyUrl && payload.applyUrl.includes('safety/go?url=')) {
        const urlParams = new URLSearchParams(payload.applyUrl.split('?')[1]);
        const encodedUrl = urlParams.get('url');
        if (encodedUrl) {
          redirectUrl = decodeURIComponent(encodedUrl);
        }
      }

      // Prepare apply data
      const applyData = {
        applyUrl: payload.applyUrl,
        redirectUrl: redirectUrl,
        sourceTabId: sender.tab?.id || payload.sourceTabId,
        applyType: payload.applyType || 'external',
        applyMethod: payload.applyMethod || 'external_redirect',
        timestamp: payload.timestamp || Date.now()
      };

      // Delegate to ApplicationTracker
      const session = await applicationTracker.handleApplyClick({
        jobData: job,
        applyData: applyData
      });

      // Update state with apply info
      await this.stateManager.setJob({
        ...job,
        lastApplyClick: {
          type: applyData.applyType,
          timestamp: applyData.timestamp,
          redirectUrl: redirectUrl,
          sessionId: session?.sessionId
        }
      });

      // Send to API if authenticated
      if (this.apiClient.isAuthenticated()) {
        try {
          await this.apiClient.trackApplyClick({
            jobId: job.externalJobId,
            jobTitle: job.title,
            company: job.company,
            redirectUrl: redirectUrl,
            applyUrl: payload.applyUrl,
            timestamp: applyData.timestamp
          });
          console.log('[JobPulse] Apply click sent to API');
        } catch (error) {
          console.warn('[JobPulse] Failed to send apply click to API:', error.message);
        }
      }

      this.broadcastStateUpdate();
      console.log('[JobPulse] ✅ Apply click processed, session:', session?.sessionId);

    } catch (error) {
      console.error('[JobPulse] Error handling apply click:', error);
    }
  }

  /**
   * Handle apply initiated from content script
   */
  async handleApplyInitiated(payload, sender) {
    console.log('[JobPulse] Apply initiated:', payload);

    const result = await applicationTracker.handleApplyClick(payload, sender);

    return {
      success: true,
      sessionId: result?.sessionId
    };
  }

  // ============================================
  // JOB TRACKING
  // ============================================

  async handleTrackJob(job) {
    if (!this.apiClient.isAuthenticated()) {
      return { success: false, error: 'NOT_AUTHENTICATED' };
    }

    try {
      const response = await this.apiClient.trackJob(job);
      await this.stateManager.setJobStatus({
        tracked: true,
        duplicate: response.duplicate,
        jobId: response.id,
        status: response.status || 'Saved',
        trackedAt: new Date().toISOString()
      });
      this.broadcastStateUpdate();
      return { success: true, ...response };
    } catch (error) {
      console.error('[JobPulse] Track job error:', error);
      return {
        success: false,
        error: error.message || 'Failed to track job'
      };
    }
  }

  // ============================================
  // AUTHENTICATION
  // ============================================

  async checkAuth() {
    const token = await STORAGE.get('access_token');
    if (!token) {
      return { authenticated: false };
    }

    try {
      this.apiClient.setToken(token);
      const user = await this.apiClient.getCurrentUser();
      return { authenticated: true, user };
    } catch (error) {
      await STORAGE.remove('access_token');
      this.apiClient.setToken(null);
      return { authenticated: false };
    }
  }

  // ============================================
  // POPUP MESSAGES
  // ============================================

  async handlePopupMessage(message, port) {
    console.log('[JobPulse] Popup message:', message.type);

    switch (message.type) {
      case 'TRACK_JOB':
        const result = await this.handleTrackJob(message.job);
        port.postMessage({ type: 'TRACK_RESULT', ...result });
        break;

      case 'GET_STATE':
        const state = await this.stateManager.getState();
        port.postMessage({ type: 'STATE_UPDATE', state });
        break;

      case 'LOGIN':
        try {
          const token = await this.apiClient.login(message.email, message.password);
          if (token) {
            await STORAGE.set('access_token', token);
            this.apiClient.setToken(token);
            port.postMessage({ type: 'LOGIN_SUCCESS' });
          }
        } catch (error) {
          port.postMessage({ type: 'LOGIN_ERROR', error: error.message });
        }
        break;

      case 'LOGOUT':
        await this.apiClient.logout();
        port.postMessage({ type: 'LOGOUT_SUCCESS' });
        break;

      default:
        port.postMessage({ type: 'UNKNOWN', error: 'Unknown message type' });
    }
  }

  // ============================================
  // UTILITY
  // ============================================

  broadcastStateUpdate() {
    chrome.runtime.sendMessage({
      type: 'STATE_UPDATED',
      state: this.stateManager.getState()
    }).catch(() => {});
  }

  /**
   * Get session statistics
   */
  getSessionStats() {
    return applicationTracker.getStats();
  }

  /**
   * Get all active sessions
   */
  getActiveSessions() {
    return sessionManager.getActiveSessions();
  }
}

// ============================================
// INITIALIZE SERVICE WORKER
// ============================================

console.log('[JobPulse] Starting service worker...');

try {
  const serviceWorker = new ServiceWorker();
  console.log('[JobPulse] Service worker initialized successfully');
} catch (error) {
  console.error('[JobPulse] Failed to initialize service worker:', error);
}