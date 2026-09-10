// src/background/managers/SessionManager.js

import SessionFactory from '../patterns/factories/SessionFactory.js';
import { InitiatedState } from '../patterns/states/InitiatedState.js';
import { AbandonedState } from '../patterns/states/AbandonedState.js';

/**
 * Session Manager
 *
 * Central manager for all application sessions.
 *
 * This implements the Singleton Pattern:
 * - Single instance manages all sessions
 * - Provides a central point of control for session lifecycle
 * - Coordinates between observers and state machine
 *
 * Responsibilities:
 * - Create new sessions when user clicks Apply
 * - Store and retrieve sessions by ID or tab ID
 * - Update session state based on events
 * - Persist sessions to storage for recovery
 * - Clean up expired or completed sessions
 * - Coordinate state transitions
 * - Provide session data to other components
 */
export class SessionManager {
  constructor() {
    // Singleton pattern
    if (SessionManager.instance) {
      return SessionManager.instance;
    }
    SessionManager.instance = this;

    // Session storage
    this.sessions = new Map(); // sessionId → session
    this.tabToSession = new Map(); // tabId → sessionId
    this.activeSessionIds = new Set();
    this.completedSessionIds = new Set();

    // Callbacks
    this.sessionCallbacks = new Map();
    this.stateChangeCallbacks = new Map();

    // Configuration
    this.maxActiveSessions = 50;
    this.sessionTimeoutMs = 1800000; // 30 minutes
    this.cleanupIntervalMs = 60000; // 1 minute

    // Initialize
    this.cleanupTimer = null;
    this.initialize();
  }

  /**
   * Get singleton instance
   * @returns {SessionManager} Singleton instance
   */
  static getInstance() {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  /**
   * Initialize the session manager
   */
  async initialize() {
    console.log('[SessionManager] Initializing...');

    // Restore sessions from storage
    await this.restoreFromStorage();

    // Start cleanup timer
    this.startCleanupTimer();

    console.log(`[SessionManager] ✅ Initialized with ${this.sessions.size} sessions`);
    console.log(`[SessionManager]   Active: ${this.activeSessionIds.size}`);
    console.log(`[SessionManager]   Completed: ${this.completedSessionIds.size}`);
  }

  // ============================================
  // SESSION CREATION
  // ============================================

  /**
   * Create a new session
   * @param {Object} jobData - Job data from LinkedIn
   * @param {Object} applyData - Apply button data
   * @param {Object} options - Optional configuration
   * @returns {Object} Created session
   */
  createSession(jobData, applyData, options = {}) {
    console.log('[SessionManager] Creating new session...');

    // Check if we have too many active sessions
    if (this.activeSessionIds.size >= this.maxActiveSessions) {
      console.warn('[SessionManager] Max active sessions reached, cleaning up...');
      this.cleanupOldestSessions();
    }

    // Create session using factory
    const session = SessionFactory.createSession(jobData, applyData, options);

    // ✅ Ensure trackedTabs is initialized
    if (!session.trackedTabs) {
      session.trackedTabs = [];
    }

    // Store the session
    this.sessions.set(session.sessionId, session);
    this.activeSessionIds.add(session.sessionId);

    // Map source tab to session
    if (session.sourceTabId) {
      this.tabToSession.set(session.sourceTabId, session.sessionId);
      // ✅ Add source tab to tracked tabs
      if (!session.trackedTabs.includes(session.sourceTabId)) {
        session.trackedTabs.push(session.sourceTabId);
      }
    }

    // Initialize state
    const initiatedState = new InitiatedState(session);
    session.currentState = initiatedState;
    initiatedState.onEnter();

    console.log(`[SessionManager] ✅ Session created: ${session.sessionId}`);
    console.log(`[SessionManager]   Job: ${session.jobTitle} at ${session.company}`);
    console.log(`[SessionManager]   Source tab: ${session.sourceTabId}`);
    console.log(`[SessionManager]   Tracked tabs: ${session.trackedTabs.join(', ')}`);

    // Notify callbacks
    this.notifyCallbacks('session_created', session);

    // Persist to storage
    this.persistToStorage();

    return session;
  }

  /**
   * Create a minimal session (for tracking without full job data)
   * @param {string} jobId - Job ID
   * @param {string} redirectUrl - Redirect URL
   * @param {number} sourceTabId - Source tab ID
   * @returns {Object} Created session
   */
  createMinimalSession(jobId, redirectUrl, sourceTabId) {
    const session = SessionFactory.createMinimalSession(jobId, redirectUrl, sourceTabId);
    return this.createSession(
      { externalJobId: jobId, title: 'Unknown Job', company: 'Unknown Company' },
      { redirectUrl, sourceTabId, applyUrl: redirectUrl }
    );
  }

  // ============================================
  // SESSION RETRIEVAL
  // ============================================

  /**
   * Get a session by ID
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Session or null
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get a session by tab ID
   * @param {number} tabId - Tab ID
   * @returns {Object|null} Session or null
   */
  getSessionByTabId(tabId) {
    const sessionId = this.tabToSession.get(tabId);
    if (sessionId) {
      return this.sessions.get(sessionId) || null;
    }
    return null;
  }

  /**
   * Get all sessions
   * @param {Object} options - Filter options
   * @param {boolean} options.includeCompleted - Include completed sessions
   * @param {boolean} options.includeAbandoned - Include abandoned sessions
   * @returns {Object[]} Array of sessions
   */
  getSessions(options = {}) {
    const { includeCompleted = false, includeAbandoned = false } = options;
    const result = [];

    for (const [id, session] of this.sessions) {
      const isCompleted = session.status === 'submitted' || session.status === 'abandoned';
      if (isCompleted && !includeCompleted && !includeAbandoned) continue;
      if (session.status === 'abandoned' && !includeAbandoned) continue;
      result.push(session);
    }

    return result;
  }

  /**
   * Get all active sessions
   * @returns {Object[]} Array of active sessions
   */
  getActiveSessions() {
    const active = [];
    for (const id of this.activeSessionIds) {
      const session = this.sessions.get(id);
      if (session) {
        active.push(session);
      }
    }
    return active;
  }

  /**
   * Get all completed sessions
   * @returns {Object[]} Array of completed sessions
   */
  getCompletedSessions() {
    const completed = [];
    for (const id of this.completedSessionIds) {
      const session = this.sessions.get(id);
      if (session) {
        completed.push(session);
      }
    }
    return completed;
  }

  /**
   * Get sessions for a specific job
   * @param {string} jobId - Job ID
   * @returns {Object[]} Array of sessions for the job
   */
  getSessionsByJobId(jobId) {
    const result = [];
    for (const [id, session] of this.sessions) {
      if (session.jobId === jobId) {
        result.push(session);
      }
    }
    return result;
  }

  // ============================================
  // SESSION UPDATE
  // ============================================

  /**
   * Update a session
   * @param {string} sessionId - Session ID
   * @param {Object} updates - Updates to apply
   * @returns {Object|null} Updated session or null
   */
  updateSession(sessionId, updates) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`[SessionManager] Session not found: ${sessionId}`);
      return null;
    }

    // Apply updates
    Object.assign(session, updates);
    session.updatedAt = Date.now();

    // If status changed to submitted or abandoned, update active/completed sets
    if (updates.status === 'submitted' || updates.status === 'abandoned') {
      this.activeSessionIds.delete(sessionId);
      this.completedSessionIds.add(sessionId);
    }

    console.log(`[SessionManager] ✅ Session updated: ${sessionId}`);
    console.log(`[SessionManager]   Status: ${session.status}`);

    // Notify callbacks
    this.notifyCallbacks('session_updated', session);

    // Persist to storage
    this.persistToStorage();

    return session;
  }

  /**
   * Update session by tab ID
   * @param {number} tabId - Tab ID
   * @param {Object} updates - Updates to apply
   * @returns {Object|null} Updated session or null
   */
  updateSessionByTabId(tabId, updates) {
    const session = this.getSessionByTabId(tabId);
    if (!session) {
      console.warn(`[SessionManager] No session found for tab: ${tabId}`);
      return null;
    }
    return this.updateSession(session.sessionId, updates);
  }

  /**
   * Map a tab to a session
   * @param {number} tabId - Tab ID
   * @param {string} sessionId - Session ID
   * @returns {boolean} True if mapped successfully
   */
  mapTabToSession(tabId, sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`[SessionManager] Session not found: ${sessionId}`);
      return false;
    }

    // Map tab to session
    this.tabToSession.set(tabId, sessionId);

    // ✅ Ensure trackedTabs exists
    if (!session.trackedTabs) {
      session.trackedTabs = [];
    }

    // ✅ Add tab to tracked tabs if not already there
    if (!session.trackedTabs.includes(tabId)) {
      session.trackedTabs.push(tabId);
    }

    // Update redirectTabId if it's the first redirect
    if (!session.redirectTabId) {
      session.redirectTabId = tabId;
    }

    console.log(`[SessionManager] ✅ Mapped tab ${tabId} to session ${sessionId}`);
    console.log(`[SessionManager]   Tracked tabs: ${session.trackedTabs.join(', ')}`);

    this.persistToStorage();
    return true;
  }

  /**
   * Check if a tab belongs to a session
   * @param {number} tabId - Tab ID
   * @param {string} sessionId - Session ID
   * @returns {boolean} True if tab is tracked in the session
   */
  isTabTrackedInSession(tabId, sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    if (!session.trackedTabs) return false;
    return session.trackedTabs.includes(tabId);
  }

  /**
   * Get all tabs in a session
   * @param {string} sessionId - Session ID
   * @returns {number[]} Array of tab IDs
   */
  getSessionTabs(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.trackedTabs || [];
  }

  /**
   * Remove a tab from a session's tracked tabs
   * @param {number} tabId - Tab ID
   * @param {string} sessionId - Session ID
   * @returns {boolean} True if removed successfully
   */
  removeTabFromSession(tabId, sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    if (!session.trackedTabs) return false;

    const index = session.trackedTabs.indexOf(tabId);
    if (index > -1) {
      session.trackedTabs.splice(index, 1);
      this.tabToSession.delete(tabId);
      this.persistToStorage();
      console.log(`[SessionManager] ✅ Removed tab ${tabId} from session ${sessionId}`);
      console.log(`[SessionManager]   Remaining tabs: ${session.trackedTabs.join(', ')}`);
      return true;
    }
    return false;
  }

  /**
   * Check if a tab is tracked in ANY active session
   * @param {number} tabId - Tab ID
   * @returns {string|null} Session ID or null
   */
  getSessionIdByTabId(tabId) {
    for (const [sessionId, session] of this.sessions) {
      if (session.trackedTabs && session.trackedTabs.includes(tabId)) {
        return sessionId;
      }
    }
    return null;
  }

  // ============================================
  // SESSION REMOVAL
  // ============================================

  /**
   * Remove a session
   * @param {string} sessionId - Session ID
   * @param {string} reason - Reason for removal
   * @returns {Object|null} Removed session or null
   */
  removeSession(sessionId, reason = 'manual') {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`[SessionManager] Session not found: ${sessionId}`);
      return null;
    }

    console.log(`[SessionManager] Removing session: ${sessionId}`);
    console.log(`[SessionManager]   Reason: ${reason}`);

    // Clean up tab mappings
    if (session.trackedTabs) {
      for (const tabId of session.trackedTabs) {
        this.tabToSession.delete(tabId);
      }
    } else {
      if (session.sourceTabId) {
        this.tabToSession.delete(session.sourceTabId);
      }
      if (session.redirectTabId) {
        this.tabToSession.delete(session.redirectTabId);
      }
    }

    // Remove from active/completed sets
    this.activeSessionIds.delete(sessionId);
    this.completedSessionIds.delete(sessionId);

    // Remove from storage
    this.sessions.delete(sessionId);

    // Notify callbacks
    this.notifyCallbacks('session_removed', session);

    // Persist to storage
    this.persistToStorage();

    return session;
  }

  /**
   * Clean up old sessions
   */
  cleanupOldestSessions() {
    // Get active sessions sorted by lastActivity
    const active = this.getActiveSessions();
    if (active.length <= this.maxActiveSessions / 2) {
      return;
    }

    // Sort by lastActivity (oldest first)
    active.sort((a, b) => (a.lastActivityAt || 0) - (b.lastActivityAt || 0));

    // Remove oldest sessions (excess)
    const toRemove = active.slice(this.maxActiveSessions / 2);
    for (const session of toRemove) {
      this.removeSession(session.sessionId, 'cleanup_oldest');
    }

    console.log(`[SessionManager] Cleaned up ${toRemove.length} old sessions`);
  }

  // ============================================
  // PERSISTENCE
  // ============================================

  /**
   * Persist sessions to storage
   */
  async persistToStorage() {
    try {
      const data = {
        sessions: Array.from(this.sessions.entries()),
        activeSessionIds: Array.from(this.activeSessionIds),
        completedSessionIds: Array.from(this.completedSessionIds),
        tabToSession: Array.from(this.tabToSession.entries()),
        timestamp: Date.now()
      };

      await chrome.storage.local.set({ sessionManagerData: data });
    } catch (error) {
      console.warn('[SessionManager] Error persisting to storage:', error);
    }
  }

  /**
   * Restore sessions from storage
   */
  async restoreFromStorage() {
    try {
      const result = await chrome.storage.local.get('sessionManagerData');
      if (!result.sessionManagerData) {
        console.log('[SessionManager] No stored sessions found');
        return;
      }

      const data = result.sessionManagerData;

      // Restore sessions
      for (const [id, sessionData] of data.sessions) {
        const session = SessionFactory.restoreFromStorage(sessionData);
        // ✅ Ensure trackedTabs exists
        if (!session.trackedTabs) {
          session.trackedTabs = [];
        }
        this.sessions.set(id, session);
      }

      // Restore active/completed sets
      this.activeSessionIds = new Set(data.activeSessionIds || []);
      this.completedSessionIds = new Set(data.completedSessionIds || []);

      // Restore tab to session mapping
      for (const [tabId, sessionId] of data.tabToSession || []) {
        this.tabToSession.set(tabId, sessionId);
      }

      console.log(`[SessionManager] ✅ Restored ${this.sessions.size} sessions from storage`);
      console.log(`[SessionManager]   Active: ${this.activeSessionIds.size}`);
      console.log(`[SessionManager]   Completed: ${this.completedSessionIds.size}`);

    } catch (error) {
      console.warn('[SessionManager] Error restoring from storage:', error);
    }
  }

  // ============================================
  // CLEANUP
  // ============================================

  /**
   * Start the cleanup timer
   */
  startCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.cleanupIntervalMs);

    console.log(`[SessionManager] Cleanup timer started (${this.cleanupIntervalMs}ms)`);
  }

  /**
   * Stop the cleanup timer
   */
  stopCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      console.log('[SessionManager] Cleanup timer stopped');
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [id, session] of this.sessions) {
      // Skip completed sessions
      if (session.status === 'submitted' || session.status === 'abandoned') {
        continue;
      }

      // Check if session has expired
      const lastActivity = session.lastActivityAt || session.startedAt || 0;
      const timeSinceActivity = now - lastActivity;

      if (timeSinceActivity > this.sessionTimeoutMs) {
        console.log(`[SessionManager] ⏰ Session expired: ${id}`);
        console.log(`[SessionManager]   Job: ${session.jobTitle}`);
        console.log(`[SessionManager]   Inactive for: ${Math.round(timeSinceActivity / 60000)} minutes`);

        const abandonedState = new AbandonedState(session, 'timeout');

        if (session.currentState) {
          session.currentState.transitionTo(abandonedState);
        } else {
          abandonedState.onEnter();
          session.currentState = abandonedState;
        }

        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[SessionManager] ✅ Cleaned up ${cleanedCount} expired sessions`);
    }
  }

  // ============================================
  // CALLBACKS
  // ============================================

  /**
   * Register a callback for session events
   * @param {Function} callback - Callback function
   * @param {string} eventType - Event type filter
   * @returns {string} Callback ID
   */
  onSessionChange(callback, eventType = null) {
    const id = `callback_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    this.sessionCallbacks.set(id, { callback, eventType });
    return id;
  }

  /**
   * Remove a callback
   * @param {string} callbackId - Callback ID
   * @returns {boolean} True if removed
   */
  removeCallback(callbackId) {
    return this.sessionCallbacks.delete(callbackId);
  }

  /**
   * Notify all callbacks of an event
   * @param {string} eventType - Event type
   * @param {Object} data - Event data
   */
  notifyCallbacks(eventType, data) {
    for (const [id, { callback, eventType: filter }] of this.sessionCallbacks) {
      if (filter && filter !== eventType) continue;
      try {
        callback(eventType, data);
      } catch (error) {
        console.warn(`[SessionManager] Callback error:`, error);
      }
    }
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Get session statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      totalSessions: this.sessions.size,
      activeSessions: this.activeSessionIds.size,
      completedSessions: this.completedSessionIds.size,
      tabMappings: this.tabToSession.size,
      sessionTimeoutMs: this.sessionTimeoutMs,
      maxActiveSessions: this.maxActiveSessions
    };
  }

  /**
   * Check if a session exists
   * @param {string} sessionId - Session ID
   * @returns {boolean} True if exists
   */
  hasSession(sessionId) {
    return this.sessions.has(sessionId);
  }

  /**
   * Check if a tab is mapped to a session
   * @param {number} tabId - Tab ID
   * @returns {boolean} True if mapped
   */
  hasTabMapping(tabId) {
    return this.tabToSession.has(tabId);
  }

  /**
   * Clear all sessions
   * @param {boolean} preserveActive - Preserve active sessions
   */
  clearAllSessions(preserveActive = false) {
    console.log('[SessionManager] Clearing sessions...');

    if (preserveActive) {
      for (const id of this.completedSessionIds) {
        this.removeSession(id, 'clear_completed');
      }
    } else {
      const allIds = Array.from(this.sessions.keys());
      for (const id of allIds) {
        this.removeSession(id, 'clear_all');
      }
    }

    console.log(`[SessionManager] ${preserveActive ? 'Cleared completed' : 'Cleared all'} sessions`);
  }

  /**
   * Get a summary of all sessions
   * @returns {Object[]} Session summaries
   */
  getSessionSummaries() {
    const summaries = [];
    for (const [id, session] of this.sessions) {
      summaries.push(SessionFactory.getSessionSummary(session));
    }
    return summaries;
  }

  /**
   * Check if a session is active
   * @param {string} sessionId - Session ID
   * @returns {boolean} True if active
   */
  isSessionActive(sessionId) {
    return this.activeSessionIds.has(sessionId);
  }

  /**
   * Check if a session is completed
   * @param {string} sessionId - Session ID
   * @returns {boolean} True if completed
   */
  isSessionCompleted(sessionId) {
    return this.completedSessionIds.has(sessionId);
  }

  /**
   * Get the current state of a session
   * @param {string} sessionId - Session ID
   * @returns {string} Current state name or null
   */
  getSessionState(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return session.currentState ? session.currentState.name : null;
  }

  /**
   * Get the age of a session
   * @param {string} sessionId - Session ID
   * @returns {number} Age in milliseconds or -1
   */
  getSessionAge(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return -1;
    return SessionFactory.getSessionAge(session);
  }

  /**
   * Check if a tab is tracked in ANY active session
   * @param {number} tabId - Tab ID
   * @returns {string|null} Session ID or null
   */
  getSessionIdByTabId(tabId) {
    for (const [sessionId, session] of this.sessions) {
      if (session.trackedTabs && session.trackedTabs.includes(tabId)) {
        return sessionId;
      }
    }
    return null;
  }

  /**
   * Destroy the manager (clean up all resources)
   */
  destroy() {
    console.log('[SessionManager] Destroying...');

    this.stopCleanupTimer();
    this.clearAllSessions(false);
    this.sessionCallbacks.clear();

    SessionManager.instance = null;

    console.log('[SessionManager] ✅ Destroyed');
  }
}

// Export singleton instance
const sessionManager = SessionManager.getInstance();
export default sessionManager;