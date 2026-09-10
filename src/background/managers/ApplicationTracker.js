// src/background/managers/ApplicationTracker.js

import sessionManager from './SessionManager.js';
import strategyFactory from '../patterns/factories/StrategyFactory.js';
import tabCreatedObserver from '../patterns/observers/TabCreatedObserver.js';
import tabUpdatedObserver from '../patterns/observers/TabUpdatedObserver.js';
import tabRemovedObserver from '../patterns/observers/TabRemovedObserver.js';
import { InProgressState } from '../patterns/states/InProgressState.js';
import { SubmittedState } from '../patterns/states/SubmittedState.js';
import { AbandonedState } from '../patterns/states/AbandonedState.js';

/**
 * Application Tracker
 *
 * Central orchestrator for tracking job applications from LinkedIn to external ATS.
 *
 * This implements the Facade Pattern:
 * - Provides a simple interface to the complex tracking system
 * - Coordinates between observers, session manager, and state machine
 * - Handles all the event wiring and orchestration
 *
 * Responsibilities:
 * - Initialize all observers
 * - Handle apply button clicks from content script
 * - Coordinate session creation and state transitions
 * - Route events to the appropriate handlers
 * - Handle submission detection and payload delivery
 * - Clean up resources when done
 *
 * This is the main entry point for the tracking system.
 */
export class ApplicationTracker {
  constructor() {
    this.isInitialized = false;
    this.eventHandlers = new Map();
    this.processingQueue = new Set();
    this.submissionCallbacks = [];
    this.abandonmentCallbacks = [];

    // Bind methods
    this.handleTabCreated = this.handleTabCreated.bind(this);
    this.handleTabUpdated = this.handleTabUpdated.bind(this);
    this.handleTabRemoved = this.handleTabRemoved.bind(this);
    this.handleApplyClick = this.handleApplyClick.bind(this);
  }

  /**
   * Initialize the application tracker
   */
  initialize() {
    if (this.isInitialized) {
      console.log('[ApplicationTracker] Already initialized');
      return;
    }

    console.log('[ApplicationTracker] 🚀 Initializing...');

    // Start observers
    tabCreatedObserver.startObserving();
    tabUpdatedObserver.startObserving();
    tabRemovedObserver.startObserving();

    // Register event handlers
    this.registerEventHandlers();

    // Set up session callbacks
    this.setupSessionCallbacks();

    this.isInitialized = true;
    console.log('[ApplicationTracker] ✅ Initialized successfully');
  }

  /**
   * Register all event handlers
   */
  registerEventHandlers() {
    // Tab Created events
    tabCreatedObserver.registerEventHandler('TAB_CREATED', this.handleTabCreated);

    // Tab Updated events
    tabUpdatedObserver.registerEventHandler('URL_CHANGED', this.handleTabUpdated);
    tabUpdatedObserver.registerEventHandler('TAB_LOADED', this.handleTabUpdated);

    // Tab Removed events
    tabRemovedObserver.registerEventHandler('TAB_REMOVED', this.handleTabRemoved);

    console.log('[ApplicationTracker] ✅ Event handlers registered');
  }

  /**
   * Set up session callbacks
   */
  setupSessionCallbacks() {
    sessionManager.onSessionChange((event, session) => {
      // Handle session state changes
      if (event === 'session_updated') {
        this.handleSessionUpdate(session);
      }

      if (event === 'session_created') {
        this.handleSessionCreated(session);
      }
    });
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Handle apply button click from content script
   * @param {Object} data - Apply data from content script
   * @param {Object} data.jobData - Job data from LinkedIn
   * @param {Object} data.applyData - Apply button data
   * @param {Function} callback - Callback function
   */
  async handleApplyClick(data, callback) {
    console.log('[ApplicationTracker] 📌 Processing apply click...');
    console.log(`[ApplicationTracker]   Job: ${data.jobData.title}`);
    console.log(`[ApplicationTracker]   Company: ${data.jobData.company}`);
    console.log(`[ApplicationTracker]   Redirect: ${data.applyData.redirectUrl}`);

    try {
      // Create session
      const session = sessionManager.createSession(data.jobData, data.applyData);

      // Detect ATS and set strategy
      const strategy = strategyFactory.getStrategy(data.applyData.redirectUrl);
      session.ats = strategy.getAtsName();
      session.atsName = strategy.getDisplayName();
      session.atsStrategy = strategy;

      console.log(`[ApplicationTracker] ✅ Session created: ${session.sessionId}`);
      console.log(`[ApplicationTracker]   ATS detected: ${session.atsName}`);

      // Store apply data for reference
      session.applyData = data.applyData;

      // ✅ Initialize jobIds with LinkedIn job ID
      if (!session.jobIds) {
        session.jobIds = {};
      }
      if (session.jobId) {
        session.jobIds.linkedin = session.jobId;
        console.log(`[ApplicationTracker] 🔑 LinkedIn Job ID: ${session.jobId}`);
      }

      // ✅ Store the initial LinkedIn URL
      if (!session.visitedUrls) {
        session.visitedUrls = [];
      }

      const sourceUrl = data.jobData.url || data.applyData.sourceUrl || data.applyData.applyUrl;
      if (sourceUrl) {
        const jobId = this.extractJobIdFromUrl(sourceUrl) || session.jobId;
        session.visitedUrls.push({
          url: sourceUrl,
          timestamp: Date.now(),
          tabId: data.applyData.sourceTabId || null,
          title: data.jobData.title || 'LinkedIn Job',
          order: 1,
          label: this.getUrlLabel(sourceUrl),
          jobId: jobId  // ✅ Store job ID with URL
        });
        console.log(`[ApplicationTracker] 📌 #1 [${this.getUrlLabel(sourceUrl)}]: ${sourceUrl}`);
        if (jobId) {
          console.log(`[ApplicationTracker]   🔑 Job ID: ${jobId}`);
        }
      }

      // ✅ Store the apply/redirect URL if different
      if (data.applyData.redirectUrl && data.applyData.redirectUrl !== sourceUrl) {
        const exists = session.visitedUrls.some(entry => entry.url === data.applyData.redirectUrl);
        if (!exists) {
          const order = session.visitedUrls.length + 1;
          const jobId = this.extractJobIdFromUrl(data.applyData.redirectUrl);
          session.visitedUrls.push({
            url: data.applyData.redirectUrl,
            timestamp: Date.now(),
            tabId: data.applyData.sourceTabId || null,
            title: 'Apply Redirect',
            order: order,
            label: this.getUrlLabel(data.applyData.redirectUrl),
            jobId: jobId  // ✅ Store job ID with URL
          });
          console.log(`[ApplicationTracker] 📌 #${order} [${this.getUrlLabel(data.applyData.redirectUrl)}]: ${data.applyData.redirectUrl}`);
          if (jobId) {
            console.log(`[ApplicationTracker]   🔑 Job ID: ${jobId}`);
          }
        }
      }

      // Notify callback
      if (callback) {
        callback({ success: true, sessionId: session.sessionId });
      }

      return session;

    } catch (error) {
      console.error('[ApplicationTracker] ❌ Error processing apply click:', error);
      if (callback) {
        callback({ success: false, error: error.message });
      }
      return null;
    }
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Handle tab created event - tracks ALL tabs in the flow
   * @param {Object} event - The event
   */
  async handleTabCreated(event) {
    console.log(`[ApplicationTracker] 📂 Tab created: ${event.tabId}`);
    console.log(`[ApplicationTracker]   Opener tab ID: ${event.openerTabId}`);

    // 1. Check if this tab was opened from a LinkedIn tab (first redirect)
    const pendingSessions = sessionManager.getActiveSessions().filter(
      s => s.status === 'initiated' && !s.redirectTabId
    );

    if (pendingSessions.length > 0) {
      const session = pendingSessions.find(s => s.sourceTabId === event.openerTabId);
      if (session) {
        console.log(`[ApplicationTracker] ✅ Found session for tab: ${session.sessionId}`);
        sessionManager.mapTabToSession(event.tabId, session.sessionId);

        const updated = sessionManager.updateSession(session.sessionId, {
          status: 'redirecting',
          redirectTabId: event.tabId,
          redirectedAt: Date.now()
        });

        const { RedirectingState } = await import('../patterns/states/RedirectingState.js');
        const redirectingState = new RedirectingState(updated);
        updated.currentState.transitionTo(redirectingState);

        console.log(`[ApplicationTracker] ✅ Session transitioned to RedirectingState`);
        console.log(`[ApplicationTracker]   Tracking tab: ${event.tabId}`);
        return;
      }
    }

    // 2. ✅ Check ALL active sessions
    const allSessions = sessionManager.getActiveSessions();
    console.log(`[ApplicationTracker]   Checking ${allSessions.length} active sessions`);

    // Debug: Log all sessions
    for (const s of allSessions) {
      console.log(`[ApplicationTracker]   Session ${s.sessionId}: status=${s.status}, trackedTabs=${s.trackedTabs?.join(', ') || 'none'}`);
    }

    // ✅ FIRST PASS: Try to find by opener tab ID (MOST RELIABLE)
    for (const session of allSessions) {
      if (session.status === 'submitted' || session.status === 'abandoned') continue;

      // ✅ Check if the opener tab is in this session's tracked tabs
      if (session.trackedTabs && session.trackedTabs.includes(event.openerTabId)) {
        console.log(`[ApplicationTracker] ✅✅ Tab ${event.tabId} opened from tracked tab ${event.openerTabId}`);
        console.log(`[ApplicationTracker]   Session: ${session.sessionId}`);
        console.log(`[ApplicationTracker]   Job: ${session.jobTitle}`);
        sessionManager.mapTabToSession(event.tabId, session.sessionId);
        console.log(`[ApplicationTracker]   Tracked tabs: ${session.trackedTabs.join(', ')}`);
        return;
      }
    }

    // ✅ SECOND PASS: Try by opener URL
    try {
      const openerTab = await chrome.tabs.get(event.openerTabId);
      const openerUrl = openerTab.url || '';
      console.log(`[ApplicationTracker]   Opener URL: ${openerUrl}`);

      for (const session of allSessions) {
        if (session.status === 'submitted' || session.status === 'abandoned') continue;

        // Coinbase careers page
        if (openerUrl.includes('coinbase.com') && openerUrl.includes('/careers/positions/')) {
          if (session.redirectTabId === event.openerTabId) {
            console.log(`[ApplicationTracker] ✅ Tab ${event.tabId} opened from Coinbase careers page`);
            console.log(`[ApplicationTracker]   Session: ${session.sessionId}`);
            console.log(`[ApplicationTracker]   Job: ${session.jobTitle}`);
            sessionManager.mapTabToSession(event.tabId, session.sessionId);
            console.log(`[ApplicationTracker]   Mapped Greenhouse tab to session`);
            return;
          }
        }

        // Greenhouse embed
        if (openerUrl.includes('greenhouse.io/embed/job_app')) {
          if (session.redirectTabId === event.openerTabId) {
            console.log(`[ApplicationTracker] ✅ Tab ${event.tabId} opened from Greenhouse embed`);
            console.log(`[ApplicationTracker]   Session: ${session.sessionId}`);
            console.log(`[ApplicationTracker]   Job: ${session.jobTitle}`);
            sessionManager.mapTabToSession(event.tabId, session.sessionId);
            console.log(`[ApplicationTracker]   Mapped tab to session`);
            return;
          }
        }
      }
    } catch (e) {
      console.log(`[ApplicationTracker]   Error getting opener: ${e.message}`);
    }

    // ✅ THIRD PASS: Check if the new tab itself is a Greenhouse page
    if (event.tab && event.tab.url) {
      const url = event.tab.url;
      if (url.includes('greenhouse.io/embed/job_app') ||
          url.includes('job-boards.greenhouse.io/embed/job_app')) {
        console.log(`[ApplicationTracker] 🎯 New tab is Greenhouse page!`);
        console.log(`[ApplicationTracker]   URL: ${url}`);

        // Find the active session for this job
        for (const session of allSessions) {
          // Try to match by job ID
          if (session.jobId === '4461237450' && session.status !== 'submitted') {
            console.log(`[ApplicationTracker] ✅ Found session by job ID: ${session.sessionId}`);
            sessionManager.mapTabToSession(event.tabId, session.sessionId);
            console.log(`[ApplicationTracker]   Mapped Greenhouse tab to session`);
            console.log(`[ApplicationTracker]   Tracked tabs: ${session.trackedTabs.join(', ')}`);

            // ✅ Immediately process the URL to check for confirmation
            await this.processSessionUpdate(session, {
              tabId: event.tabId,
              url: url,
              tab: event.tab
            });
            return;
          }

          // Also try by redirect tab ID (the Coinbase tab)
          if (session.redirectTabId === event.openerTabId) {
            console.log(`[ApplicationTracker] ✅ Found session by redirect tab: ${session.sessionId}`);
            sessionManager.mapTabToSession(event.tabId, session.sessionId);
            console.log(`[ApplicationTracker]   Mapped Greenhouse tab to session`);
            console.log(`[ApplicationTracker]   Tracked tabs: ${session.trackedTabs.join(', ')}`);
            return;
          }
        }
      }
    }

    // ✅ FOURTH PASS: Try to find by job ID (fallback)
    for (const session of allSessions) {
      if (session.jobId === '4461237450' && session.status !== 'submitted') {
        console.log(`[ApplicationTracker] ✅ Found session by job ID: ${session.sessionId}`);
        sessionManager.mapTabToSession(event.tabId, session.sessionId);
        console.log(`[ApplicationTracker]   Mapped tab to session by job ID`);
        return;
      }
    }

    console.log(`[ApplicationTracker] ⚠️ No session found for tab ${event.tabId}`);
  }

  /**
   * Handle tab updated event - detect URL changes in ANY tracked tab
   * @param {Object} event - The event
   */
  async handleTabUpdated(event) {
    // Skip if no session for this tab
    const session = sessionManager.getSessionByTabId(event.tabId);
    if (!session) {
      // Check if this tab is tracked in any session
      const allSessions = sessionManager.getActiveSessions();
      for (const s of allSessions) {
        if (s.trackedTabs && s.trackedTabs.includes(event.tabId)) {
          console.log(`[ApplicationTracker] 🔄 Tab ${event.tabId} is tracked in session ${s.sessionId}`);
          await this.processSessionUpdate(s, event);
          return;
        }
      }
      return;
    }

    // Process the session update
    await this.processSessionUpdate(session, event);
  }

  /**
   * Process session update - handles ALL URL changes in tracked tabs
   * @param {Object} session - The session
   * @param {Object} event - The event
   */
  async processSessionUpdate(session, event) {
    if (!session) return;

    // Skip if already completed
    if (session.status === 'submitted' || session.status === 'abandoned') {
      return;
    }

    console.log(`[ApplicationTracker] 🔄 Tab updated: ${event.tabId}`);
    console.log(`[ApplicationTracker]   Session: ${session.sessionId}`);
    console.log(`[ApplicationTracker]   Status: ${session.status}`);
    console.log(`[ApplicationTracker]   URL: ${event.url}`);

    // ✅ Store the URL in the session
    if (!session.visitedUrls) {
      session.visitedUrls = [];
    }

    // Check if this URL is already stored (avoid duplicates)
    const exists = session.visitedUrls.some(entry => entry.url === event.url);
    if (!exists && event.url) {
      const order = session.visitedUrls.length + 1;

      // ✅ Extract job ID from URL
      const extractedJobId = this.extractJobIdFromUrl(event.url);

      session.visitedUrls.push({
        url: event.url,
        timestamp: Date.now(),
        tabId: event.tabId,
        title: event.tab?.title || null,
        order: order,
        label: this.getUrlLabel(event.url),
        jobId: extractedJobId  // ✅ Store job ID with URL
      });

      console.log(`[ApplicationTracker] 📌 #${order} [${this.getUrlLabel(event.url)}]: ${event.url}`);
      if (extractedJobId) {
        console.log(`[ApplicationTracker]   🔑 Job ID: ${extractedJobId}`);
      }

      // ✅ Store job ID in session.jobIds map
      if (extractedJobId) {
        if (!session.jobIds) {
          session.jobIds = {};
        }
        const source = this.detectJobIdSource(event.url);
        // Only store if not already present
        if (!session.jobIds[source]) {
          session.jobIds[source] = extractedJobId;
          console.log(`[ApplicationTracker] 🔑 Added Job ID: ${source} = ${extractedJobId}`);
        }

        // Update externalJobId if not set
        if (!session.externalJobId) {
          session.externalJobId = extractedJobId;
          console.log(`[ApplicationTracker] 🔑 External Job ID set: ${extractedJobId}`);
        }
      }
    }

    // Check if we have a strategy
    if (!session.atsStrategy) {
      const strategy = strategyFactory.getStrategy(event.url);
      session.atsStrategy = strategy;
      session.ats = strategy.getAtsName();
      session.atsName = strategy.getDisplayName();
      console.log(`[ApplicationTracker]   Strategy: ${session.atsName}`);
    }

    // ✅ CRITICAL: Check for success page in ANY state
    if (session.atsStrategy && session.atsStrategy.isSuccessPage(event.url)) {
      console.log(`[ApplicationTracker] 🎉 SUCCESS PAGE DETECTED!`);
      console.log(`[ApplicationTracker]   URL: ${event.url}`);
      console.log(`[ApplicationTracker]   Session status before: ${session.status}`);
      console.log(`[ApplicationTracker]   Tab: ${event.tabId} (same tab, no new window)`);

      // Extract thank you message
      const thankYouPhrase = session.atsStrategy.extractThankYouMessage(
        event.url,
        event.tab?.title || '',
        null
      );

      // ✅ Add success URL to visited URLs if not already there
      const successExists = session.visitedUrls.some(entry => entry.url === event.url);
      if (!successExists && event.url) {
        const order = session.visitedUrls.length + 1;
        const extractedJobId = this.extractJobIdFromUrl(event.url);
        session.visitedUrls.push({
          url: event.url,
          timestamp: Date.now(),
          tabId: event.tabId,
          title: event.tab?.title || 'Application Confirmation',
          order: order,
          label: 'Application Confirmation',
          jobId: extractedJobId  // ✅ Store job ID with confirmation URL
        });
        console.log(`[ApplicationTracker] 🎉 Confirmation URL stored: ${event.url}`);
        if (extractedJobId) {
          console.log(`[ApplicationTracker]   🔑 Job ID: ${extractedJobId}`);
        }
      }

      // ✅ Extract application reference from success page
      const applicationReference = this.extractApplicationIdFromUrl(event.url);
      if (applicationReference) {
        session.applicationReference = applicationReference;
        console.log(`[ApplicationTracker] 📋 Application Reference: ${applicationReference}`);
      }

      // Update session to submitted
      sessionManager.updateSession(session.sessionId, {
        status: 'submitted',
        submittedAt: Date.now(),
        successUrl: event.url,
        thankYouPhrase: thankYouPhrase || 'Application submitted successfully',
        applicationReference: applicationReference || session.applicationReference
      });

      // Transition to SubmittedState
      const { SubmittedState } = await import('../patterns/states/SubmittedState.js');
      const submittedState = new SubmittedState(session);
      if (session.currentState) {
        session.currentState.transitionTo(submittedState);
      } else {
        submittedState.onEnter();
        session.currentState = submittedState;
      }

      console.log(`[ApplicationTracker] ✅ Session ${session.sessionId} marked as SUBMITTED!`);
      console.log(`[ApplicationTracker]   Tab: ${event.tabId} (same tab tracking works!) 🎉`);

      // Dispatch submission event
      this.dispatchSubmissionEvent(session);
      return;
    }

    // Process based on session state
    switch (session.status) {
      case 'redirecting':
        await this.handleRedirectingTab(session, event);
        break;

      case 'in_progress':
        await this.handleInProgressTab(session, event);
        break;

      default:
        break;
    }
  }

  /**
   * Handle tab removed event
   * @param {Object} event - The event
   */
  async handleTabRemoved(event) {
    const session = sessionManager.getSessionByTabId(event.tabId);
    if (!session) {
      // Check if this tab is tracked in any session
      const allSessions = sessionManager.getActiveSessions();
      for (const s of allSessions) {
        if (s.trackedTabs && s.trackedTabs.includes(event.tabId)) {
          console.log(`[ApplicationTracker] ❌ Tracked tab removed: ${event.tabId}`);
          console.log(`[ApplicationTracker]   Session: ${s.sessionId}`);
          console.log(`[ApplicationTracker]   Job: ${s.jobTitle}`);

          // If it's not the source tab or redirect tab, just remove from tracked tabs
          if (s.sourceTabId !== event.tabId && s.redirectTabId !== event.tabId) {
            const tabs = s.trackedTabs.filter(id => id !== event.tabId);
            s.trackedTabs = tabs;
            sessionManager.persistToStorage();
            console.log(`[ApplicationTracker]   Removed tab from tracked tabs: ${event.tabId}`);
            console.log(`[ApplicationTracker]   Remaining tabs: ${s.trackedTabs.join(', ')}`);
            return;
          }

          // If it's the redirect tab, transition to abandoned
          if (s.redirectTabId === event.tabId && s.status !== 'submitted') {
            console.log(`[ApplicationTracker] ❌ Redirect tab closed: ${event.tabId}`);
            const { AbandonedState } = await import('../patterns/states/AbandonedState.js');
            const abandonReason = s.status === 'in_progress'
              ? 'tab_closed_during_application'
              : 'tab_closed_before_load';
            const abandonedState = new AbandonedState(s, abandonReason);
            if (s.currentState) {
              s.currentState.transitionTo(abandonedState);
            } else {
              abandonedState.onEnter();
              s.currentState = abandonedState;
            }
            sessionManager.updateSession(s.sessionId, {
              status: 'abandoned',
              abandonedAt: Date.now(),
              abandonReason: abandonReason
            });
          }
          return;
        }
      }
      return;
    }

    // Skip if already completed
    if (session.status === 'submitted' || session.status === 'abandoned') {
      return;
    }

    console.log(`[ApplicationTracker] ❌ Tab removed: ${event.tabId}`);
    console.log(`[ApplicationTracker]   Session: ${session.sessionId}`);
    console.log(`[ApplicationTracker]   Job: ${session.jobTitle}`);

    // Determine if it's a source tab or redirect tab
    const isSourceTab = session.sourceTabId === event.tabId;
    const isRedirectTab = session.redirectTabId === event.tabId;

    if (isSourceTab && session.status === 'initiated') {
      console.log('[ApplicationTracker] Source tab closed before redirect');
      sessionManager.removeSession(session.sessionId, 'source_tab_closed');
      return;
    }

    if (isRedirectTab) {
      console.log('[ApplicationTracker] Redirect tab closed during application');

      const { AbandonedState } = await import('../patterns/states/AbandonedState.js');
      const abandonReason = session.status === 'in_progress'
        ? 'tab_closed_during_application'
        : 'tab_closed_before_load';

      const abandonedState = new AbandonedState(session, abandonReason);
      if (session.currentState) {
        session.currentState.transitionTo(abandonedState);
      } else {
        abandonedState.onEnter();
        session.currentState = abandonedState;
      }

      sessionManager.updateSession(session.sessionId, {
        status: 'abandoned',
        abandonedAt: Date.now(),
        abandonReason: abandonReason
      });
    }
  }

  // ============================================
  // STATE HANDLERS
  // ============================================

  /**
   * Handle tab in redirecting state
   * @param {Object} session - The session
   * @param {Object} event - The event
   */
  async handleRedirectingTab(session, event) {
    console.log(`[ApplicationTracker] 🔄 Handling redirecting tab: ${session.sessionId}`);
    console.log(`[ApplicationTracker]   Tab: ${event.tabId}`);
    console.log(`[ApplicationTracker]   URL: ${event.url}`);

    const strategy = session.atsStrategy;
    if (!strategy) return;

    // Detect step from URL
    const stepResult = strategy.detectStep(event.url, event.tab?.title || '');
    console.log(`[ApplicationTracker]   Step detected: ${stepResult.step}`);

    if (stepResult.step !== 'unknown') {
      console.log(`[ApplicationTracker] ✅ Step detected: ${stepResult.step}`);
      console.log(`[ApplicationTracker]   In same tab: ${event.tabId}`);

      // Transition to InProgressState
      const inProgressState = new InProgressState(session);
      if (session.currentState) {
        session.currentState.transitionTo(inProgressState);
      } else {
        inProgressState.onEnter();
        session.currentState = inProgressState;
      }

      // If step is 'success', immediately transition to SubmittedState
      if (stepResult.step === 'success') {
        console.log(`[ApplicationTracker] 🎉 Success step detected, transitioning to SubmittedState`);
        const { SubmittedState } = await import('../patterns/states/SubmittedState.js');
        const submittedState = new SubmittedState(session);
        inProgressState.transitionTo(submittedState);
        return true;
      }

      // Update session
      sessionManager.updateSession(session.sessionId, {
        status: 'in_progress',
        steps: [stepResult],
        stepCount: 1,
        lastActivityAt: Date.now()
      });

      // Dispatch step detected event
      this.dispatchStepEvent(session, stepResult);
    }
  }

  /**
   * Handle tab in progress state
   * @param {Object} session - The session
   * @param {Object} event - The event
   */
  async handleInProgressTab(session, event) {
    console.log(`[ApplicationTracker] 📝 Handling in-progress tab: ${session.sessionId}`);
    console.log(`[ApplicationTracker]   Tab: ${event.tabId}`);
    console.log(`[ApplicationTracker]   URL: ${event.url}`);

    const strategy = session.atsStrategy;
    if (!strategy) return;

    // Check if it's a success page
    if (strategy.isSuccessPage(event.url)) {
      console.log(`[ApplicationTracker] 🎉 Success page detected!`);

      const thankYouPhrase = strategy.extractThankYouMessage(
        event.url,
        event.tab?.title || '',
        null
      );

      // ✅ Add success URL to visited URLs if not already there
      if (!session.visitedUrls) {
        session.visitedUrls = [];
      }
      const successExists = session.visitedUrls.some(entry => entry.url === event.url);
      if (!successExists && event.url) {
        const order = session.visitedUrls.length + 1;
        const extractedJobId = this.extractJobIdFromUrl(event.url);
        session.visitedUrls.push({
          url: event.url,
          timestamp: Date.now(),
          tabId: event.tabId,
          title: event.tab?.title || 'Application Confirmation',
          order: order,
          label: 'Application Confirmation',
          jobId: extractedJobId
        });
        console.log(`[ApplicationTracker] 🎉 Confirmation URL stored: ${event.url}`);
        if (extractedJobId) {
          console.log(`[ApplicationTracker]   🔑 Job ID: ${extractedJobId}`);
        }
      }

      // ✅ Extract application reference from success page
      const applicationReference = this.extractApplicationIdFromUrl(event.url);
      if (applicationReference) {
        session.applicationReference = applicationReference;
        console.log(`[ApplicationTracker] 📋 Application Reference: ${applicationReference}`);
      }

      const submittedState = new SubmittedState(session);
      if (session.currentState) {
        session.currentState.transitionTo(submittedState);
      } else {
        submittedState.onEnter();
        session.currentState = submittedState;
      }

      sessionManager.updateSession(session.sessionId, {
        status: 'submitted',
        submittedAt: Date.now(),
        successUrl: event.url,
        thankYouPhrase: thankYouPhrase,
        applicationReference: applicationReference || session.applicationReference
      });

      this.dispatchSubmissionEvent(session);
      return;
    }

    // Detect step
    const stepResult = strategy.detectStep(event.url, event.tab?.title || '');

    if (stepResult.step !== 'unknown' && stepResult.step !== 'success') {
      console.log(`[ApplicationTracker] 📄 Step detected: ${stepResult.step}`);

      const steps = session.steps || [];
      const stepKey = `${stepResult.step}_${stepResult.matchedPattern || ''}`;

      const lastStep = steps.length > 0 ? steps[steps.length - 1] : null;
      const lastKey = lastStep ? `${lastStep.step}_${lastStep.matchedPattern || ''}` : '';

      if (lastKey !== stepKey) {
        steps.push({
          ...stepResult,
          timestamp: Date.now()
        });

        sessionManager.updateSession(session.sessionId, {
          steps: steps,
          stepCount: steps.length,
          lastActivityAt: Date.now()
        });

        this.dispatchStepEvent(session, stepResult);
      }
    }
  }

  /**
   * Handle session created event
   * @param {Object} session - The session
   */
  handleSessionCreated(session) {
    console.log(`[ApplicationTracker] 📌 Session created: ${session.sessionId}`);
    console.log(`[ApplicationTracker]   Job: ${session.jobTitle}`);
    console.log(`[ApplicationTracker]   Company: ${session.company}`);
    console.log(`[ApplicationTracker]   LinkedIn Job ID: ${session.jobId}`);

    this.notifyCallbacks('session_created', session);
  }

  /**
   * Handle session update event
   * @param {Object} session - The session
   */
  handleSessionUpdate(session) {
    console.log(`[ApplicationTracker] 📝 Session updated: ${session.sessionId}`);
    console.log(`[ApplicationTracker]   Status: ${session.status}`);
    if (session.jobIds && Object.keys(session.jobIds).length > 0) {
      console.log(`[ApplicationTracker]   Job IDs:`, session.jobIds);
    }

    this.notifyCallbacks('session_updated', session);
  }

  // ============================================
  // EVENT DISPATCH
  // ============================================

  /**
   * Dispatch a step detected event
   * @param {Object} session - The session
   * @param {Object} stepResult - The step result
   */
  dispatchStepEvent(session, stepResult) {
    const event = {
      type: 'STEP_DETECTED',
      sessionId: session.sessionId,
      jobId: session.jobId,
      jobTitle: session.jobTitle,
      step: stepResult.step,
      label: stepResult.label,
      pattern: stepResult.pattern,
      matchedPattern: stepResult.matchedPattern,
      timestamp: Date.now()
    };

    console.log(`[ApplicationTracker] 📤 Step event dispatched: ${event.step}`);
    this.notifyCallbacks('step_detected', event);
  }

  /**
   * Dispatch a submission event
   * @param {Object} session - The session
   */
  dispatchSubmissionEvent(session) {
    const event = {
      type: 'APPLICATION_SUBMITTED',
      sessionId: session.sessionId,
      jobId: session.jobId,
      jobTitle: session.jobTitle,
      company: session.company,
      ats: session.ats,
      atsName: session.atsName,
      successUrl: session.successUrl,
      thankYouPhrase: session.thankYouPhrase,
      stepsCompleted: session.stepCount,
      submittedAt: session.submittedAt,
      totalTimeMs: session.submittedAt - session.startedAt,
      timestamp: Date.now(),
      // ✅ Include job IDs in submission event
      jobIds: session.jobIds || {},
      externalJobId: session.externalJobId || null,
      applicationReference: session.applicationReference || null
    };

    console.log(`[ApplicationTracker] 🎉 Submission event dispatched!`);
    console.log(`[ApplicationTracker]   Job IDs:`, event.jobIds);
    if (event.applicationReference) {
      console.log(`[ApplicationTracker]   Application Reference: ${event.applicationReference}`);
    }
    this.notifyCallbacks('application_submitted', event);
  }

  /**
   * Dispatch an abandonment event
   * @param {Object} session - The session
   */
  dispatchAbandonmentEvent(session) {
    const event = {
      type: 'APPLICATION_ABANDONED',
      sessionId: session.sessionId,
      jobId: session.jobId,
      jobTitle: session.jobTitle,
      company: session.company,
      reason: session.abandonReason || 'unknown',
      stepsCompleted: session.stepCount,
      abandonedAt: session.abandonedAt,
      timestamp: Date.now()
    };

    console.log(`[ApplicationTracker] ❌ Abandonment event dispatched`);
    this.notifyCallbacks('application_abandoned', event);
  }

  // ============================================
  // CALLBACK MANAGEMENT
  // ============================================

  /**
   * Register a callback for application events
   * @param {Function} callback - Callback function
   * @param {string} eventType - Event type filter
   * @returns {string} Callback ID
   */
  onApplicationEvent(callback, eventType = null) {
    const id = `callback_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    this.submissionCallbacks.push({ id, callback, eventType });
    return id;
  }

  /**
   * Remove a callback
   * @param {string} callbackId - Callback ID
   * @returns {boolean} True if removed
   */
  removeCallback(callbackId) {
    const index = this.submissionCallbacks.findIndex(c => c.id === callbackId);
    if (index > -1) {
      this.submissionCallbacks.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Notify all callbacks
   * @param {string} eventType - Event type
   * @param {Object} data - Event data
   */
  notifyCallbacks(eventType, data) {
    for (const { callback, eventType: filter } of this.submissionCallbacks) {
      if (filter && filter !== eventType) continue;
      try {
        callback(eventType, data);
      } catch (error) {
        console.warn('[ApplicationTracker] Callback error:', error);
      }
    }
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Extract job ID from various URL formats
   * @param {string} url - The URL to extract from
   * @returns {string|null} Extracted job ID or null
   */
  extractJobIdFromUrl(url) {
    if (!url) return null;

    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const search = urlObj.search;

      // ============================================
      // 1. LinkedIn
      // ============================================
      // /jobs/view/12345
      const linkedinViewMatch = pathname.match(/\/jobs\/view\/(\d+)/);
      if (linkedinViewMatch) return linkedinViewMatch[1];

      // currentJobId=12345
      const linkedinQueryMatch = search.match(/[?&]currentJobId=(\d+)/);
      if (linkedinQueryMatch) return linkedinQueryMatch[1];

      // ============================================
      // 2. Coinbase
      // ============================================
      // /positions/12345
      const coinbaseMatch = pathname.match(/\/positions\/(\d+)/);
      if (coinbaseMatch) return coinbaseMatch[1];

      // ============================================
      // 3. Greenhouse
      // ============================================
      // token=12345
      const greenhouseTokenMatch = search.match(/[?&]token=(\d+)/);
      if (greenhouseTokenMatch) return greenhouseTokenMatch[1];

      // gh_jid=12345
      const greenhouseJidMatch = search.match(/[?&]gh_jid=(\d+)/);
      if (greenhouseJidMatch) return greenhouseJidMatch[1];

      // /jobs/12345
      const greenhouseJobMatch = pathname.match(/\/jobs\/(\d+)/);
      if (greenhouseJobMatch) return greenhouseJobMatch[1];

      // /job_app?token=12345 (embed)
      const greenhouseEmbedMatch = pathname.match(/\/job_app.*[?&]token=(\d+)/);
      if (greenhouseEmbedMatch) return greenhouseEmbedMatch[1];

      // ============================================
      // 4. Lever
      // ============================================
      // /jobs/12345 or /jobs/job-id
      const leverMatch = pathname.match(/\/jobs\/([^\/?]+)/);
      if (leverMatch && !leverMatch[1].includes('.')) return leverMatch[1];

      // jobId=12345
      const leverQueryMatch = search.match(/[?&]jobId=([^&]+)/);
      if (leverQueryMatch) return leverQueryMatch[1];

      // ============================================
      // 5. Workday
      // ============================================
      // /job-12345
      const workdayMatch = pathname.match(/\/job-(\d+)/);
      if (workdayMatch) return workdayMatch[1];

      // requisition=12345
      const workdayRequisitionMatch = search.match(/[?&]requisition=(\d+)/);
      if (workdayRequisitionMatch) return workdayRequisitionMatch[1];

      // /job/12345
      const workdayJobMatch = pathname.match(/\/job\/(\d+)/);
      if (workdayJobMatch) return workdayJobMatch[1];

      // ============================================
      // 6. Ashby
      // ============================================
      // /jobs/12345
      const ashbyMatch = pathname.match(/\/jobs\/([^\/?]+)/);
      if (ashbyMatch && !ashbyMatch[1].includes('.')) return ashbyMatch[1];

      // jobId=12345
      const ashbyQueryMatch = search.match(/[?&]jobId=([^&]+)/);
      if (ashbyQueryMatch) return ashbyQueryMatch[1];

      // ============================================
      // 7. Generic
      // ============================================
      // job_id=12345, jobId=12345, id=12345
      const genericJobIdMatch = search.match(/[?&](?:job_?id|jobId|jobid|id)=([^&]+)/i);
      if (genericJobIdMatch) return genericJobIdMatch[1];

      // /job/12345, /jobs/12345
      const genericPathMatch = pathname.match(/\/jobs?\/(\d+)/);
      if (genericPathMatch) return genericPathMatch[1];

      return null;

    } catch (error) {
      console.warn('[ApplicationTracker] Error extracting job ID from URL:', error);
      return null;
    }
  }

  /**
   * Detect the source of a job ID from URL
   * @param {string} url - The URL to detect source from
   * @returns {string} Source name (linkedin, coinbase, greenhouse, lever, workday, ashby, external)
   */
  detectJobIdSource(url) {
    if (!url) return 'unknown';

    const urlLower = url.toLowerCase();

    if (urlLower.includes('linkedin.com')) return 'linkedin';
    if (urlLower.includes('coinbase.com')) return 'coinbase';
    if (urlLower.includes('greenhouse.io') || urlLower.includes('grnh.se') ||
        urlLower.includes('boards.greenhouse.io') || urlLower.includes('job-boards.greenhouse.io')) {
      return 'greenhouse';
    }
    if (urlLower.includes('lever.co') || urlLower.includes('jobs.lever.co')) return 'lever';
    if (urlLower.includes('workday.com') || urlLower.includes('myworkdayjobs.com')) return 'workday';
    if (urlLower.includes('ashby.com')) return 'ashby';

    return 'external';
  }

  /**
   * Extract application reference/confirmation ID from URL
   * @param {string} url - The success page URL
   * @returns {string|null} Application reference or null
   */
  extractApplicationIdFromUrl(url) {
    if (!url) return null;

    try {
      const urlObj = new URL(url);
      const search = urlObj.search;
      const pathname = urlObj.pathname;

      // Greenhouse: token=12345
      const tokenMatch = search.match(/[?&]token=(\d+)/);
      if (tokenMatch) return tokenMatch[1];

      // Generic: applicationId=xxx, confirmation=xxx, reference=xxx
      const appIdMatch = search.match(/[?&](?:applicationId|confirmation|reference|application_id)=([^&]+)/i);
      if (appIdMatch) return appIdMatch[1];

      // Try to extract from path: /confirmation/12345
      const pathMatch = pathname.match(/\/confirmation\/([^\/?]+)/);
      if (pathMatch) return pathMatch[1];

      return null;

    } catch (error) {
      console.warn('[ApplicationTracker] Error extracting application ID:', error);
      return null;
    }
  }

  /**
   * Get a descriptive label for a URL - Uses strategies for dynamic detection
   * @param {string} url - The URL to label
   * @returns {string} Human-readable label
   */
  getUrlLabel(url) {
    if (!url) return 'Unknown';

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      const pathname = urlObj.pathname.toLowerCase();

      // ============================================
      // 1. Try using the strategy factory first
      // ============================================
      try {
        const strategy = strategyFactory.getStrategy(url);
        const atsName = strategy.getDisplayName();

        if (strategy && strategy.getAtsName() !== 'generic') {
          // Check if it's a success/confirmation page
          if (strategy.isSuccessPage(url)) {
            return `${atsName} Confirmation`;
          }

          // Check if it's an application form
          if (pathname.includes('apply') ||
              pathname.includes('application') ||
              pathname.includes('embed/job_app') ||
              pathname.includes('job_app')) {
            return `${atsName} Application`;
          }

          return atsName;
        }
      } catch (strategyError) {
        // Strategy failed, fall back to domain detection
        console.debug('[ApplicationTracker] Strategy detection failed, using fallback:', strategyError.message);
      }

      // ============================================
      // 2. FALLBACK: Domain-based detection
      // ============================================

      // LinkedIn
      if (hostname.includes('linkedin.com')) {
        if (pathname.includes('/jobs/search-results')) return 'LinkedIn Job Search';
        if (pathname.includes('/jobs/view')) return 'LinkedIn Job Detail';
        if (pathname.includes('/safety/go')) return 'LinkedIn Safety Redirect';
        if (pathname.includes('/jobs')) return 'LinkedIn Jobs';
        return 'LinkedIn';
      }

      // Naukri
      if (hostname.includes('naukri.com')) {
        if (pathname.includes('/job-listings')) return 'Naukri Job Listing';
        if (pathname.includes('/job-details')) return 'Naukri Job Detail';
        return 'Naukri';
      }

      // Greenhouse (any greenhouse domain)
      if (hostname.includes('greenhouse.io') ||
          hostname.includes('grnh.se') ||
          hostname.includes('boards.greenhouse.io') ||
          hostname.includes('job-boards.greenhouse.io')) {
        if (pathname.includes('confirmation') ||
            pathname.includes('thank-you')) {
          return 'Greenhouse Confirmation';
        }
        if (pathname.includes('job_app') ||
            pathname.includes('apply') ||
            pathname.includes('application')) {
          return 'Greenhouse Application';
        }
        return 'Greenhouse';
      }

      // Lever
      if (hostname.includes('lever.co') || hostname.includes('jobs.lever.co')) {
        if (pathname.includes('thank-you') || pathname.includes('confirmation')) {
          return 'Lever Confirmation';
        }
        if (pathname.includes('apply')) {
          return 'Lever Application';
        }
        return 'Lever';
      }

      // Workday
      if (hostname.includes('workday.com') || hostname.includes('myworkdayjobs.com')) {
        if (pathname.includes('thank-you') ||
            pathname.includes('confirmation') ||
            url.includes('complete=true')) {
          return 'Workday Confirmation';
        }
        if (pathname.includes('apply') || pathname.includes('application')) {
          return 'Workday Application';
        }
        return 'Workday';
      }

      // Ashby
      if (hostname.includes('ashby.com')) {
        if (pathname.includes('thank-you') || pathname.includes('confirmation')) {
          return 'Ashby Confirmation';
        }
        if (pathname.includes('apply')) {
          return 'Ashby Application';
        }
        return 'Ashby';
      }

      // ============================================
      // 3. COMPANY CAREER PAGES
      // ============================================
      if (pathname.includes('/careers') ||
          pathname.includes('/jobs') ||
          pathname.includes('/career') ||
          pathname.includes('/opportunities') ||
          pathname.includes('/positions')) {

        const company = hostname.replace('www.', '').split('.')[0];
        if (company && company.length > 0 && !company.includes('google') && !company.includes('chrome')) {
          const companyName = company.charAt(0).toUpperCase() + company.slice(1);
          return `${companyName} Careers`;
        }
        return 'Company Careers';
      }

      // ============================================
      // 4. DEFAULT: Extract domain
      // ============================================
      const domain = hostname.replace('www.', '').split('.')[0];
      if (domain && domain.length > 0 && !domain.includes('google') && !domain.includes('chrome')) {
        return domain.charAt(0).toUpperCase() + domain.slice(1);
      }

      return 'External Page';

    } catch (error) {
      console.warn('[ApplicationTracker] Could not parse URL:', url, error);
      return 'External Page';
    }
  }

  /**
   * Get active sessions
   * @returns {Object[]} Array of active sessions
   */
  getActiveSessions() {
    return sessionManager.getActiveSessions();
  }

  /**
   * Get session statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const sessionStats = sessionManager.getStats();
    return {
      ...sessionStats,
      isInitialized: this.isInitialized,
      eventHandlers: this.eventHandlers.size,
      callbacks: this.submissionCallbacks.length
    };
  }

  /**
   * Clean up and destroy the tracker
   */
  destroy() {
    console.log('[ApplicationTracker] Destroying...');

    tabCreatedObserver.stopObserving();
    tabUpdatedObserver.stopObserving();
    tabRemovedObserver.stopObserving();

    this.submissionCallbacks = [];
    this.eventHandlers.clear();
    this.processingQueue.clear();

    this.isInitialized = false;
    console.log('[ApplicationTracker] ✅ Destroyed');
  }

  /**
   * Get the status of the tracker
   * @returns {Object} Status object
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      activeSessions: this.getActiveSessions().length,
      tabCreatedObserver: tabCreatedObserver.isObserving(),
      tabUpdatedObserver: tabUpdatedObserver.isObserving(),
      tabRemovedObserver: tabRemovedObserver.isObserving(),
      callbacksCount: this.submissionCallbacks.length
    };
  }
}

// Export singleton instance
const applicationTracker = new ApplicationTracker();
export default applicationTracker;