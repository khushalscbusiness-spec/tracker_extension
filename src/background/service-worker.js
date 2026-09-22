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

    // Track processed apply clicks to avoid duplicates
    this.processedApplyClicks = new Set();

    // Cleanup interval for processed clicks
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
   */
  cleanupProcessedClicks() {
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

    // NOTE: Tab observation (onUpdated, onCreated, onRemoved) is handled
    // exclusively by the TabObserver classes registered in ApplicationTracker.
    // Do NOT add direct chrome.tabs.onUpdated / onCreated / onRemoved listeners
    // here — they would double-fire every event.

    // Tab activation — only fired when the user switches tabs.
    // Not handled by any observer, so it stays here.
    chrome.tabs.onActivated.addListener((activeInfo) => {
      chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (!tab || !tab.url) return;
        this.handleTabChange(tab.id, tab.url);
      });
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

    // Notification button clicks
    chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
      console.log(`[JobPulse] Notification button clicked: ${notificationId}, button ${buttonIndex}`);
      // Button 0 = "View Job", Button 1 = "Dismiss"
      chrome.notifications.clear(notificationId);
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

          this.stateManager.setJobStatus({
            tracked: true,
            status: 'applied',
            appliedAt: data.submittedAt,
            ats: data.ats,
            atsName: data.atsName
          });

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
  // MESSAGE HANDLING
  // ============================================

  async handleMessage(message, sender, sendResponse) {
    console.log('[JobPulse] Message received:', message.type);

    switch (message.type) {
      case 'JOB_DETECTED':
        await this.stateManager.setJob(message.payload);
        this.broadcastStateUpdate();
        sendResponse({ success: true });
        break;

      case 'GET_STATE':
        const state = await this.stateManager.getState();
        sendResponse({ state });
        break;

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

      case 'SUCCESS_DETECTED':
        await this.handleSuccessDetected(message.payload, sender);
        sendResponse({ success: true });
        break;

      case 'CHECK_AUTH':
        try {
          const auth = await this.checkAuth();
          sendResponse(auth);
        } catch (error) {
          sendResponse({ authenticated: false, error: error.message });
        }
        break;

      case 'GET_SESSION_FOR_TAB': {
        const tabId = message.tabId;
        let session = sessionManager.getSessionByTabId(tabId);

        if (!session) {
          const active = sessionManager.getActiveSessions();
          session = active
            .sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0))[0] || null;
        }

        sendResponse({
          session: session ? {
            sessionId: session.sessionId,
            status: session.status,
            stepLabel: session.steps?.length
              ? session.steps[session.steps.length - 1].label
              : null,
            urlCount: session.visitedUrls?.length || 0,
            elapsedMs: session.startedAt ? Date.now() - session.startedAt : 0,
            atsName: session.atsName || null,
            platform: session.platform || null
          } : null
        });
        break;
      }

      default:
        sendResponse({ error: 'Unknown message type' });
    }
    return true;
  }

  // ============================================
  // APPLY HANDLERS
  // ============================================

  async handleApplyClick(payload, sender) {
    console.log('[JobPulse] Apply click received:', payload);

    const dedupKey = this.getApplyClickDedupKey(payload, sender);

    if (this.isDuplicateApplyClick(dedupKey)) {
      console.log(`[JobPulse] ⚠️ Duplicate apply click detected, skipping: ${dedupKey}`);
      return;
    }

    this.markApplyClickProcessed(dedupKey);
    console.log(`[JobPulse] ✅ Marked apply click as processed: ${dedupKey}`);

    try {
      const currentState = await this.stateManager.getState();
      const job = payload.job || currentState.job;

      if (!job) {
        console.warn('[JobPulse] No job found for apply click');
        return;
      }

      let redirectUrl = payload.redirectUrl || payload.applyUrl;

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

      if (!redirectUrl && payload.applyUrl) {
        redirectUrl = payload.applyUrl;
      }

      if (!redirectUrl) {
        console.warn('[JobPulse] No redirect URL found in apply click');
      }

      const applyData = {
        applyUrl: payload.applyUrl,
        redirectUrl: redirectUrl,
        sourceTabId: sender.tab?.id || payload.sourceTabId,
        applyType: payload.applyType || 'external',
        applyMethod: payload.applyMethod || 'external_redirect',
        timestamp: payload.timestamp || Date.now()
      };

      const session = await applicationTracker.handleApplyClick({
        jobData: job,
        applyData: applyData
      });

      await this.stateManager.setJob({
        ...job,
        lastApplyClick: {
          type: applyData.applyType,
          timestamp: applyData.timestamp,
          redirectUrl: redirectUrl,
          sessionId: session?.sessionId
        }
      });

      // REMOVED: previous block that called this.apiClient.trackApplyClick(...)
      // Apply clicks are now tracked exclusively by ApplicationTracker via the
      // session system. No HTTP call is made to Layer 3 on apply click.

      this.broadcastStateUpdate();
      console.log('[JobPulse] ✅ Apply click processed, session:', session?.sessionId);

    } catch (error) {
      console.error('[JobPulse] Error handling apply click:', error);
    }
  }

  async handleApplyInitiated(payload, sender) {
    console.log('[JobPulse] Apply initiated:', payload);

    const result = await applicationTracker.handleApplyClick(payload, sender);

    return {
      success: true,
      sessionId: result?.sessionId
    };
  }

  // ============================================
  // SUCCESS DETECTION HANDLER
  // ============================================

  async handleSuccessDetected(payload, sender) {
    console.log('[JobPulse] 🎉 Success detected from content:', payload.phrase);
    console.log('[JobPulse]   URL:', payload.url);
    console.log('[JobPulse]   From iframe:', payload.isIframe ? 'yes' : 'no');
    console.log('[JobPulse]   Method:', payload.detectionMethod || 'content');

    const tabId = sender.tab?.id;
    if (!tabId) {
      console.warn('[JobPulse] No tab ID in success message');
      return;
    }

    console.log('[JobPulse] Looking for session for tab:', tabId);

    let session = sessionManager.getSessionByTabId(tabId);

    if (!session) {
      const allSessions = sessionManager.getActiveSessions();
      session = allSessions.find(s =>
        s.trackedTabs && s.trackedTabs.includes(tabId)
      );
    }

    if (!session) {
      console.log('[JobPulse] ⚠️ No session found for tab', tabId);
      return;
    }

    if (session.status === 'submitted') {
      console.log('[JobPulse] Session already submitted, skipping');
      return;
    }

    console.log('[JobPulse] ✅ Notifying ApplicationTracker:', session.sessionId);

    if (applicationTracker && typeof applicationTracker.handleSuccessDetected === 'function') {
      applicationTracker.handleSuccessDetected(session, payload);
    } else {
      console.warn('[JobPulse] ApplicationTracker not available, updating session directly');

      await sessionManager.updateSession(session.sessionId, {
        status: 'submitted',
        submittedAt: Date.now(),
        successUrl: payload.url,
        thankYouPhrase: payload.phrase,
        successDetectionMethod: payload.detectionMethod || 'content'
      });

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

  getSessionStats() {
    return applicationTracker.getStats();
  }

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