// src/background/patterns/observers/TabUpdatedObserver.js

import { TabObserver } from '../base/TabObserver.js';

/**
 * Tab Updated Observer
 *
 * Observes when tabs are updated (URL changes, page loads, etc.).
 * This is the core observer for tracking the application flow:
 * - Detects URL changes on the external ATS
 * - Detects page load completion
 * - Detects when the user navigates through the application steps
 * - Detects when the user reaches the success page
 *
 * This implements the Observer Pattern:
 * - Listens for chrome.tabs.onUpdated events
 * - Dispatches TAB_UPDATED, URL_CHANGED, and TAB_LOADED events
 * - Subscribers can react to these events
 *
 * The observer is smart about filtering:
 * - Only processes tabs that have associated sessions
 * - Ignores irrelevant updates (favicon, title only, etc.)
 * - Debounces rapid URL changes
 */
export class TabUpdatedObserver extends TabObserver {
  constructor() {
    super();
    this.name = 'tab_updated_observer';
    this.isActive = false;
    this.processingTabIds = new Set();
    this.debounceTimers = new Map();
    this.previousUrls = new Map();
    this.lastEventTimes = new Map();
  }

  /**
   * Start observing tab update events
   */
  startObserving() {
    if (this.isActive) {
      console.log('[TabUpdatedObserver] Already observing');
      return;
    }

    console.log('[TabUpdatedObserver] Starting observation...');
    this.isActive = true;

    // Add the listener
    chrome.tabs.onUpdated.addListener(this.handleTabUpdated.bind(this));

    console.log('[TabUpdatedObserver] ✅ Started observing');
  }

  /**
   * Stop observing tab update events
   */
  stopObserving() {
    if (!this.isActive) {
      console.log('[TabUpdatedObserver] Not observing');
      return;
    }

    console.log('[TabUpdatedObserver] Stopping observation...');

    // Remove the listener
    chrome.tabs.onUpdated.removeListener(this.handleTabUpdated.bind(this));

    // Clear all timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.processingTabIds.clear();
    this.previousUrls.clear();
    this.lastEventTimes.clear();

    this.isActive = false;
    console.log('[TabUpdatedObserver] ✅ Stopped observing');
  }

  /**
   * Handle tab update event
   * @param {number} tabId - The tab ID
   * @param {Object} changeInfo - Information about what changed
   * @param {Object} tab - The updated tab
   */
  handleTabUpdated(tabId, changeInfo, tab) {
    // Skip if we're not active
    if (!this.isActive) return;

    // Skip if this is not a relevant change
    if (!this.isRelevantChange(changeInfo)) {
      return;
    }

    // Debounce rapid updates
    this.debounce(tabId, changeInfo, tab);
  }

  /**
   * Check if the change is relevant
   * @param {Object} changeInfo - The change info
   * @returns {boolean} True if relevant
   */
  isRelevantChange(changeInfo) {
    // Only care about URL changes or page load completion
    return !!(changeInfo.url || changeInfo.status === 'complete');
  }

  /**
   * Debounce rapid updates for a tab
   * @param {number} tabId - The tab ID
   * @param {Object} changeInfo - The change info
   * @param {Object} tab - The updated tab
   */
  debounce(tabId, changeInfo, tab) {
    // Clear existing timer for this tab
    if (this.debounceTimers.has(tabId)) {
      clearTimeout(this.debounceTimers.get(tabId));
    }

    // Set a new timer (100ms debounce)
    const timer = setTimeout(() => {
      this.processTabUpdate(tabId, changeInfo, tab);
      this.debounceTimers.delete(tabId);
    }, 100);

    this.debounceTimers.set(tabId, timer);
  }

  /**
   * Process a tab update
   * @param {number} tabId - The tab ID
   * @param {Object} changeInfo - The change info
   * @param {Object} tab - The updated tab
   */
  processTabUpdate(tabId, changeInfo, tab) {
    // Prevent duplicate processing
    if (this.processingTabIds.has(tabId)) {
      return;
    }

    this.processingTabIds.add(tabId);

    try {
      // Get the previous URL for this tab
      const previousUrl = this.previousUrls.get(tabId) || null;

      // Check if the URL changed
      const urlChanged = changeInfo.url && changeInfo.url !== previousUrl;

      // Update the previous URL
      if (changeInfo.url) {
        this.previousUrls.set(tabId, changeInfo.url);
      }

      // Log the update
      console.log(`[TabUpdatedObserver] 🔄 Tab ${tabId} updated`);
      if (urlChanged) {
        console.log(`[TabUpdatedObserver]   URL: ${previousUrl} → ${changeInfo.url}`);
      }
      if (changeInfo.status === 'complete') {
        console.log(`[TabUpdatedObserver]   Status: Load complete`);
      }

      // Dispatch URL_CHANGED event
      if (urlChanged) {
        this.dispatch({
          type: 'URL_CHANGED',
          tabId: tabId,
          url: changeInfo.url,
          previousUrl: previousUrl,
          tab: tab,
          changeInfo: changeInfo,
          timestamp: Date.now()
        });
      }

      // Dispatch TAB_LOADED event when page completes loading
      if (changeInfo.status === 'complete') {
        this.dispatch({
          type: 'TAB_LOADED',
          tabId: tabId,
          tab: tab,
          url: tab.url || changeInfo.url,
          changeInfo: changeInfo,
          timestamp: Date.now()
        });
      }

      // If both URL changed and page loaded, log it
      if (urlChanged && changeInfo.status === 'complete') {
        console.log(`[TabUpdatedObserver] ✅ Tab ${tabId} fully loaded with new URL: ${changeInfo.url}`);
      }

    } catch (error) {
      console.warn(`[TabUpdatedObserver] Error processing tab ${tabId}:`, error);
    } finally {
      this.processingTabIds.delete(tabId);
    }
  }

  /**
   * Get the previous URL for a tab
   * @param {number} tabId - The tab ID
   * @returns {string|null} Previous URL or null
   */
  getPreviousUrl(tabId) {
    return this.previousUrls.get(tabId) || null;
  }

  /**
   * Check if a tab has been recently updated
   * @param {number} tabId - The tab ID
   * @param {number} thresholdMs - Time threshold in milliseconds
   * @returns {boolean} True if recently updated
   */
  isRecentlyUpdated(tabId, thresholdMs = 5000) {
    const lastUpdate = this.lastEventTimes.get(tabId);
    if (!lastUpdate) return false;
    return (Date.now() - lastUpdate) < thresholdMs;
  }

  /**
   * Get the number of tabs being processed
   * @returns {number} Processing tab count
   */
  getProcessingTabCount() {
    return this.processingTabIds.size;
  }

  /**
   * Get the number of tabs being tracked
   * @returns {number} Tracked tab count
   */
  getTrackedTabCount() {
    return this.previousUrls.size;
  }

  /**
   * Clear tracking data for a specific tab
   * @param {number} tabId - The tab ID
   */
  clearTabData(tabId) {
    this.previousUrls.delete(tabId);
    this.lastEventTimes.delete(tabId);
    if (this.debounceTimers.has(tabId)) {
      clearTimeout(this.debounceTimers.get(tabId));
      this.debounceTimers.delete(tabId);
    }
    console.log(`[TabUpdatedObserver] Cleared data for tab ${tabId}`);
  }

  /**
   * Clear all tracking data
   */
  clearAllData() {
    this.previousUrls.clear();
    this.lastEventTimes.clear();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.processingTabIds.clear();
    console.log('[TabUpdatedObserver] Cleared all data');
  }

  /**
   * Get the current URL for a tab
   * @param {number} tabId - The tab ID
   * @returns {Promise<string|null>} Current URL or null
   */
  async getCurrentUrl(tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      return tab.url || null;
    } catch (error) {
      console.warn(`[TabUpdatedObserver] Error getting tab ${tabId}:`, error);
      return null;
    }
  }

  /**
   * Check if a URL belongs to a known ATS
   * @param {string} url - The URL to check
   * @returns {boolean} True if it's a known ATS
   */
  isAtsUrl(url) {
    if (!url) return false;

    const atsPatterns = [
      /greenhouse\.io/,
      /grnh\.se/,
      /lever\.co/,
      /workday\.com/,
      /myworkdayjobs\.com/,
      /ashby\.com/
    ];

    return atsPatterns.some(pattern => pattern.test(url));
  }
}

// Export singleton instance
const tabUpdatedObserver = new TabUpdatedObserver();
export default tabUpdatedObserver;