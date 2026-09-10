// src/background/patterns/observers/TabRemovedObserver.js

import { TabObserver } from '../base/TabObserver.js';

/**
 * Tab Removed Observer
 *
 * Observes when tabs are closed/removed in the browser.
 * This is used to detect when the user closes the external ATS tab
 * before submitting the application.
 *
 * This implements the Observer Pattern:
 * - Listens for chrome.tabs.onRemoved events
 * - Dispatches TAB_REMOVED events to all subscribers
 * - Determines if the removed tab was part of an application flow
 *
 * When a tab is removed:
 * - Checks if it was the external ATS tab (redirect tab)
 * - Checks if it was the LinkedIn source tab
 * - Dispatches appropriate events for session management
 * - SessionManager can transition to AbandonedState if needed
 */
export class TabRemovedObserver extends TabObserver {
  constructor() {
    super();
    this.name = 'tab_removed_observer';
    this.isActive = false;
    this.processedRemovals = new Set(); // Track processed removals
    this.removeInfoCache = new Map(); // Cache remove info
  }

  /**
   * Start observing tab removal events
   */
  startObserving() {
    if (this.isActive) {
      console.log('[TabRemovedObserver] Already observing');
      return;
    }

    console.log('[TabRemovedObserver] Starting observation...');
    this.isActive = true;

    // Add the listener
    chrome.tabs.onRemoved.addListener(this.handleTabRemoved.bind(this));

    console.log('[TabRemovedObserver] ✅ Started observing');
  }

  /**
   * Stop observing tab removal events
   */
  stopObserving() {
    if (!this.isActive) {
      console.log('[TabRemovedObserver] Not observing');
      return;
    }

    console.log('[TabRemovedObserver] Stopping observation...');

    // Remove the listener
    chrome.tabs.onRemoved.removeListener(this.handleTabRemoved.bind(this));

    this.isActive = false;
    this.processedRemovals.clear();
    this.removeInfoCache.clear();

    console.log('[TabRemovedObserver] ✅ Stopped observing');
  }

  /**
   * Handle tab removal event
   * @param {number} tabId - The ID of the removed tab
   * @param {Object} removeInfo - Information about the removal
   */
  handleTabRemoved(tabId, removeInfo) {
    // Skip if not active
    if (!this.isActive) return;

    // Prevent duplicate processing
    if (this.processedRemovals.has(tabId)) {
      console.log(`[TabRemovedObserver] Tab ${tabId} removal already processed`);
      return;
    }

    // Mark as processed
    this.processedRemovals.add(tabId);

    // Cache remove info
    this.removeInfoCache.set(tabId, removeInfo);

    console.log(`[TabRemovedObserver] ❌ Tab removed: ${tabId}`);
    console.log(`[TabRemovedObserver]   Window ID: ${removeInfo.windowId}`);
    console.log(`[TabRemovedObserver]   Is window closing: ${removeInfo.isWindowClosing}`);

    // Determine the type of removal
    const removalType = this.determineRemovalType(tabId, removeInfo);
    console.log(`[TabRemovedObserver]   Removal type: ${removalType}`);

    // Dispatch event with details
    this.dispatch({
      type: 'TAB_REMOVED',
      tabId: tabId,
      removeInfo: removeInfo,
      removalType: removalType,
      isWindowClosing: removeInfo.isWindowClosing || false,
      timestamp: Date.now()
    });

    // Clean up after a delay to allow processing
    setTimeout(() => {
      this.processedRemovals.delete(tabId);
      this.removeInfoCache.delete(tabId);
    }, 5000); // 5 second cleanup delay
  }

  /**
   * Determine the type of removal
   * @param {number} tabId - The tab ID
   * @param {Object} removeInfo - The removal info
   * @returns {string} Removal type
   */
  determineRemovalType(tabId, removeInfo) {
    // If the entire window is closing
    if (removeInfo.isWindowClosing) {
      return 'window_closing';
    }

    // Check if the tab was closed by the user
    // We can check if it's a known redirect tab
    try {
      // In some cases, we can infer from context
      // This is a best-effort determination
      return 'tab_closed';
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Check if a tab was removed recently
   * @param {number} tabId - The tab ID
   * @param {number} thresholdMs - Time threshold in milliseconds
   * @returns {boolean} True if removed recently
   */
  wasRecentlyRemoved(tabId, thresholdMs = 5000) {
    // Check if the tab is in the processed removals set
    // This means it was removed within the last 5 seconds
    // (since we clean up after 5 seconds)
    return this.processedRemovals.has(tabId);
  }

  /**
   * Get the removal info for a tab
   * @param {number} tabId - The tab ID
   * @returns {Object|null} Removal info or null
   */
  getRemovalInfo(tabId) {
    return this.removeInfoCache.get(tabId) || null;
  }

  /**
   * Check if a tab was removed due to window closing
   * @param {number} tabId - The tab ID
   * @returns {boolean} True if window closing
   */
  isWindowClosing(tabId) {
    const info = this.getRemovalInfo(tabId);
    return info ? info.isWindowClosing || false : false;
  }

  /**
   * Get the number of processed removals
   * @returns {number} Processed removal count
   */
  getProcessedRemovalCount() {
    return this.processedRemovals.size;
  }

  /**
   * Reset processed removals
   */
  resetProcessedRemovals() {
    this.processedRemovals.clear();
    this.removeInfoCache.clear();
    console.log('[TabRemovedObserver] Reset processed removals');
  }

  /**
   * Check if a tab ID is being tracked
   * @param {number} tabId - The tab ID
   * @returns {boolean} True if tracked
   */
  isTabTracked(tabId) {
    return this.processedRemovals.has(tabId);
  }

  /**
   * Get all processed removal IDs
   * @returns {number[]} Array of processed tab IDs
   */
  getProcessedRemovalIds() {
    return Array.from(this.processedRemovals);
  }

  /**
   * Clear a specific tab from cache
   * @param {number} tabId - The tab ID
   */
  clearTabFromCache(tabId) {
    this.processedRemovals.delete(tabId);
    this.removeInfoCache.delete(tabId);
    console.log(`[TabRemovedObserver] Cleared tab ${tabId} from cache`);
  }

  /**
   * Clean up old processed removals
   */
  cleanupOldRemovals() {
    // Keep only last 100 processed removals
    if (this.processedRemovals.size > 100) {
      const entries = Array.from(this.processedRemovals);
      const toRemove = entries.slice(0, this.processedRemovals.size - 100);
      for (const id of toRemove) {
        this.processedRemovals.delete(id);
        this.removeInfoCache.delete(id);
      }
      console.log(`[TabRemovedObserver] Cleaned up old removals, kept ${this.processedRemovals.size}`);
    }
  }

  /**
   * Get removal statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      totalProcessed: this.processedRemovals.size,
      cacheSize: this.removeInfoCache.size,
      isActive: this.isActive,
      windowClosingCount: Array.from(this.removeInfoCache.values())
        .filter(info => info.isWindowClosing).length
    };
  }
}

// Export singleton instance
const tabRemovedObserver = new TabRemovedObserver();
export default tabRemovedObserver;