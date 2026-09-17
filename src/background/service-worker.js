// src/background/service-worker.js

import { API_CLIENT } from '../api/client.js';
import { STATE_MANAGER } from '../state/state-manager.js';
import { STORAGE } from '../utils/storage.js';
import { loadConfig, getConfig } from '../config/config.js';

// Import the Application Tracker
import applicationTracker from './managers/ApplicationTracker.js';
import sessionManager from './managers/SessionManager.js';

console.log('[JobPulse] Service worker loaded');

class ServiceWorker {
  constructor() {
    console.log('[JobPulse] ServiceWorker constructor');
    this.stateManager = STATE_MANAGER;
    this.apiClient = API_CLIENT;
    this.isInitialized = false;

    // ✅ FIX: Track processed apply clicks to avoid duplicates
    this.processedApplyClicks = new Set();

    // ✅ FIX: Cleanup interval for processed clicks
    this.cleanupInterval = setInterval(() => {
      this.cleanupProcessedClicks();
    }, 30000); // Clean every 30 seconds

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
  // DEDUPLICATION HELPERS
  // ============================================

  /**
   * Generate a dedup key for apply clicks
   * @param {Object} payload - Apply click payload
   * @param {Object} sender - Message sender
   * @returns {string} Dedup key
   */
  getApplyClickDedupKey(payload, sender) {
    const jobId = payload.jobId || payload.job?.externalJobId || 'unknown';
    const tabId = sender.tab?.id || 'unknown';
    return `${jobId}_${tabId}`;
  }

  /**
   * Check if apply click is duplicate
   * @param {string} dedupKey - Dedup key
   * @returns {boolean} True if duplicate
   */
  isDuplicateApplyClick(dedupKey) {
    return this.processedApplyClicks.has(dedupKey);
  }

  /**
   * Mark apply click as processed
   * @param {string} dedupKey - Dedup key
   */
  markApplyClickProcessed(dedupKey) {
    this.processedApplyClicks.add(dedupKey);
  }

  /**
   * Clean up old processed clicks
   * Removes entries older than 60 seconds
   */
  cleanupProcessedClicks() {
    const now = Date.now();
    const maxAge = 60000; // 60 seconds

    // Since we only store keys (not timestamps), we'll clear all periodically
    // A more sophisticated approach would store timestamps
    if (this.processedApplyClicks.size > 100) {
      console.log(`[JobPulse] Cleaning up ${this.processedApplyClicks.size} processed clicks`);
      this.processedApplyClicks.clear();
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
          if (data.jobIds) {
            console.log(`[JobPulse]   Job IDs:`, data.jobIds);
          }
          if (data.applicationReference) {
            console.log(`[JobPulse]   Reference: ${data.applicationReference}`);
          }

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
    if (!url) return false;

    const jobPatterns = [
      /linkedin\.com\/jobs\/view/,
      /linkedin\.com\/jobs\/search-results/,
      /naukri\.com\/job-listings/,
      /myworkdayjobs\.com/,
      /boards\.greenhouse\.io/,
      /job-boards\.greenhouse\.io/,
      /lever\.co/,
      /jobs\.lever\.co/,
      /ashbyhq\.com/,
      /jobs\.ashbyhq\.com/,
      /smartrecruiters\.com/,
      /icims\.com/,
      /bamboohr\.com/,
      /taleo\.net/,
      /jobs\.deel\.com/,
      /deel\.com/
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
      // ✅ SUCCESS DETECTION (Content + Iframe)
      // ============================================

      case 'SUCCESS_DETECTED':
        await this.handleSuccessDetected(message.payload, sender);
        sendResponse({ success: true });
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
   * ✅ FIX: Added deduplication to prevent duplicate sessions
   */
  async handleApplyClick(payload, sender) {
    console.log('[JobPulse] Apply click received:', payload);

    // ✅ DEDUPLICATION: Check if this click was already processed
    const dedupKey = this.getApplyClickDedupKey(payload, sender);

    if (this.isDuplicateApplyClick(dedupKey)) {
      console.log(`[JobPulse] ⚠️ Duplicate apply click detected, skipping: ${dedupKey}`);
      return;
    }

    // Mark as processed
    this.markApplyClickProcessed(dedupKey);
    console.log(`[JobPulse] ✅ Marked apply click as processed: ${dedupKey}`);

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

      // ✅ FIX: Handle null/empty redirectUrl
      if (payload.applyUrl && payload.applyUrl.includes('safety/go?url=')) {
        try {
          const urlParams = new URLSearchParams(payload.applyUrl.split('?')[1]);
          const encodedUrl = urlParams.get('url');
          if (encodedUrl) {
            redirectUrl = decodeURIComponent(encodedUrl);
          }
        } catch (e) {
          console.warn('[JobPulse] Could not parse redirect URL:', e);
        }
      }

      // ✅ FIX: If redirectUrl is still null, try to use applyUrl
      if (!redirectUrl && payload.applyUrl) {
        redirectUrl = payload.applyUrl;
      }

      // ✅ FIX: If still null, log warning but continue
      if (!redirectUrl) {
        console.warn('[JobPulse] No redirect URL found in apply click');
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
  // ✅ SUCCESS DETECTION HANDLER
  // ============================================

  /**
   * Handle success detected from content script (main frame or iframe)
   * @param {Object} payload - Success payload
   * @param {Object} sender - Message sender
   */
  async handleSuccessDetected(payload, sender) {
    console.log('[JobPulse] 🎉 Success detected from content:', payload.phrase);
    console.log('[JobPulse]   URL:', payload.url);
    console.log('[JobPulse]   From iframe:', payload.isIframe ? 'yes' : 'no');
    console.log('[JobPulse]   Method:', payload.detectionMethod || 'content');

    // Get tab ID (for iframe, sender.tab.id is the parent tab)
    const tabId = sender.tab?.id;
    if (!tabId) {
      console.warn('[JobPulse] No tab ID in success message');
      return;
    }

    console.log('[JobPulse] Looking for session for tab:', tabId);

    // Find session for this tab
    let session = sessionManager.getSessionByTabId(tabId);

    if (!session) {
      // Fallback: search all active sessions for this tab
      const allSessions = sessionManager.getActiveSessions();
      session = allSessions.find(s =>
        s.trackedTabs && s.trackedTabs.includes(tabId)
      );
    }

    if (!session) {
      console.log('[JobPulse] ⚠️ No session found for tab', tabId);
      return;
    }

    // Skip if already submitted
    if (session.status === 'submitted') {
      console.log('[JobPulse] Session already submitted, skipping');
      return;
    }

    console.log('[JobPulse] ✅ Notifying ApplicationTracker:', session.sessionId);

    // ✅ Notify ApplicationTracker
    // ApplicationTracker.handleSuccessDetected() will:
    // 1. Update session to submitted
    // 2. Transition to SubmittedState
    // 3. Trigger SubmittedState.onEnter()
    // 4. Build and send payload
    if (applicationTracker && typeof applicationTracker.handleSuccessDetected === 'function') {
      applicationTracker.handleSuccessDetected(session, payload);
    } else {
      // Fallback: if ApplicationTracker not available, update session directly
      console.warn('[JobPulse] ApplicationTracker not available, updating session directly');

      await sessionManager.updateSession(session.sessionId, {
        status: 'submitted',
        submittedAt: Date.now(),
        successUrl: payload.url,
        thankYouPhrase: payload.phrase,
        successDetectionMethod: payload.detectionMethod || 'content'
      });

      // Notify popup
      chrome.runtime.sendMessage({
        type: 'APPLICATION_SUBMITTED',
        payload: {
          sessionId: session.sessionId,
          jobTitle: session.jobTitle,
          company: session.company,
          successUrl: payload.url,
          thankYouPhrase: payload.phrase
        }
      }).catch(() => {});
    }
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