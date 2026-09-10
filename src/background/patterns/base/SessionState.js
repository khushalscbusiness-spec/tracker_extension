// src/background/patterns/base/SessionState.js

/**
 * Base Session State
 * All session states must extend this class
 *
 * This implements the State Pattern:
 * - Each state represents a different phase in the application flow
 * - States transition based on events (tab creation, URL changes, etc.)
 * - The SessionManager delegates state-specific behavior to the current state
 */
export class SessionState {
  /**
   * @param {Object} session - The session object this state belongs to
   */
  constructor(session) {
    this.session = session;
    this.name = 'base';
    this.enteredAt = null;
    this.exitedAt = null;
  }

  /**
   * Called when entering this state
   * Override in child classes for state-specific initialization
   */
  onEnter() {
    this.enteredAt = Date.now();
    this.session.lastStateChange = this.enteredAt;
    console.log(`[State] Entering: ${this.name} for ${this.session.jobTitle || 'job'}`);
  }

  /**
   * Called when exiting this state
   * Override in child classes for state-specific cleanup
   */
  onExit() {
    this.exitedAt = Date.now();
    console.log(`[State] Exiting: ${this.name} for ${this.session.jobTitle || 'job'}`);
  }

  /**
   * Transition to a new state
   * @param {SessionState} nextState - The next state to transition to
   */
  transitionTo(nextState) {
    this.onExit();
    this.session.state = nextState;
    this.session.currentState = nextState;
    this.session.stateHistory = this.session.stateHistory || [];
    this.session.stateHistory.push({
      from: this.name,
      to: nextState.name,
      timestamp: Date.now()
    });
    nextState.onEnter();

    // Notify session manager of state change
    if (this.session.onStateChange) {
      this.session.onStateChange(this, nextState);
    }
  }

  /**
   * Handle an event in the current state
   * Override in child classes to handle specific events
   * @param {Object} event - The event to handle
   * @param {string} event.type - Type of event
   * @param {*} event.data - Event data
   * @returns {boolean} True if the event was handled
   */
  handleEvent(event) {
    console.log(`[State] ${this.name} received event: ${event.type}`);
    return false;
  }

  /**
   * Get the current state name
   * @returns {string} State name
   */
  getStatus() {
    return this.name;
  }

  /**
   * Check if the state allows a transition to another state
   * @param {string} targetStateName - Name of the target state
   * @returns {boolean} True if transition is allowed
   */
  canTransitionTo(targetStateName) {
    const allowedTransitions = this.getAllowedTransitions();
    return allowedTransitions.includes(targetStateName);
  }

  /**
   * Get allowed transitions from this state
   * Override in child classes to define allowed transitions
   * @returns {string[]} Array of allowed state names
   */
  getAllowedTransitions() {
    return [];
  }

  /**
   * Get the state timeout in milliseconds
   * Override in child classes to define timeout
   * @returns {number|null} Timeout in ms or null for no timeout
   */
  getTimeout() {
    return null;
  }

  /**
   * Check if the state has timed out
   * @returns {boolean} True if the state has timed out
   */
  isTimedOut() {
    const timeout = this.getTimeout();
    if (!timeout || !this.enteredAt) return false;
    return (Date.now() - this.enteredAt) > timeout;
  }

  /**
   * Get state description for display
   * @returns {string} Human-readable state description
   */
  getDescription() {
    return this.name.replace('_', ' ').toUpperCase();
  }
}

export default SessionState;