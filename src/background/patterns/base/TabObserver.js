// src/background/patterns/base/TabObserver.js

/**
 * Base Tab Observer
 * All tab observers must extend this class
 *
 * This implements the Observer Pattern:
 * - Observers listen for tab events (created, updated, removed)
 * - They notify subscribers when events occur
 * - Decouples event sources from event handlers
 */
export class TabObserver {
  constructor() {
    // List of subscribed observers (callbacks)
    this.subscribers = [];

    // Event handlers registered for specific event types
    this.eventHandlers = {};

    // Whether this observer is active
    this.isActive = false;

    // Name of the observer for debugging
    this.name = 'base_observer';
  }

  /**
   * Start observing
   * Should be overridden by child classes to set up Chrome API listeners
   */
  startObserving() {
    this.isActive = true;
    console.log(`[TabObserver] ${this.name} started`);
  }

  /**
   * Stop observing
   * Should be overridden by child classes to remove Chrome API listeners
   */
  stopObserving() {
    this.isActive = false;
    console.log(`[TabObserver] ${this.name} stopped`);
  }

  /**
   * Subscribe an observer callback
   * @param {Function} callback - Function to call when events occur
   * @returns {string} Subscription ID for unsubscribing
   */
  subscribe(callback) {
    const id = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    this.subscribers.push({
      id: id,
      callback: callback
    });
    return id;
  }

  /**
   * Unsubscribe an observer
   * @param {string} subscriptionId - ID returned from subscribe()
   * @returns {boolean} True if unsubscribed successfully
   */
  unsubscribe(subscriptionId) {
    const index = this.subscribers.findIndex(s => s.id === subscriptionId);
    if (index > -1) {
      this.subscribers.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Register an event handler for a specific event type
   * @param {string} eventType - Type of event (e.g., 'TAB_CREATED')
   * @param {Function} handler - Function to handle the event
   */
  registerEventHandler(eventType, handler) {
    if (!this.eventHandlers[eventType]) {
      this.eventHandlers[eventType] = [];
    }
    this.eventHandlers[eventType].push(handler);
  }

  /**
   * Remove an event handler
   * @param {string} eventType - Type of event
   * @param {Function} handler - Handler to remove
   */
  removeEventHandler(eventType, handler) {
    if (this.eventHandlers[eventType]) {
      this.eventHandlers[eventType] = this.eventHandlers[eventType]
        .filter(h => h !== handler);
    }
  }

  /**
   * Dispatch an event to all subscribers and handlers
   * @param {Object} event - Event object
   * @param {string} event.type - Event type
   * @param {*} event.data - Event data
   */
  dispatch(event) {
    if (!this.isActive) return;

    // Call registered handlers for this event type
    const handlers = this.eventHandlers[event.type] || [];
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (error) {
        console.error(`[TabObserver] Error in event handler for ${event.type}:`, error);
      }
    }

    // Notify all subscribers
    for (const subscriber of this.subscribers) {
      try {
        subscriber.callback(event);
      } catch (error) {
        console.error(`[TabObserver] Error in subscriber for ${event.type}:`, error);
      }
    }
  }

  /**
   * Get all registered event types
   * @returns {string[]} Array of event types
   */
  getEventTypes() {
    return Object.keys(this.eventHandlers);
  }

  /**
   * Get subscriber count
   * @returns {number} Number of subscribers
   */
  getSubscriberCount() {
    return this.subscribers.length;
  }

  /**
   * Clear all subscribers and handlers
   */
  clear() {
    this.subscribers = [];
    this.eventHandlers = {};
  }

  /**
   * Check if observer is active
   * @returns {boolean} True if active
   */
  isObserving() {
    return this.isActive;
  }
}

export default TabObserver;