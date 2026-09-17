// src/background/patterns/states/InProgressState.js

import { SessionState } from '../base/SessionState.js';
import { SubmittedState } from './SubmittedState.js';
import { AbandonedState } from './AbandonedState.js';

/**
 * In Progress State
 *
 * Represents the state when the user is actively filling out the application form
 * on the external ATS (Greenhouse, Lever, Workday, etc.).
 *
 * This is the main state where most of the application flow happens:
 * - The user is on the external site
 * - Multiple steps may be involved (personal info, resume upload, questions, review)
 * - The strategy detects which step the user is on
 * - Progress is tracked through the step detection
 *
 * Transitions to:
 * - SubmittedState: When the user successfully submits the application
 * - AbandonedState: If the user closes the tab or times out
 *
 * In this state:
 * - The user is actively filling out the application
 * - Steps are being tracked and logged
 * - The session continues to monitor the tab
 * - The strategy detects when the user reaches the success page
 */
export class InProgressState extends SessionState {
  constructor(session) {
    super(session);
    this.name = 'in_progress';
    this.lastStepDetected = null;
    this.stepDetectionCount = 0;
    this.inactivityCount = 0;
    this.maxInactivityCount = 600; // 10 minutes of no activity (600 seconds)
  }

  /**
   * Called when entering this state
   */
  onEnter() {
    super.onEnter();
    console.log(`[InProgressState] 📝 User is filling out application for: ${this.session.jobTitle}`);
    console.log(`[InProgressState]   ATS: ${this.session.atsName || 'Unknown'}`);
    console.log(`[InProgressState]   Current step: ${this.session.stepCount || 0}`);

    // Update session status
    this.session.status = 'in_progress';
    this.session.lastActivityAt = Date.now();

    // Start monitoring for user activity
    this.startInactivityTimer();
  }

  /**
   * Called when exiting this state
   */
  onExit() {
    super.onExit();
    this.clearInactivityTimer();
    console.log(`[InProgressState] Exiting state for: ${this.session.jobTitle}`);
    console.log(`[InProgressState]   Steps completed: ${this.session.stepCount}`);
  }

  /**
   * Handle events in this state
   * @param {Object} event - The event to handle
   * @returns {boolean} True if the event was handled
   */
  handleEvent(event) {
    console.log(`[InProgressState] Handling event: ${event.type}`);

    switch (event.type) {
      case 'TAB_UPDATED':
        return this.handleTabUpdated(event);

      case 'TAB_LOADED':
        return this.handleTabLoaded(event);

      case 'TAB_REMOVED':
        return this.handleTabRemoved(event);

      case 'STEP_DETECTED':
        return this.handleStepDetected(event);

      case 'SUBMISSION_DETECTED':
        return this.handleSubmissionDetected(event);

      case 'USER_ACTIVITY':
        return this.handleUserActivity(event);

      case 'INACTIVITY':
        return this.handleInactivity(event);

      default:
        return false;
    }
  }

  /**
   * Handle tab update event
   */
  async handleTabUpdated(event) {
    console.log(`[InProgressState] Tab updated: ${event.tabId}`);

    // Reset inactivity counter
    this.inactivityCount = 0;
    this.session.lastActivityAt = Date.now();

    // Use the strategy to detect the current step
    const strategy = this.session.atsStrategy;
    if (strategy) {
      const stepResult = strategy.detectStep(event.url, event.tab?.title || '');

      if (stepResult.step !== 'unknown') {
        // Check if it's a success step
        if (stepResult.step === 'success') {
          // Transition to SubmittedState
          const submittedState = new SubmittedState(this.session);
          this.transitionTo(submittedState);
          return true;
        }

        // Record the step
        this.recordStep(stepResult);
      }

      // Check if it's a success page
      if (strategy.isSuccessPage(event.url)) {
        const submittedState = new SubmittedState(this.session);
        this.transitionTo(submittedState);
        return true;
      }
    }

    return true;
  }

  /**
   * Handle tab loaded event
   */
  async handleTabLoaded(event) {
    console.log(`[InProgressState] Tab loaded: ${event.tabId}`);

    // Reset inactivity counter
    this.inactivityCount = 0;
    this.session.lastActivityAt = Date.now();

    // Re-evaluate the step
    const strategy = this.session.atsStrategy;
    if (strategy) {
      const stepResult = strategy.detectStep(event.url, event.tab?.title || '');

      if (stepResult.step !== 'unknown') {
        if (stepResult.step === 'success') {
          const submittedState = new SubmittedState(this.session);
          this.transitionTo(submittedState);
          return true;
        }

        this.recordStep(stepResult);
      }
    }

    return true;
  }

  /**
   * Handle tab removed event
   */
  async handleTabRemoved(event) {
    console.log(`[InProgressState] ❌ Tab removed during application: ${event.tabId}`);
    console.log(`[InProgressState]   Job: ${this.session.jobTitle}`);

    // Transition to AbandonedState
    const abandonedState = new AbandonedState(this.session, 'tab_closed_during_application');
    this.transitionTo(abandonedState);
    return true;
  }

  /**
   * Handle step detected event
   */
  async handleStepDetected(event) {
    console.log(`[InProgressState] Step detected: ${event.step}`);
    this.recordStep(event);
    return true;
  }

  /**
   * Handle submission detected event
   */
  async handleSubmissionDetected(event) {
    console.log(`[InProgressState] 🎉 Submission detected for: ${this.session.jobTitle}`);
    const submittedState = new SubmittedState(this.session);
    this.transitionTo(submittedState);
    return true;
  }

  /**
   * Handle user activity event
   */
  handleUserActivity(event) {
    console.log(`[InProgressState] User activity detected`);
    this.inactivityCount = 0;
    this.session.lastActivityAt = Date.now();
    return true;
  }

  /**
   * Handle inactivity event
   */
  async handleInactivity(event) {
    this.inactivityCount++;
    console.log(`[InProgressState] ⚠️ Inactivity count: ${this.inactivityCount}/${this.maxInactivityCount}`);

    if (this.inactivityCount >= this.maxInactivityCount) {
      console.log(`[InProgressState] ⏰ User inactive for ${this.maxInactivityCount / 60} minutes`);
      console.log(`[InProgressState]   Job: ${this.session.jobTitle}`);

      // ✅ Stop the timer FIRST to prevent looping
      this.clearInactivityTimer();

      // ✅ Use direct import instead of registry
      const abandonedState = new AbandonedState(this.session, 'inactivity');
      this.transitionTo(abandonedState);
      return true;
    }

    return true;
  }

  /**
   * Record a step in the session
   * @param {Object} stepResult - The step result from the strategy
   */
  recordStep(stepResult) {
    // Prevent duplicate step recording
    const stepKey = `${stepResult.step}_${stepResult.matchedPattern || ''}`;
    if (this.lastStepDetected === stepKey) {
      return;
    }

    this.lastStepDetected = stepKey;
    this.stepDetectionCount++;

    // Add step to session
    this.session.steps.push({
      step: stepResult.step,
      label: stepResult.label,
      pattern: stepResult.pattern || 'unknown',
      matchedPattern: stepResult.matchedPattern || null,
      timestamp: Date.now(),
      detectionCount: this.stepDetectionCount
    });

    this.session.stepCount = this.session.steps.length;
    this.session.lastActivityAt = Date.now();

    console.log(`[InProgressState] 📄 Step ${this.session.stepCount}: ${stepResult.label}`);
    console.log(`[InProgressState]   Pattern: ${stepResult.pattern || 'unknown'}`);
  }

  /**
   * Get allowed transitions from this state
   * @returns {string[]} Allowed state names
   */
  getAllowedTransitions() {
    return ['submitted', 'abandoned'];
  }

  /**
   * Get the state timeout (30 minutes)
   * @returns {number} Timeout in milliseconds
   */
  getTimeout() {
    return 1800000; // 30 minutes
  }

  /**
   * Start the inactivity timer
   */
  startInactivityTimer() {
    this.clearInactivityTimer();

    this.session.timers.inactivityTimeout = setInterval(() => {
      this.handleEvent({ type: 'INACTIVITY' });
    }, 1000); // Check every second
  }

  /**
   * Clear the inactivity timer
   */
  clearInactivityTimer() {
    if (this.session.timers.inactivityTimeout) {
      clearInterval(this.session.timers.inactivityTimeout);
      this.session.timers.inactivityTimeout = null;
    }
  }

  /**
   * Get state description for display
   * @returns {string} State description
   */
  getDescription() {
    const stepInfo = this.session.stepCount > 0
      ? `Step ${this.session.stepCount} - ${this.session.steps[this.session.steps.length - 1]?.label || 'In progress'}`
      : 'Application in progress';
    return stepInfo;
  }

  /**
   * Get progress percentage
   * @returns {number} Progress percentage (0-100)
   */
  getProgress() {
    // If we have steps, calculate progress based on step count
    if (this.session.steps.length > 0) {
      // Estimate total steps (usually 4-5 for most ATS)
      const estimatedTotalSteps = 5;
      return Math.min(90, (this.session.steps.length / estimatedTotalSteps) * 100);
    }
    return 10; // Starting point
  }
}

export default InProgressState;