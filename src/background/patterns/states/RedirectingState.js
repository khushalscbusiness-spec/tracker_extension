// src/background/patterns/states/RedirectingState.js

import { SessionState } from '../base/SessionState.js';

/**
 * Redirecting State
 *
 * Represents the state when the user is being redirected to the external ATS.
 * The external tab is open but the application page hasn't fully loaded yet.
 *
 * Transitions to:
 * - InProgressState: When the external page loads and steps are detected
 * - SubmittedState: When the success page is detected directly from redirect
 * - AbandonedState: If the user closes the tab or times out
 *
 * In this state:
 * - The external tab is created and loading
 * - The session tracks the tab ID
 * - Waiting for the application page to load
 */
export class RedirectingState extends SessionState {
  constructor(session) {
    super(session);
    this.name = 'redirecting';
    this.loadAttempts = 0;
    this.maxLoadAttempts = 10;
  }

  /**
   * Called when entering this state
   */
  onEnter() {
    super.onEnter();
    console.log(`[RedirectingState] 🚀 Redirecting for: ${this.session.jobTitle}`);
    console.log(`[RedirectingState]   Redirect URL: ${this.session.redirectUrl}`);

    // Update session status
    this.session.status = 'redirecting';
    this.session.redirectedAt = Date.now();

    // Start monitoring the external tab
    this.startTabMonitoring();
  }

  /**
   * Called when exiting this state
   */
  onExit() {
    super.onExit();
    console.log(`[RedirectingState] Exiting state for: ${this.session.jobTitle}`);
  }

  /**
   * Handle events in this state
   * @param {Object} event - The event to handle
   * @returns {boolean} True if the event was handled
   */
  handleEvent(event) {
    console.log(`[RedirectingState] Handling event: ${event.type}`);

    switch (event.type) {
      case 'TAB_LOADED':
        return this.handleTabLoaded(event);

      case 'TAB_UPDATED':
        return this.handleTabUpdated(event);

      case 'TAB_REMOVED':
        return this.handleTabRemoved(event);

      case 'STEP_DETECTED':
        return this.handleStepDetected(event);

      case 'TIMEOUT':
        return this.handleTimeout(event);

      default:
        return false;
    }
  }

  /**
   * Handle tab loaded event
   */
  async handleTabLoaded(event) {
    console.log(`[RedirectingState] Tab loaded: ${event.tabId}`);
    console.log(`[RedirectingState]   URL: ${event.url}`);

    this.loadAttempts++;

    const strategy = this.session.atsStrategy;
    if (strategy) {
      // ✅ Check if it's a success page directly
      if (strategy.isSuccessPage(event.url)) {
        console.log('[RedirectingState] 🎉 Success page detected on load!');
        const { InProgressState } = await import('./InProgressState.js');
        const inProgressState = new InProgressState(this.session);
        this.transitionTo(inProgressState);

        // Immediately transition to SubmittedState
        const { SubmittedState } = await import('./SubmittedState.js');
        const submittedState = new SubmittedState(this.session);
        inProgressState.transitionTo(submittedState);
        return true;
      }

      const step = strategy.detectStep(event.url, event.tab?.title || '');
      if (step.step !== 'unknown') {
        console.log(`[RedirectingState] Step detected on load: ${step.step}`);
        const { InProgressState } = await import('./InProgressState.js');
        const inProgressState = new InProgressState(this.session);
        this.transitionTo(inProgressState);

        // If it's already a success step, transition to SubmittedState
        if (step.step === 'success') {
          const { SubmittedState } = await import('./SubmittedState.js');
          const submittedState = new SubmittedState(this.session);
          inProgressState.transitionTo(submittedState);
          return true;
        }
        return true;
      }
    }

    // If we've loaded too many times without detecting a step
    if (this.loadAttempts >= this.maxLoadAttempts) {
      console.log('[RedirectingState] Max load attempts reached, transitioning to InProgress');
      const { InProgressState } = await import('./InProgressState.js');
      const inProgressState = new InProgressState(this.session);
      this.transitionTo(inProgressState);
      return true;
    }

    return true;
  }

  /**
   * Handle tab update event
   */
  async handleTabUpdated(event) {
    console.log(`[RedirectingState] Tab updated: ${event.tabId}`);
    console.log(`[RedirectingState]   URL: ${event.url}`);

    const strategy = this.session.atsStrategy;
    if (strategy) {
      // ✅ Check if it's a success page directly
      if (strategy.isSuccessPage(event.url)) {
        console.log('[RedirectingState] 🎉 Success page detected during update!');
        const { InProgressState } = await import('./InProgressState.js');
        const inProgressState = new InProgressState(this.session);
        this.transitionTo(inProgressState);

        const { SubmittedState } = await import('./SubmittedState.js');
        const submittedState = new SubmittedState(this.session);
        inProgressState.transitionTo(submittedState);
        return true;
      }

      const step = strategy.detectStep(event.url, event.tab?.title || '');
      if (step.step !== 'unknown') {
        console.log(`[RedirectingState] Step detected on update: ${step.step}`);
        const { InProgressState } = await import('./InProgressState.js');
        const inProgressState = new InProgressState(this.session);
        this.transitionTo(inProgressState);

        if (step.step === 'success') {
          const { SubmittedState } = await import('./SubmittedState.js');
          const submittedState = new SubmittedState(this.session);
          inProgressState.transitionTo(submittedState);
          return true;
        }
        return true;
      }
    }

    return true;
  }

  /**
   * Handle tab removed event
   */
  async handleTabRemoved(event) {
    console.log(`[RedirectingState] ❌ Tab removed: ${event.tabId}`);
    console.log(`[RedirectingState]   Job: ${this.session.jobTitle}`);

    const { AbandonedState } = await import('./AbandonedState.js');
    const abandonedState = new AbandonedState(this.session, 'tab_closed_before_load');
    this.transitionTo(abandonedState);
    return true;
  }

  /**
   * Handle step detected event
   */
  async handleStepDetected(event) {
    console.log(`[RedirectingState] Step detected: ${event.step}`);

    const { InProgressState } = await import('./InProgressState.js');
    const inProgressState = new InProgressState(this.session);
    this.transitionTo(inProgressState);

    if (event.step === 'success') {
      const { SubmittedState } = await import('./SubmittedState.js');
      const submittedState = new SubmittedState(this.session);
      inProgressState.transitionTo(submittedState);
      return true;
    }
    return true;
  }

  /**
   * Handle timeout event
   */
  async handleTimeout(event) {
    console.log(`[RedirectingState] ⏰ Redirection timed out for: ${this.session.jobTitle}`);

    const { AbandonedState } = await import('./AbandonedState.js');
    const abandonedState = new AbandonedState(this.session, 'timeout_during_redirect');
    this.transitionTo(abandonedState);
    return true;
  }

  /**
   * Get allowed transitions from this state
   * @returns {string[]} Allowed state names
   */
  getAllowedTransitions() {
    return ['in_progress', 'submitted', 'abandoned'];
  }

  /**
   * Get the state timeout (30 seconds)
   * @returns {number} Timeout in milliseconds
   */
  getTimeout() {
    return 30000; // 30 seconds
  }

  /**
   * Start monitoring the external tab
   */
  startTabMonitoring() {
    console.log(`[RedirectingState] Starting tab monitoring`);

    // Set up a timeout to check if tab loads
    setTimeout(async () => {
      try {
        const tab = await chrome.tabs.get(this.session.redirectTabId);
        if (tab) {
          console.log(`[RedirectingState] Tab exists: ${tab.id}`);
        }
      } catch (error) {
        console.log(`[RedirectingState] Tab no longer exists: ${this.session.redirectTabId}`);
        const { AbandonedState } = await import('./AbandonedState.js');
        const abandonedState = new AbandonedState(this.session, 'tab_not_found');
        this.transitionTo(abandonedState);
      }
    }, 5000);
  }
}

export default RedirectingState;