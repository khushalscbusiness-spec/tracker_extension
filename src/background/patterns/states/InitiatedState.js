// src/background/patterns/states/InitiatedState.js

import { SessionState } from '../base/SessionState.js';

/**
 * Initiated State
 *
 * Initial state when a session is first created.
 * This state represents the moment when the user clicks "Apply" on LinkedIn.
 *
 * Transitions to:
 * - RedirectingState: When a new tab is created (URL change detected)
 * - AbandonedState: If the session times out without redirection
 *
 * In this state:
 * - Session is created with job data and apply URL
 * - No external tab has been opened yet (or not detected yet)
 * - Timer starts to prevent orphaned sessions
 */
export class InitiatedState extends SessionState {
  constructor(session) {
    super(session);
    this.name = 'initiated';
  }

  /**
   * Called when entering this state
   */
  onEnter() {
    super.onEnter();
    console.log(`[InitiatedState] Session initiated for: ${this.session.jobTitle}`);
    console.log(`[InitiatedState]   Job ID: ${this.session.jobId}`);
    console.log(`[InitiatedState]   Redirect URL: ${this.session.redirectUrl}`);

    // Set the initial status
    this.session.status = 'initiated';

    // Initialize steps tracking
    this.session.steps = [];
    this.session.stepCount = 0;

    // Start the timeout timer (5 minutes)
    this.startTimeoutTimer(300000); // 5 minutes
  }

  /**
   * Called when exiting this state
   */
  onExit() {
    super.onExit();
    this.clearTimeoutTimer();
    console.log(`[InitiatedState] Exiting state for: ${this.session.jobTitle}`);
  }

  /**
   * Handle events in this state
   * @param {Object} event - The event to handle
   * @returns {boolean} True if the event was handled
   */
  handleEvent(event) {
    console.log(`[InitiatedState] Handling event: ${event.type}`);

    switch (event.type) {
      case 'TAB_CREATED':
        return this.handleTabCreated(event);

      case 'TAB_UPDATED':
        return this.handleTabUpdated(event);

      case 'TIMEOUT':
        return this.handleTimeout(event);

      default:
        return false;
    }
  }

  /**
   * Handle tab creation event
   */
  async handleTabCreated(event) {
    console.log(`[InitiatedState] Tab created: ${event.tabId}`);

    // If the tab has a URL matching our redirect URL
    if (event.tab && event.tab.url && event.tab.url.includes(this.session.redirectUrl)) {
      // Transition to RedirectingState
      const { RedirectingState } = await import('./RedirectingState.js');
      const redirectingState = new RedirectingState(this.session);
      this.transitionTo(redirectingState);
      return true;
    }

    // Tab created but URL doesn't match yet - still in initiated state
    return true;
  }

  /**
   * Handle tab update event
   */
  async handleTabUpdated(event) {
    console.log(`[InitiatedState] Tab updated: ${event.tabId}`);

    // If the URL matches our redirect URL
    if (event.url && event.url.includes(this.session.redirectUrl)) {
      // Transition to RedirectingState
      const { RedirectingState } = await import('./RedirectingState.js');
      const redirectingState = new RedirectingState(this.session);
      this.transitionTo(redirectingState);
      return true;
    }

    return true;
  }

  /**
   * Handle timeout event
   */
  async handleTimeout(event) {
    console.log(`[InitiatedState] ⏰ Session timed out waiting for redirect`);
    console.log(`[InitiatedState]   Job: ${this.session.jobTitle}`);

    // Transition to AbandonedState
    const { AbandonedState } = await import('./AbandonedState.js');
    const abandonedState = new AbandonedState(this.session, 'timeout');
    this.transitionTo(abandonedState);
    return true;
  }

  /**
   * Get allowed transitions from this state
   * @returns {string[]} Allowed state names
   */
  getAllowedTransitions() {
    return ['redirecting', 'abandoned'];
  }

  /**
   * Get the state timeout (5 minutes)
   * @returns {number} Timeout in milliseconds
   */
  getTimeout() {
    return 300000; // 5 minutes
  }

  /**
   * Start the timeout timer
   * @param {number} timeoutMs - Timeout in milliseconds
   */
  startTimeoutTimer(timeoutMs) {
    this.clearTimeoutTimer();

    this.session.timers.sessionTimeout = setTimeout(() => {
      this.handleEvent({ type: 'TIMEOUT' });
    }, timeoutMs);
  }

  /**
   * Clear the timeout timer
   */
  clearTimeoutTimer() {
    if (this.session.timers.sessionTimeout) {
      clearTimeout(this.session.timers.sessionTimeout);
      this.session.timers.sessionTimeout = null;
    }
  }

  /**
   * Get state description for display
   * @returns {string} State description
   */
  getDescription() {
    return 'Application initiated - waiting for redirect';
  }

  /**
   * Check if the user is still in this state
   * @returns {boolean} True if still in state
   */
  isStillInState() {
    // Check if there's a tab with our redirect URL
    return chrome.tabs.query({
      url: `${this.session.redirectUrl}*`
    });
  }
}

export default InitiatedState;