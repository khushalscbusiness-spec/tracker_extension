// src/background/patterns/states/SubmittedState.js

import { SessionState } from '../base/SessionState.js';
import { receiverAdapter } from '../../adapters/receiver-adapter.js';
import { submitEvent } from '../../api/receiver-api.js';

/**
 * Submitted State
 *
 * Terminal state reached when the application is submitted.
 *
 * Responsibilities:
 *   - Extract the thank-you message
 *   - Delegate payload building to the adapter
 *   - Delegate HTTP to the receiver API client
 *   - Show a notification
 *   - Clean up the session
 *
 * The state does NOT know:
 *   - The shape of the wire payload (adapter's job)
 *   - The receiver's URL or HTTP contract (API client's job)
 */
export class SubmittedState extends SessionState {
  constructor(session) {
    super(session);
    this.name = 'submitted';
    this.payloadSent = false;
    this.notificationShown = false;
    this.cleanupDone = false;
  }

  // ───────────────────────────────────────────────────────────
  // Lifecycle
  // ───────────────────────────────────────────────────────────

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

    this.session.status = 'submitted';
    this.session.submittedAt = Date.now();
    this.session.completedAt = Date.now();

    this.extractThankYouMessage();
    this.buildAndSendPayload();
    this.showNotification();
    this.cleanup();
  }

  onExit() {
    super.onExit();
    console.log(`[SubmittedState] Exiting state for: ${this.session.jobTitle}`);
  }

  handleEvent(event) {
    console.log(`[SubmittedState] Received event (ignoring): ${event.type}`);
    return false;
  }

  getAllowedTransitions() {
    return [];
  }

  getTimeout() {
    return null;
  }

  isTerminal() {
    return true;
  }

  // ───────────────────────────────────────────────────────────
  // Thank you message
  // ───────────────────────────────────────────────────────────

  extractThankYouMessage() {
    if (this.session.thankYouPhrase) {
      console.log(`[SubmittedState] Thank you message: ${this.session.thankYouPhrase}`);
      return;
    }

    const strategy = this.session.atsStrategy;
    if (strategy && this.session.successUrl) {
      const message = strategy.extractThankYouMessage(
        this.session.successUrl,
        null,
        null
      );
      if (message) {
        this.session.thankYouPhrase = message;
        console.log(`[SubmittedState] Extracted thank you: ${message}`);
      }
    }

    if (!this.session.thankYouPhrase) {
      this.session.thankYouPhrase = `Application submitted to ${this.session.company}`;
      console.log(`[SubmittedState] Using default thank you: ${this.session.thankYouPhrase}`);
    }
  }

  // ───────────────────────────────────────────────────────────
  // Payload + send
  // ───────────────────────────────────────────────────────────

  /**
   * Build the payload via the adapter and send it via the API client.
   *
   * The state orchestrates:
   *   1. Ask the adapter for the wire payload
   *   2. Ask the API client to POST it
   *   3. Handle the result (success or failure)
   */
  async buildAndSendPayload() {
    if (this.payloadSent) return;
    this.payloadSent = true;

    console.log(`[SubmittedState] 📤 Building payload for: ${this.session.jobTitle}`);

    // 1. Adapt: session → wire payload
    const payload = receiverAdapter.applicationSubmitted(this.session);
    console.log(`[SubmittedState] Payload:`, JSON.stringify(payload, null, 2));

    // 2. Send via the API client
    try {
      const result = await submitEvent(payload);
      console.log(`[SubmittedState] ✅ Payload sent successfully!`);
      console.log(`[SubmittedState]   Response:`, result);
    } catch (error) {
      console.error(`[SubmittedState] ❌ Failed to send payload:`, error);
      await this.storeFailedPayload(payload);
    }
  }

  // ───────────────────────────────────────────────────────────
  // Notification
  // ───────────────────────────────────────────────────────────

  showNotification() {
    if (this.notificationShown) return;
    this.notificationShown = true;

    const message = `✅ Applied to ${this.session.jobTitle} at ${this.session.company}`;
    const title = '🎉 Application Submitted!';

    console.log(`[SubmittedState] 📢 Notification: ${title} - ${message}`);

    try {
      const iconUrl = chrome.runtime.getURL('icons/icon128.png');

      chrome.notifications.create({
        type: 'basic',
        iconUrl: iconUrl,
        title: title,
        message: message,
        requireInteraction: true,
        buttons: [
          { title: 'View Job' },
          { title: 'Dismiss' }
        ]
      }, (notificationId) => {
        if (chrome.runtime.lastError) {
          console.warn('[SubmittedState] Notification error:', chrome.runtime.lastError.message);
        } else {
          console.log(`[SubmittedState] Notification created: ${notificationId}`);
        }
      });
    } catch (error) {
      console.warn(`[SubmittedState] Could not show notification:`, error);
    }
  }

  // ───────────────────────────────────────────────────────────
  // Failed payload storage (retry queue)
  // ───────────────────────────────────────────────────────────

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

  // ───────────────────────────────────────────────────────────
  // Cleanup
  // ───────────────────────────────────────────────────────────

  cleanup() {
    if (this.cleanupDone) return;
    this.cleanupDone = true;

    console.log(`[SubmittedState] 🧹 Cleaning up session: ${this.session.sessionId}`);

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

    try {
      this.session.cleanupCallback?.();
    } catch (error) {
      console.warn(`[SubmittedState] Cleanup callback error:`, error);
    }

    console.log(`[SubmittedState] ✅ Session cleaned up`);
  }

  // ───────────────────────────────────────────────────────────
  // Display helpers
  // ───────────────────────────────────────────────────────────

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

  getDescription() {
    const timeStr = this.calculateTotalTime();
    const urlCount = this.session.visitedUrls ? this.session.visitedUrls.length : 0;
    const jobIdCount = this.session.jobIds ? Object.keys(this.session.jobIds).length : 0;
    return `Application submitted successfully (${timeStr}, ${urlCount} URLs, ${jobIdCount} job IDs)`;
  }
}

export default SubmittedState;