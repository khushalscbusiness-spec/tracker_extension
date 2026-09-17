// src/background/patterns/states/SubmittedState.js

import { SessionState } from '../base/SessionState.js';
import { getApiUrl } from '../../../config/config.js';

/**
 * Submitted State
 *
 * Represents the final successful state when the user has submitted their application.
 *
 * This state is reached when:
 * - The ATS success page is detected (URL pattern matches)
 * - The strategy detects a success step
 * - The thank you message or confirmation is found
 *
 * In this state:
 * - The session is marked as complete
 * - All data is gathered and formatted
 * - The payload is sent to the backend
 * - A notification is shown to the user
 * - The session is cleaned up (no further tracking needed)
 *
 * Transitions to:
 * - None (terminal state - session is complete)
 */
export class SubmittedState extends SessionState {
  constructor(session) {
    super(session);
    this.name = 'submitted';
    this.payloadSent = false;
    this.notificationShown = false;
    this.cleanupDone = false;
  }

  /**
   * Called when entering this state
   */
  onEnter() {
    super.onEnter();
    console.log('========================================');
    console.log(`[SubmittedState] 🎉 APPLICATION SUBMITTED!`);
    console.log('========================================');
    console.log(`[SubmittedState]   Job: ${this.session.jobTitle}`);
    console.log(`[SubmittedState]   Company: ${this.session.company}`);
    console.log(`[SubmittedState]   ATS: ${this.session.atsName || 'Unknown'}`);
    console.log(`[SubmittedState]   Steps completed: ${this.session.stepCount}`);
    console.log(`[SubmittedState]   URLs tracked: ${this.session.visitedUrls ? this.session.visitedUrls.length : 0}`);
    console.log(`[SubmittedState]   Time taken: ${this.calculateTotalTime()}`);

    // Log job ID information
    if (this.session.jobIds && Object.keys(this.session.jobIds).length > 0) {
      console.log(`[SubmittedState]   Job IDs:`, this.session.jobIds);
    }
    if (this.session.externalJobId) {
      console.log(`[SubmittedState]   External Job ID: ${this.session.externalJobId}`);
    }
    if (this.session.applicationReference) {
      console.log(`[SubmittedState]   Application Reference: ${this.session.applicationReference}`);
    }
    console.log('========================================');

    // Update session status
    this.session.status = 'submitted';
    this.session.submittedAt = Date.now();
    this.session.completedAt = Date.now();

    // Extract thank you message
    this.extractThankYouMessage();

    // Build and send payload
    this.buildAndSendPayload();

    // Show notification
    this.showNotification();

    // Clean up
    this.cleanup();
  }

  /**
   * Called when exiting this state
   */
  onExit() {
    super.onExit();
    console.log(`[SubmittedState] Exiting state for: ${this.session.jobTitle}`);
  }

  /**
   * Handle events in this state
   * (No transitions from this state - it's terminal)
   * @param {Object} event - The event to handle
   * @returns {boolean} True if the event was handled
   */
  handleEvent(event) {
    console.log(`[SubmittedState] Received event (ignoring): ${event.type}`);
    // Terminal state - no transitions
    return false;
  }

  /**
   * Get allowed transitions from this state
   * @returns {string[]} Empty array (terminal state)
   */
  getAllowedTransitions() {
    return []; // Terminal state
  }

  /**
   * Get the state timeout (no timeout - terminal state)
   * @returns {null} No timeout
   */
  getTimeout() {
    return null; // No timeout for terminal state
  }

  /**
   * Extract thank you message from the session
   */
  extractThankYouMessage() {
    if (this.session.thankYouPhrase) {
      console.log(`[SubmittedState] Thank you message: ${this.session.thankYouPhrase}`);
      return;
    }

    // Try to extract from strategy
    const strategy = this.session.atsStrategy;
    if (strategy && this.session.successUrl) {
      const message = strategy.extractThankYouMessage(
        this.session.successUrl,
        null, // Page title not available
        null  // Page content not available
      );
      if (message) {
        this.session.thankYouPhrase = message;
        console.log(`[SubmittedState] Extracted thank you: ${message}`);
      }
    }

    // Default message if nothing found
    if (!this.session.thankYouPhrase) {
      this.session.thankYouPhrase = `Application submitted to ${this.session.company}`;
      console.log(`[SubmittedState] Using default thank you: ${this.session.thankYouPhrase}`);
    }
  }

  /**
   * Build and send payload to backend
   */
  async buildAndSendPayload() {
    if (this.payloadSent) return;
    this.payloadSent = true;

    console.log(`[SubmittedState] 📤 Building payload for: ${this.session.jobTitle}`);

    // Build the payload
    const payload = this.buildPayload();
    console.log(`[SubmittedState] Payload:`, JSON.stringify(payload, null, 2));

    // Send to backend
    try {
      const result = await this.sendToBackend(payload);
      console.log(`[SubmittedState] ✅ Payload sent successfully!`);
      console.log(`[SubmittedState]   Response:`, result);
    } catch (error) {
      console.error(`[SubmittedState] ❌ Failed to send payload:`, error);
      // Store for retry
      await this.storeFailedPayload(payload);
    }
  }

  /**
   * Build the complete payload
   * @returns {Object} Payload object
   */
  buildPayload() {
    // Build URL chain with full details including job IDs
    const urlChain = this.buildUrlChain();

    // Get all job IDs
    const jobIds = this.session.jobIds || {};
    const externalJobId = this.session.externalJobId || null;
    const applicationReference = this.session.applicationReference || null;

    return {
      // Job Information
      jobId: this.session.jobId,
      jobTitle: this.session.jobTitle,
      company: this.session.company,
      location: this.session.location || null,
      jobUrl: this.session.jobUrl,

      // Job ID Tracking
      linkedInJobId: this.session.jobId,
      externalJobId: externalJobId,
      jobIds: jobIds,
      applicationReference: applicationReference,
      confirmationNumber: applicationReference,

      // Application Information
      status: 'applied',
      appliedAt: this.session.submittedAt,
      source: this.session.ats || 'external',
      applyMethod: this.session.applyMethod || 'external_redirect',
      stepsCompleted: this.session.stepCount || 0,
      thankYouPhrase: this.session.thankYouPhrase || null,
      confirmationMessage: this.session.confirmationMessage || null,

      // Complete URL Chain
      urlChain: urlChain,

      // Timing Information
      startedAt: this.session.startedAt,
      redirectedAt: this.session.redirectedAt,
      submittedAt: this.session.submittedAt,
      totalTimeMs: this.session.submittedAt - this.session.startedAt,
      totalTimeSeconds: Math.round((this.session.submittedAt - this.session.startedAt) / 1000),

      // ATS Information
      ats: this.session.ats,
      atsName: this.session.atsName || 'External',

      // System Information
      sessionId: this.session.sessionId,
      platform: 'linkedin',
      detectedAt: new Date().toISOString(),
      version: '0.1.0',

      // Step History
      steps: this.session.steps.map(step => ({
        step: step.step,
        label: step.label,
        timestamp: step.timestamp,
        matchedPattern: step.matchedPattern
      })),

      // User Information (if available)
      userId: this.session.userId || null
    };
  }

  /**
   * Build the URL chain with full details including job IDs
   * @returns {Array} Array of URL entries with order, label, timestamp, jobId
   */
  buildUrlChain() {
    if (!this.session.visitedUrls || this.session.visitedUrls.length === 0) {
      return [];
    }

    return this.session.visitedUrls.map(entry => ({
      order: entry.order,
      url: entry.url,
      label: entry.label || 'Unknown',
      timestamp: entry.timestamp,
      tabId: entry.tabId || null,
      title: entry.title || null,
      jobId: entry.jobId || null
    }));
  }

  /**
   * Get formatted URL chain as a string
   * @param {string} separator - Separator between URLs
   * @returns {string} Formatted URL chain
   */
  getUrlChainFormatted(separator = ' → ') {
    if (!this.session.visitedUrls || this.session.visitedUrls.length === 0) {
      return '';
    }

    return this.session.visitedUrls
      .map(entry => `#${entry.order} [${entry.label || 'Unknown'}]: ${entry.url}`)
      .join(separator);
  }

  /**
   * Get URL chain with job IDs included
   * @param {string} separator - Separator between URLs
   * @returns {string} Formatted URL chain with job IDs
   */
  getUrlChainWithJobIds(separator = ' → ') {
    if (!this.session.visitedUrls || this.session.visitedUrls.length === 0) {
      return '';
    }

    return this.session.visitedUrls
      .map(entry => {
        const jobIdInfo = entry.jobId ? ` [Job: ${entry.jobId}]` : '';
        return `#${entry.order}${jobIdInfo} [${entry.label || 'Unknown'}]: ${entry.url}`;
      })
      .join(separator);
  }

  /**
   * Get a simplified URL chain (just labels)
   * @param {string} separator - Separator between labels
   * @returns {string} Simplified chain
   */
  getSimplifiedUrlChain(separator = ' → ') {
    if (!this.session.visitedUrls || this.session.visitedUrls.length === 0) {
      return '';
    }

    return this.session.visitedUrls
      .map(entry => entry.label || `Step ${entry.order}`)
      .join(separator);
  }

  /**
   * Get simplified URL chain with job IDs
   * @param {string} separator - Separator between labels
   * @returns {string} Simplified chain with job IDs
   */
  getSimplifiedUrlChainWithJobIds(separator = ' → ') {
    if (!this.session.visitedUrls || this.session.visitedUrls.length === 0) {
      return '';
    }

    return this.session.visitedUrls
      .map(entry => {
        const label = entry.label || `Step ${entry.order}`;
        const jobIdInfo = entry.jobId ? ` (${entry.jobId})` : '';
        return `${label}${jobIdInfo}`;
      })
      .join(separator);
  }

  /**
   * Get job IDs summary as a formatted string
   * @returns {string} Formatted job IDs string
   */
  getJobIdsSummary() {
    const jobIds = this.session.jobIds || {};
    if (Object.keys(jobIds).length === 0) {
      return 'No job IDs tracked';
    }

    return Object.entries(jobIds)
      .map(([source, id]) => `${source}: ${id}`)
      .join(', ');
  }

  // ============================================
  // BACKEND COMMUNICATION
  // ============================================

  /**
   * Send payload to backend
   * @param {Object} payload - The payload to send
   * @returns {Promise<Object>} API response
   */
  async sendToBackend(payload) {
    const apiUrl = await this.resolveApiUrl();
    const endpoint = '/applications/track';

    console.log(`[SubmittedState] POST ${apiUrl}${endpoint}`);

    const token = await this.getAuthToken();

    const response = await fetch(`${apiUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`HTTP ${response.status}: ${errorData.detail || response.statusText}`);
    }

    return response.json();
  }

  /**
   * Resolve the API URL from config.
   * Priority:
   *   1. chrome.storage.local.user_config.API_URL (runtime override)
   *   2. Build-time config from the active env file (imported statically)
   * @returns {Promise<string>} API base URL
   */
  async resolveApiUrl() {
    // 1. Runtime override from storage
    try {
      const result = await chrome.storage.local.get('user_config');
      const userConfig = result.user_config;
      if (userConfig && userConfig.API_URL) {
        return userConfig.API_URL;
      }
    } catch (e) {
      console.warn('[SubmittedState] Could not read user_config from storage:', e);
    }

    // 2. Build-time config
    const apiUrl = getApiUrl();
    if (!apiUrl) {
      throw new Error('[SubmittedState] No API URL configured');
    }
    return apiUrl;
  }

  /**
   * Show notification to user
   */
  showNotification() {
    if (this.notificationShown) return;
    this.notificationShown = true;

    const message = `✅ Applied to ${this.session.jobTitle} at ${this.session.company}`;
    const title = '🎉 Application Submitted!';

    console.log(`[SubmittedState] 📢 Notification: ${title} - ${message}`);

    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: title,
        message: message,
        requireInteraction: true,
        buttons: [
          { title: 'View Job' },
          { title: 'Dismiss' }
        ]
      }, (notificationId) => {
        console.log(`[SubmittedState] Notification created: ${notificationId}`);
      });
    } catch (error) {
      console.warn(`[SubmittedState] Could not show notification:`, error);
    }
  }

  /**
   * Store failed payload for retry
   * @param {Object} payload - The payload that failed
   */
  async storeFailedPayload(payload) {
    try {
      const result = await chrome.storage.local.get('failedSubmissions');
      const failed = result.failedSubmissions || [];
      failed.push({
        sessionId: this.session.sessionId,
        payload: payload,
        timestamp: Date.now(),
        retryCount: 0
      });
      await chrome.storage.local.set({ failedSubmissions: failed });
      console.log(`[SubmittedState] Failed payload stored for retry`);
    } catch (error) {
      console.warn(`[SubmittedState] Could not store failed payload:`, error);
    }
  }

  /**
   * Get authentication token
   * @returns {string|null} Auth token
   */
  async getAuthToken() {
    try {
      const result = await chrome.storage.local.get('access_token');
      return result.access_token || null;
    } catch (error) {
      console.warn(`[SubmittedState] Could not get auth token:`, error);
      return null;
    }
  }

  /**
   * Clean up session resources
   */
  cleanup() {
    if (this.cleanupDone) return;
    this.cleanupDone = true;

    console.log(`[SubmittedState] 🧹 Cleaning up session: ${this.session.sessionId}`);

    // Clear any timers
    if (this.session.timers) {
      if (this.session.timers.inactivityTimeout) {
        clearInterval(this.session.timers.inactivityTimeout);
        this.session.timers.inactivityTimeout = null;
      }
      if (this.session.timers.sessionTimeout) {
        clearTimeout(this.session.timers.sessionTimeout);
        this.session.timers.sessionTimeout = null;
      }
    }

    // Remove from active sessions
    try {
      this.session.cleanupCallback?.();
    } catch (error) {
      console.warn(`[SubmittedState] Cleanup callback error:`, error);
    }

    console.log(`[SubmittedState] ✅ Session cleaned up`);
  }

  /**
   * Calculate total time taken
   * @returns {string} Human-readable time
   */
  calculateTotalTime() {
    if (!this.session.startedAt) return 'Unknown';
    if (!this.session.submittedAt) return 'In progress';

    const diffMs = this.session.submittedAt - this.session.startedAt;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);

    if (diffMin < 1) {
      return `${diffSec} seconds`;
    } else if (diffMin < 60) {
      return `${diffMin} minute${diffMin > 1 ? 's' : ''}`;
    } else {
      const hours = Math.floor(diffMin / 60);
      const minutes = diffMin % 60;
      return `${hours}h ${minutes}m`;
    }
  }

  /**
   * Get state description for display
   * @returns {string} State description
   */
  getDescription() {
    const timeStr = this.calculateTotalTime();
    const urlCount = this.session.visitedUrls ? this.session.visitedUrls.length : 0;
    const jobIdCount = this.session.jobIds ? Object.keys(this.session.jobIds).length : 0;
    return `Application submitted successfully (${timeStr}, ${urlCount} URLs, ${jobIdCount} job IDs)`;
  }

  /**
   * Check if state is terminal
   * @returns {boolean} True (terminal state)
   */
  isTerminal() {
    return true;
  }
}

export default SubmittedState;