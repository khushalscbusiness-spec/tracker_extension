// src/background/patterns/states/AbandonedState.js

import { SessionState } from '../base/SessionState.js';

/**
 * Abandoned State
 *
 * Represents the state when the user abandons the application process.
 *
 * This state is reached when:
 * - User closes the external tab before submitting
 * - The session times out due to inactivity
 * - Redirection fails or times out
 * - User navigates away from the application page
 *
 * In this state:
 * - The session is marked as abandoned
 * - The abandonment reason is recorded
 * - Cleanup is performed
 * - No payload is sent to the backend
 * - An optional notification can be shown
 *
 * Transitions to:
 * - None (terminal state - session is complete)
 */
export class AbandonedState extends SessionState {
  constructor(session, reason) {
    super(session);
    this.name = 'abandoned';
    this.abandonReason = reason || 'unknown';
    this.cleanupDone = false;
  }

  /**
   * Called when entering this state
   */
  onEnter() {
    super.onEnter();
    console.log('========================================');
    console.log(`[AbandonedState] ❌ APPLICATION ABANDONED`);
    console.log('========================================');
    console.log(`[AbandonedState]   Job: ${this.session.jobTitle}`);
    console.log(`[AbandonedState]   Company: ${this.session.company}`);
    console.log(`[AbandonedState]   Reason: ${this.abandonReason}`);
    console.log(`[AbandonedState]   Steps completed: ${this.session.stepCount}`);
    console.log(`[AbandonedState]   Time elapsed: ${this.calculateElapsedTime()}`);
    console.log('========================================');

    // Update session status
    this.session.status = 'abandoned';
    this.session.abandonedAt = Date.now();
    this.session.abandonReason = this.abandonReason;
    this.session.completedAt = Date.now();

    // Log abandonment details
    this.logAbandonment();

    // Clean up
    this.cleanup();
  }

  /**
   * Called when exiting this state
   */
  onExit() {
    super.onExit();
    console.log(`[AbandonedState] Exiting state for: ${this.session.jobTitle}`);
  }

  /**
   * Handle events in this state
   * (No transitions from this state - it's terminal)
   * @param {Object} event - The event to handle
   * @returns {boolean} True if the event was handled
   */
  handleEvent(event) {
    console.log(`[AbandonedState] Received event (ignoring): ${event.type}`);
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
   * Log abandonment details
   */
  logAbandonment() {
    // Get the abandonment reason description
    const reasonMap = {
      'timeout': 'Session timed out',
      'inactivity': 'User inactive for too long',
      'tab_closed': 'User closed the tab',
      'tab_closed_before_load': 'User closed the tab before page loaded',
      'tab_closed_during_application': 'User closed the tab during application',
      'tab_not_found': 'Redirect tab not found',
      'timeout_during_redirect': 'Redirection timed out',
      'navigation': 'User navigated away',
      'unknown': 'Unknown reason'
    };

    const reasonText = reasonMap[this.abandonReason] || this.abandonReason;

    console.log(`[AbandonedState] 📋 Abandonment details:`);
    console.log(`[AbandonedState]   Reason: ${reasonText}`);
    console.log(`[AbandonedState]   Time: ${new Date(this.session.abandonedAt).toLocaleString()}`);
    console.log(`[AbandonedState]   Steps completed: ${this.session.stepCount}`);

    // Store abandonment data
    this.storeAbandonmentData();
  }

  /**
   * Store abandonment data for analysis
   */
  async storeAbandonmentData() {
    try {
      const abandonmentData = {
        sessionId: this.session.sessionId,
        jobId: this.session.jobId,
        jobTitle: this.session.jobTitle,
        company: this.session.company,
        ats: this.session.ats,
        stepsCompleted: this.session.stepCount,
        startedAt: this.session.startedAt,
        abandonedAt: this.session.abandonedAt,
        reason: this.abandonReason,
        elapsedSeconds: Math.round((this.session.abandonedAt - this.session.startedAt) / 1000)
      };

      // Store in local storage for analysis
      const result = await chrome.storage.local.get('abandonedSessions');
      const abandoned = result.abandonedSessions || [];
      abandoned.push(abandonmentData);

      // Keep only last 100 to avoid storage limits
      if (abandoned.length > 100) {
        abandoned.shift();
      }

      await chrome.storage.local.set({ abandonedSessions: abandoned });
      console.log(`[AbandonedState] Abandonment data stored`);
    } catch (error) {
      console.warn(`[AbandonedState] Could not store abandonment data:`, error);
    }
  }

  /**
   * Clean up session resources
   */
  cleanup() {
    if (this.cleanupDone) return;
    this.cleanupDone = true;

    console.log(`[AbandonedState] 🧹 Cleaning up session: ${this.session.sessionId}`);

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
      console.warn(`[AbandonedState] Cleanup callback error:`, error);
    }

    console.log(`[AbandonedState] ✅ Session cleaned up`);
  }

  /**
   * Calculate elapsed time
   * @returns {string} Human-readable time
   */
  calculateElapsedTime() {
    if (!this.session.startedAt) return 'Unknown';
    if (!this.session.abandonedAt) return 'In progress';

    const diffMs = this.session.abandonedAt - this.session.startedAt;
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
    const reasonMap = {
      'timeout': 'Timed out',
      'inactivity': 'Inactive',
      'tab_closed': 'Tab closed',
      'tab_closed_before_load': 'Tab closed',
      'tab_closed_during_application': 'Tab closed',
      'tab_not_found': 'Tab not found',
      'timeout_during_redirect': 'Redirect timed out',
      'navigation': 'Navigated away',
      'unknown': 'Abandoned'
    };

    const reasonText = reasonMap[this.abandonReason] || this.abandonReason;
    return `Application abandoned: ${reasonText}`;
  }

  /**
   * Check if state is terminal
   * @returns {boolean} True (terminal state)
   */
  isTerminal() {
    return true;
  }

  /**
   * Get the abandonment reason
   * @returns {string} Abandonment reason
   */
  getAbandonReason() {
    return this.abandonReason;
  }

  /**
   * Get human-readable abandonment reason
   * @returns {string} Human-readable reason
   */
  getAbandonReasonText() {
    const reasonMap = {
      'timeout': 'Session timed out',
      'inactivity': 'User was inactive for too long',
      'tab_closed': 'User closed the tab',
      'tab_closed_before_load': 'User closed the tab before it loaded',
      'tab_closed_during_application': 'User closed the tab during the application',
      'tab_not_found': 'Redirect tab could not be found',
      'timeout_during_redirect': 'Redirection took too long',
      'navigation': 'User navigated away from the page',
      'unknown': 'Unknown reason'
    };
    return reasonMap[this.abandonReason] || this.abandonReason;
  }

  /**
   * Check if the abandonment was user-initiated
   * @returns {boolean} True if user-initiated
   */
  isUserInitiated() {
    const userReasons = ['tab_closed', 'tab_closed_before_load', 'tab_closed_during_application', 'navigation'];
    return userReasons.includes(this.abandonReason);
  }

  /**
   * Check if the abandonment was system-initiated
   * @returns {boolean} True if system-initiated
   */
  isSystemInitiated() {
    const systemReasons = ['timeout', 'inactivity', 'timeout_during_redirect', 'tab_not_found'];
    return systemReasons.includes(this.abandonReason);
  }
}

export default AbandonedState;