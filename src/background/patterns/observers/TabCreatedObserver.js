// src/background/patterns/observers/TabCreatedObserver.js

import { TabObserver } from '../base/TabObserver.js';

/**
 * Tab Created Observer
 *
 * Observes when new tabs are created in the browser.
 * This is used to detect when the user is redirected from LinkedIn
 * to the external ATS (Greenhouse, Lever, Workday, etc.).
 *
 * This implements the Observer Pattern:
 * - Listens for chrome.tabs.onCreated events
 * - Dispatches TAB_CREATED events to all subscribers
 *
 * The observer tracks ALL tabs, not just those from LinkedIn.
 * The ApplicationTracker decides which tabs belong to a session.
 *
 * Why this is important:
 * - LinkedIn → Coinbase (first redirect) → tracked
 * - Coinbase → Greenhouse (second redirect) → MUST ALSO BE TRACKED
 * - The observer must dispatch events for ALL tabs, regardless of source
 */
export class TabCreatedObserver extends TabObserver {
  constructor() {
    super();
    this.name = 'tab_created_observer';
    this.isActive = false;
    this.processedTabs = new Set();
  }

  /**
   * Start observing tab creation events
   */
  startObserving() {
    if (this.isActive) {
      console.log('[TabCreatedObserver] Already observing');
      return;
    }

    console.log('[TabCreatedObserver] Starting observation...');
    this.isActive = true;

    // Add the listener for ALL tab creation events
    chrome.tabs.onCreated.addListener(this.handleTabCreated.bind(this));

    console.log('[TabCreatedObserver] ✅ Started observing');
  }

  /**
   * Stop observing tab creation events
   */
  stopObserving() {
    if (!this.isActive) {
      console.log('[TabCreatedObserver] Not observing');
      return;
    }

    console.log('[TabCreatedObserver] Stopping observation...');

    // Remove the listener
    chrome.tabs.onCreated.removeListener(this.handleTabCreated.bind(this));

    this.isActive = false;
    this.processedTabs.clear();
    console.log('[TabCreatedObserver] ✅ Stopped observing');
  }

  /**
   * Handle tab creation event - ALWAYS dispatches for ALL tabs
   * @param {Object} tab - The created tab object
   */
  handleTabCreated(tab) {
    console.log(`[TabCreatedObserver] 📂 Tab created: ${tab.id}`);

    // Check if we've already processed this tab
    if (this.processedTabs.has(tab.id)) {
      console.log(`[TabCreatedObserver] Tab ${tab.id} already processed, skipping`);
      return;
    }

    // Mark as processing
    this.processedTabs.add(tab.id);

    // Get the tab details to determine opener
    this.getTabDetails(tab);
  }

  /**
   * Get details about the created tab
   * @param {Object} tab - The created tab
   */
  async getTabDetails(tab) {
    try {
      // Get tab info including openerTabId
      const tabInfo = await chrome.tabs.get(tab.id);
      const { openerTabId } = tabInfo;

      console.log(`[TabCreatedObserver] Tab ${tab.id} opener: ${openerTabId || 'none'}`);

      // Get opener URL if available
      let openerUrl = null;
      let isFromLinkedIn = false;

      if (openerTabId) {
        try {
          const openerTab = await chrome.tabs.get(openerTabId);
          openerUrl = openerTab.url || null;
          isFromLinkedIn = openerUrl && openerUrl.includes('linkedin.com');
          console.log(`[TabCreatedObserver] Opener URL: ${openerUrl}`);
        } catch (e) {
          console.log(`[TabCreatedObserver] Could not get opener tab: ${e.message}`);
        }
      }

      // ✅ ALWAYS dispatch the event - let ApplicationTracker decide if it matters
      console.log(`[TabCreatedObserver] 📤 Dispatching TAB_CREATED for tab ${tab.id}`);

      this.dispatch({
        type: 'TAB_CREATED',
        tabId: tab.id,
        tab: tab,
        openerTabId: openerTabId,
        openerUrl: openerUrl,
        isFromLinkedIn: isFromLinkedIn,
        url: tab.url || null,
        timestamp: Date.now()
      });

      // Clean up processed tabs to prevent memory leaks
      this.cleanupProcessedTabs();

    } catch (error) {
      console.warn(`[TabCreatedObserver] Error getting tab details:`, error);
      this.processedTabs.delete(tab.id);
    }
  }

  /**
   * Clean up processed tabs to prevent memory leaks
   */
  cleanupProcessedTabs() {
    // Keep only last 100 processed tab IDs
    if (this.processedTabs.size > 100) {
      const entries = Array.from(this.processedTabs);
      const toRemove = entries.slice(0, this.processedTabs.size - 100);
      for (const id of toRemove) {
        this.processedTabs.delete(id);
      }
      console.log(`[TabCreatedObserver] Cleaned up processed tabs, kept ${this.processedTabs.size}`);
    }
  }

  /**
   * Force process a tab (useful for testing or manual handling)
   * @param {number} tabId - The tab ID to process
   */
  forceProcessTab(tabId) {
    chrome.tabs.get(tabId, (tab) => {
      if (tab) {
        this.handleTabCreated(tab);
      }
    });
  }

  /**
   * Get the number of processed tabs
   * @returns {number} Processed tab count
   */
  getProcessedTabCount() {
    return this.processedTabs.size;
  }

  /**
   * Check if a tab has been processed
   * @param {number} tabId - The tab ID to check
   * @returns {boolean} True if processed
   */
  isTabProcessed(tabId) {
    return this.processedTabs.has(tabId);
  }

  /**
   * Reset the processed tabs set
   */
  resetProcessedTabs() {
    this.processedTabs.clear();
    console.log('[TabCreatedObserver] Reset processed tabs');
  }
}

// Export singleton instance
const tabCreatedObserver = new TabCreatedObserver();
export default tabCreatedObserver;