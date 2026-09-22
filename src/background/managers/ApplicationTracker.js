// src/background/managers/ApplicationTracker.js

import sessionManager from './SessionManager.js';
import strategyFactory from '../patterns/factories/StrategyFactory.js';
import tabCreatedObserver from '../patterns/observers/TabCreatedObserver.js';
import tabUpdatedObserver from '../patterns/observers/TabUpdatedObserver.js';
import tabRemovedObserver from '../patterns/observers/TabRemovedObserver.js';
import { InProgressState } from '../patterns/states/InProgressState.js';
import { SubmittedState } from '../patterns/states/SubmittedState.js';
import { AbandonedState } from '../patterns/states/AbandonedState.js';
import { STATES } from '../patterns/states/state-registry.js';


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
   */
  async handleApplyClick(data, callback) {
    console.log('[ApplicationTracker] 📌 Processing apply click...');
    console.log(`[ApplicationTracker]   Job: ${data.jobData.title}`);
    console.log(`[ApplicationTracker]   Company: ${data.jobData.company}`);
    console.log(`[ApplicationTracker]   Redirect: ${data.applyData.redirectUrl}`);

    try {
      const session = sessionManager.createSession(data.jobData, data.applyData);

      // Detect ATS and set strategy
      const strategy = strategyFactory.getStrategy(data.applyData.redirectUrl);
      session.ats = strategy.getAtsName();
      session.atsName = strategy.getDisplayName();
      session.atsStrategy = strategy;

      console.log(`[ApplicationTracker] ✅ Session created: ${session.sessionId}`);
      console.log(`[ApplicationTracker]   ATS detected: ${session.atsName}`);

      session.applyData = data.applyData;

      if (!session.jobIds) {
        session.jobIds = {};
      }
      if (session.jobId) {
        session.jobIds.linkedin = session.jobId;
        console.log(`[ApplicationTracker] 🔑 LinkedIn Job ID: ${session.jobId}`);
      }

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
          jobId: jobId
        });
        console.log(`[ApplicationTracker] 📌 #1 [${this.getUrlLabel(sourceUrl)}]: ${sourceUrl}`);
        if (jobId) {
          console.log(`[ApplicationTracker]   🔑 Job ID: ${jobId}`);
        }
      }

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
            jobId: jobId
          });
          console.log(`[ApplicationTracker] 📌 #${order} [${this.getUrlLabel(data.applyData.redirectUrl)}]: ${data.applyData.redirectUrl}`);
          if (jobId) {
            console.log(`[ApplicationTracker]   🔑 Job ID: ${jobId}`);
          }
        }
      }

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
   * Handle tab created event
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
        await this._pushTabUrlToSession(session, event.tabId);

        const updated = sessionManager.updateSession(session.sessionId, {
          status: 'redirecting',
          redirectTabId: event.tabId,
          redirectedAt: Date.now()
        });

        const redirectingState = new STATES.redirecting(updated);
        updated.currentState.transitionTo(redirectingState);

        console.log(`[ApplicationTracker] ✅ Session transitioned to RedirectingState`);
        console.log(`[ApplicationTracker]   Tracking tab: ${event.tabId}`);
        return;
      }
    }

    // 2. Check ALL active sessions
    const allSessions = sessionManager.getActiveSessions();
    console.log(`[ApplicationTracker]   Checking ${allSessions.length} active sessions`);

    for (const s of allSessions) {
      console.log(`[ApplicationTracker]   Session ${s.sessionId}: status=${s.status}, trackedTabs=${s.trackedTabs?.join(', ') || 'none'}`);
    }

    // FIRST PASS: by opener tab ID
    for (const session of allSessions) {
      if (session.status === 'submitted' || session.status === 'abandoned') continue;

      if (session.trackedTabs && session.trackedTabs.includes(event.openerTabId)) {
        console.log(`[ApplicationTracker] ✅✅ Tab ${event.tabId} opened from tracked tab ${event.openerTabId}`);
        console.log(`[ApplicationTracker]   Session: ${session.sessionId}`);
        console.log(`[ApplicationTracker]   Job: ${session.jobTitle}`);
        sessionManager.mapTabToSession(event.tabId, session.sessionId);
        await this._pushTabUrlToSession(session, event.tabId);
        console.log(`[ApplicationTracker]   Tracked tabs: ${session.trackedTabs.join(', ')}`);
        return;
      }
    }

    // SECOND PASS: by redirect tab ID
    for (const session of allSessions) {
      if (session.status === 'submitted' || session.status === 'abandoned') continue;

      if (session.redirectTabId === event.openerTabId) {
        console.log(`[ApplicationTracker] ✅ Tab ${event.tabId} opened from redirect tab ${event.openerTabId}`);
        console.log(`[ApplicationTracker]   Session: ${session.sessionId}`);
        console.log(`[ApplicationTracker]   Job: ${session.jobTitle}`);
        sessionManager.mapTabToSession(event.tabId, session.sessionId);
        await this._pushTabUrlToSession(session, event.tabId);
        console.log(`[ApplicationTracker]   Mapped tab to session`);
        return;
      }
    }

    // THIRD PASS: new tab URL is itself a job page
    if (event.tab && event.tab.url) {
      const url = event.tab.url;

      if (this.isJobPageFromUrl(url)) {
        console.log(`[ApplicationTracker] 🎯 New tab is a job page: ${url}`);

        const candidates = allSessions
          .filter(s => s.status !== 'submitted' && s.status !== 'abandoned')
          .sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0));

        if (candidates.length > 0) {
          const session = candidates[0];
          console.log(`[ApplicationTracker] ✅ Mapping new job-page tab to most recent active session: ${session.sessionId}`);
          sessionManager.mapTabToSession(event.tabId, session.sessionId);
          console.log(`[ApplicationTracker]   Tracked tabs: ${session.trackedTabs.join(', ')}`);

          await this.processSessionUpdate(session, {
            tabId: event.tabId,
            url: url,
            tab: event.tab
          });
          return;
        }
      }
    }

    console.log(`[ApplicationTracker] ⚠️ No session found for tab ${event.tabId}`);
  }

  /**
   * Fetch a tab's current URL and push it into the session's
   * visitedUrls if not already present.
   *
   * Called right after mapping a tab to a session. The TAB_CREATED
   * event fires before the tab has navigated, so we have to look up
   * the tab again to get its current URL.
   *
   * @param {Object} session - The session to push into
   * @param {number} tabId   - The tab whose URL to record
   */
  async _pushTabUrlToSession(session, tabId) {
    if (!session || !tabId) return;

    let tabInfo = null;
    try {
      tabInfo = await chrome.tabs.get(tabId);
    } catch (e) {
      // Tab may have been closed already
      return;
    }

    const currentUrl = tabInfo?.url;
    if (!currentUrl) return;

    if (!session.visitedUrls) session.visitedUrls = [];

    const exists = session.visitedUrls.some(entry => entry.url === currentUrl);
    if (exists) return;

    const order = session.visitedUrls.length + 1;
    const jobId = this.extractJobIdFromUrl(currentUrl);
    const label = this.getUrlLabel(currentUrl);

    let title = tabInfo.title || null;
    if (title && this.looksLikeUrl(title)) {
      title = null;
    }

    session.visitedUrls.push({
      url: currentUrl,
      timestamp: Date.now(),
      tabId,
      title,
      order,
      label,
      jobId
    });

    console.log(`[ApplicationTracker] 📌 #${order} [${label}]: ${currentUrl}`);
    if (jobId) {
      console.log(`[ApplicationTracker]   🔑 Job ID: ${jobId}`);
    }
  }

  /**
   * Handle tab updated event
   */
  async handleTabUpdated(event) {
    const session = sessionManager.getSessionByTabId(event.tabId);
    if (!session) {
      const allSessions = sessionManager.getActiveSessions();
      for (const s of allSessions) {
        if (s.trackedTabs && s.trackedTabs.includes(event.tabId)) {
          console.log(`[ApplicationTracker] 🔄 Tab ${event.tabId} is tracked in session ${s.sessionId}`);
          await this.processSessionUpdate(s, event);
          return;
        }
      }

      if (this.isJobPageFromUrl(event.url)) {
        const existingSession = this.findSessionForUrl(event.url);

        if (existingSession) {
          console.log(`[ApplicationTracker] ♻️ Found existing session for URL: ${existingSession.sessionId}`);
          console.log(`[ApplicationTracker]   Status: ${existingSession.status}`);

          sessionManager.mapTabToSession(event.tabId, existingSession.sessionId);

          if (existingSession.status === 'abandoned') {
            console.log(`[ApplicationTracker] 🔄 Reactivating abandoned session`);
            sessionManager.updateSession(existingSession.sessionId, {
              status: 'in_progress',
              lastActivityAt: Date.now()
            });
          }

          await this.processSessionUpdate(existingSession, event);
          return;
        }

        console.log(`[ApplicationTracker] 🆕 Auto-creating session for job page: ${event.url}`);
        const newSession = this.createSessionFromUrl(event.url, event.tab);

        if (newSession) {
          console.log(`[ApplicationTracker] ✅ Auto-created session: ${newSession.sessionId}`);
          await this.processSessionUpdate(newSession, event);
          return;
        }
      }

      return;
    }

    await this.processSessionUpdate(session, event);
  }

  /**
   * Process session update - handles ALL URL changes in tracked tabs
   */
  async processSessionUpdate(session, event) {
    if (!session) return;

    if (session.status === 'submitted' || session.status === 'abandoned') {
      return;
    }

    console.log(`[ApplicationTracker] 🔄 Tab updated: ${event.tabId}`);
    console.log(`[ApplicationTracker]   Session: ${session.sessionId}`);
    console.log(`[ApplicationTracker]   Status: ${session.status}`);
    console.log(`[ApplicationTracker]   URL: ${event.url}`);

    if (!session.visitedUrls) {
      session.visitedUrls = [];
    }

    const exists = session.visitedUrls.some(entry => entry.url === event.url);
    if (!exists && event.url) {
      const order = session.visitedUrls.length + 1;
      const extractedJobId = this.extractJobIdFromUrl(event.url);

      // Guard: tab.title is sometimes the URL before the page loads.
      let pageTitle = event.tab?.title || null;
      if (pageTitle && this.looksLikeUrl(pageTitle)) {
        pageTitle = null;
      }

      session.visitedUrls.push({
        url: event.url,
        timestamp: Date.now(),
        tabId: event.tabId,
        title: pageTitle,
        order: order,
        label: this.getUrlLabel(event.url),
        jobId: extractedJobId
      });

      console.log(`[ApplicationTracker] 📌 #${order} [${this.getUrlLabel(event.url)}]: ${event.url}`);
      if (extractedJobId) {
        console.log(`[ApplicationTracker]   🔑 Job ID: ${extractedJobId}`);
      }

      if (extractedJobId) {
        if (!session.jobIds) {
          session.jobIds = {};
        }
        const source = this.detectJobIdSource(event.url);
        if (!session.jobIds[source]) {
          session.jobIds[source] = extractedJobId;
          console.log(`[ApplicationTracker] 🔑 Added Job ID: ${source} = ${extractedJobId}`);
        }

        if (!session.externalJobId) {
          session.externalJobId = extractedJobId;
          console.log(`[ApplicationTracker] 🔑 External Job ID set: ${extractedJobId}`);
        }
      }
    }

    // Re-evaluate strategy when current is generic and a specific one now matches.
    // Example: LinkedIn safety redirect → Payoneer page with Greenhouse iframe.
    const currentStrategyName = session.atsStrategy?.getAtsName?.() || 'generic';

    if (!session.atsStrategy || currentStrategyName === 'generic') {
      const strategy = strategyFactory.getStrategy(event.url);
      const newAtsName = strategy.getAtsName();

      if (!session.atsStrategy || newAtsName !== currentStrategyName) {
        console.log(`[ApplicationTracker]   Strategy updated: ${currentStrategyName} → ${newAtsName}`);
        session.atsStrategy = strategy;
        session.ats = newAtsName;
        session.atsName = strategy.getDisplayName();
      }
    }

    // CRITICAL: success page detection in ANY state
    if (session.atsStrategy && session.atsStrategy.isSuccessPage(event.url)) {
      console.log(`[ApplicationTracker] 🎉 SUCCESS PAGE DETECTED!`);
      console.log(`[ApplicationTracker]   URL: ${event.url}`);
      console.log(`[ApplicationTracker]   Session status before: ${session.status}`);
      console.log(`[ApplicationTracker]   Tab: ${event.tabId} (same tab, no new window)`);

      const thankYouPhrase = session.atsStrategy.extractThankYouMessage(
        event.url,
        event.tab?.title || '',
        null
      );

      const successExists = session.visitedUrls.some(entry => entry.url === event.url);
      if (!successExists && event.url) {
        const order = session.visitedUrls.length + 1;
        const extractedJobId = this.extractJobIdFromUrl(event.url);

        let confirmTitle = event.tab?.title || null;
        if (confirmTitle && this.looksLikeUrl(confirmTitle)) {
          confirmTitle = null;
        }

        session.visitedUrls.push({
          url: event.url,
          timestamp: Date.now(),
          tabId: event.tabId,
          title: confirmTitle || 'Application Confirmation',
          order: order,
          label: 'Application Confirmation',
          jobId: extractedJobId
        });
        console.log(`[ApplicationTracker] 🎉 Confirmation URL stored: ${event.url}`);
        if (extractedJobId) {
          console.log(`[ApplicationTracker]   🔑 Job ID: ${extractedJobId}`);
        }
      }

      const applicationReference = this.extractApplicationIdFromUrl(event.url);
      if (applicationReference) {
        session.applicationReference = applicationReference;
        console.log(`[ApplicationTracker] 📋 Application Reference: ${applicationReference}`);
      }

      sessionManager.updateSession(session.sessionId, {
        status: 'submitted',
        submittedAt: Date.now(),
        successUrl: event.url,
        thankYouPhrase: thankYouPhrase || 'Application submitted successfully',
        applicationReference: applicationReference || session.applicationReference
      });

      const submittedState = new STATES.submitted(session);
      if (session.currentState) {
        session.currentState.transitionTo(submittedState);
      } else {
        submittedState.onEnter();
        session.currentState = submittedState;
      }

      console.log(`[ApplicationTracker] ✅ Session ${session.sessionId} marked as SUBMITTED!`);
      console.log(`[ApplicationTracker]   Tab: ${event.tabId} (same tab tracking works!) 🎉`);

      this.dispatchSubmissionEvent(session);
      return;
    }

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
   */
  async handleTabRemoved(event) {
    const session = sessionManager.getSessionByTabId(event.tabId);
    if (!session) {
      const allSessions = sessionManager.getActiveSessions();
      for (const s of allSessions) {
        if (s.trackedTabs && s.trackedTabs.includes(event.tabId)) {
          console.log(`[ApplicationTracker] ❌ Tracked tab removed: ${event.tabId}`);
          console.log(`[ApplicationTracker]   Session: ${s.sessionId}`);
          console.log(`[ApplicationTracker]   Job: ${s.jobTitle}`);

          if (s.sourceTabId !== event.tabId && s.redirectTabId !== event.tabId) {
            const tabs = s.trackedTabs.filter(id => id !== event.tabId);
            s.trackedTabs = tabs;
            sessionManager.persistToStorage();
            console.log(`[ApplicationTracker]   Removed tab from tracked tabs: ${event.tabId}`);
            console.log(`[ApplicationTracker]   Remaining tabs: ${s.trackedTabs.join(', ')}`);
            return;
          }

          if (s.redirectTabId === event.tabId && s.status !== 'submitted') {
            console.log(`[ApplicationTracker] ❌ Redirect tab closed: ${event.tabId}`);
            const abandonReason = s.status === 'in_progress'
              ? 'tab_closed_during_application'
              : 'tab_closed_before_load';
            const abandonedState = new STATES.abandoned(s, abandonReason);
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

    if (session.status === 'submitted' || session.status === 'abandoned') {
      return;
    }

    console.log(`[ApplicationTracker] ❌ Tab removed: ${event.tabId}`);
    console.log(`[ApplicationTracker]   Session: ${session.sessionId}`);
    console.log(`[ApplicationTracker]   Job: ${session.jobTitle}`);

    const isSourceTab = session.sourceTabId === event.tabId;
    const isRedirectTab = session.redirectTabId === event.tabId;

    if (isSourceTab && session.status === 'initiated') {
      console.log('[ApplicationTracker] Source tab closed before redirect');
      sessionManager.removeSession(session.sessionId, 'source_tab_closed');
      return;
    }

    if (isRedirectTab) {
      console.log('[ApplicationTracker] Redirect tab closed during application');

      const abandonReason = session.status === 'in_progress'
        ? 'tab_closed_during_application'
        : 'tab_closed_before_load';

      const abandonedState = new STATES.abandoned(session, abandonReason);
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

  async handleRedirectingTab(session, event) {
    console.log(`[ApplicationTracker] 🔄 Handling redirecting tab: ${session.sessionId}`);
    console.log(`[ApplicationTracker]   Tab: ${event.tabId}`);
    console.log(`[ApplicationTracker]   URL: ${event.url}`);

    const strategy = session.atsStrategy;
    if (!strategy) return;

    const stepResult = strategy.detectStep(event.url, event.tab?.title || '');
    console.log(`[ApplicationTracker]   Step detected: ${stepResult.step}`);

    if (stepResult.step !== 'unknown') {
      console.log(`[ApplicationTracker] ✅ Step detected: ${stepResult.step}`);
      console.log(`[ApplicationTracker]   In same tab: ${event.tabId}`);

      const inProgressState = new InProgressState(session);
      if (session.currentState) {
        session.currentState.transitionTo(inProgressState);
      } else {
        inProgressState.onEnter();
        session.currentState = inProgressState;
      }

      if (stepResult.step === 'success') {
        console.log(`[ApplicationTracker] 🎉 Success step detected, transitioning to SubmittedState`);
        const submittedState = new STATES.submitted(session);
        inProgressState.transitionTo(submittedState);
        return true;
      }

      sessionManager.updateSession(session.sessionId, {
        status: 'in_progress',
        steps: [stepResult],
        stepCount: 1,
        lastActivityAt: Date.now()
      });

      this.dispatchStepEvent(session, stepResult);
    }
  }

  async handleInProgressTab(session, event) {
    console.log(`[ApplicationTracker] 📝 Handling in-progress tab: ${session.sessionId}`);
    console.log(`[ApplicationTracker]   Tab: ${event.tabId}`);
    console.log(`[ApplicationTracker]   URL: ${event.url}`);

    const strategy = session.atsStrategy;
    if (!strategy) return;

    if (strategy.isSuccessPage(event.url)) {
      console.log(`[ApplicationTracker] 🎉 Success page detected!`);

      const thankYouPhrase = strategy.extractThankYouMessage(
        event.url,
        event.tab?.title || '',
        null
      );

      if (!session.visitedUrls) {
        session.visitedUrls = [];
      }
      const successExists = session.visitedUrls.some(entry => entry.url === event.url);
      if (!successExists && event.url) {
        const order = session.visitedUrls.length + 1;
        const extractedJobId = this.extractJobIdFromUrl(event.url);

        let confirmTitle = event.tab?.title || null;
        if (confirmTitle && this.looksLikeUrl(confirmTitle)) {
          confirmTitle = null;
        }

        session.visitedUrls.push({
          url: event.url,
          timestamp: Date.now(),
          tabId: event.tabId,
          title: confirmTitle || 'Application Confirmation',
          order: order,
          label: 'Application Confirmation',
          jobId: extractedJobId
        });
        console.log(`[ApplicationTracker] 🎉 Confirmation URL stored: ${event.url}`);
        if (extractedJobId) {
          console.log(`[ApplicationTracker]   🔑 Job ID: ${extractedJobId}`);
        }
      }

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

  handleSessionCreated(session) {
    console.log(`[ApplicationTracker] 📌 Session created: ${session.sessionId}`);
    console.log(`[ApplicationTracker]   Job: ${session.jobTitle}`);
    console.log(`[ApplicationTracker]   Company: ${session.company}`);
    console.log(`[ApplicationTracker]   LinkedIn Job ID: ${session.jobId}`);

    this.notifyCallbacks('session_created', session);
  }

  handleSessionUpdate(session) {
    console.log(`[ApplicationTracker] 📝 Session updated: ${session.sessionId}`);
    console.log(`[ApplicationTracker]   Status: ${session.status}`);
    if (session.jobIds && Object.keys(session.jobIds).length > 0) {
      console.log(`[ApplicationTracker]   Job IDs:`, session.jobIds);
    }

    this.notifyCallbacks('session_updated', session);
  }

  handleSuccessDetected(session, payload) {
    console.log('[ApplicationTracker] 🎉 Content-based success for:', session.sessionId);
    console.log('[ApplicationTracker]   Phrase:', payload.phrase);
    console.log('[ApplicationTracker]   URL:', payload.url);
    console.log('[ApplicationTracker]   Method:', payload.detectionMethod || 'content');
    console.log('[ApplicationTracker]   From iframe:', payload.isIframe ? 'yes' : 'no');

    if (session.status === 'submitted') {
      console.log('[ApplicationTracker] Session already submitted, skipping');
      return;
    }

    sessionManager.updateSession(session.sessionId, {
      status: 'submitted',
      submittedAt: Date.now(),
      successUrl: payload.url,
      thankYouPhrase: payload.phrase,
      successDetectionMethod: payload.detectionMethod || 'content'
    });

    const submittedState = new STATES.submitted(session);
    if (session.currentState) {
      session.currentState.transitionTo(submittedState);
    } else {
      submittedState.onEnter();
      session.currentState = submittedState;
    }

    console.log(`[ApplicationTracker] ✅ Session ${session.sessionId} marked as SUBMITTED (content-based)!`);

    this.dispatchSubmissionEvent(session);
  }

  // ============================================
  // AUTO-SESSION CREATION
  // ============================================

  isJobPageFromUrl(url) {
    if (!url) return false;

    const urlLower = url.toLowerCase();

    if (urlLower.includes('gh_jid=') || urlLower.includes('gh_src=')) {
      return true;
    }

    const patterns = [
      /greenhouse\.io/,
      /grnh\.se/,
      /lever\.co/,
      /myworkdayjobs\.com/,
      /workday\.com/,
      /ashbyhq\.com/,
      /ashby\.com/,
      /smartrecruiters\.com/,
      /icims\.com/,
      /bamboohr\.com/,
      /taleo\.net/,
      /deel\.com/,
      /jobs\.deel/
    ];

    return patterns.some(p => p.test(urlLower));
  }

  findSessionForUrl(url) {
    if (!url) return null;

    const normalize = (u) => {
      try {
        const parsed = new URL(u);
        const keep = ['gh_jid', 'gh_src', 'jobId', 'job_id', 'currentJobId', 'token', 'jid'];
        const params = new URLSearchParams();
        for (const [k, v] of parsed.searchParams) {
          if (keep.includes(k)) params.set(k, v);
        }
        const clean = new URL(parsed.origin + parsed.pathname);
        const qs = params.toString();
        if (qs) clean.search = qs;
        return clean.toString().replace(/\/$/, '');
      } catch {
        return u;
      }
    };

    const target = normalize(url);

    const allSessions = sessionManager.getSessions({
      includeCompleted: true,
      includeAbandoned: true
    });

    for (const s of allSessions) {
      const candidates = [s.jobUrl, s.redirectUrl, s.applyUrl];
      if (s.visitedUrls) {
        for (const v of s.visitedUrls) candidates.push(v.url);
      }

      for (const c of candidates) {
        if (c && normalize(c) === target) {
          return s;
        }
      }
    }

    return null;
  }

  createSessionFromUrl(url, tab) {
    if (!url) return null;

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace('www.', '');
      const company = hostname.split('.')[0];
      const companyName = company.charAt(0).toUpperCase() + company.slice(1);

      const strategy = strategyFactory.getStrategy(url);
      const atsName = strategy.getAtsName();
      const jobId = this.extractJobIdFromUrl(url);

      const rawTitle = tab?.title || '';
      const titleIsUrl = this.looksLikeUrl(rawTitle);
      const jobTitle = (!titleIsUrl && rawTitle) ? rawTitle : 'Unknown Job';

      const session = sessionManager.createSession(
        {
          externalJobId: jobId,
          title: jobTitle,
          company: companyName,
          url: url
        },
        {
          redirectUrl: url,
          sourceTabId: tab?.id,
          applyType: 'direct',
          applyMethod: 'direct_navigation'
        }
      );

      session.ats = atsName;
      session.atsName = strategy.getDisplayName();
      session.atsStrategy = strategy;

      if (!session.jobIds) session.jobIds = {};
      if (jobId) {
        const source = this.detectJobIdSource(url);
        session.jobIds[source] = jobId;
        session.externalJobId = jobId;
      }

      if (!session.visitedUrls) session.visitedUrls = [];
      session.visitedUrls.push({
        url: url,
        timestamp: Date.now(),
        tabId: tab?.id,
        title: titleIsUrl ? null : (tab?.title || null),
        order: 1,
        label: this.getUrlLabel(url),
        jobId: jobId
      });

      if (tab?.id) {
        sessionManager.mapTabToSession(tab.id, session.sessionId);
      }

      console.log('[ApplicationTracker] ✅ Auto-created session from URL');
      console.log(`[ApplicationTracker]   Job: ${session.jobTitle}`);
      console.log(`[ApplicationTracker]   Company: ${session.company}`);
      console.log(`[ApplicationTracker]   ATS: ${session.atsName}`);
      console.log(`[ApplicationTracker]   Job ID: ${jobId}`);

      return session;
    } catch (error) {
      console.error('[ApplicationTracker] Failed to create session from URL:', error);
      return null;
    }
  }

  // ============================================
  // EVENT DISPATCH
  // ============================================

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

  onApplicationEvent(callback, eventType = null) {
    const id = `callback_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    this.submissionCallbacks.push({ id, callback, eventType });
    return id;
  }

  removeCallback(callbackId) {
    const index = this.submissionCallbacks.findIndex(c => c.id === callbackId);
    if (index > -1) {
      this.submissionCallbacks.splice(index, 1);
      return true;
    }
    return false;
  }

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
   * Check if a string looks like a URL (with or without protocol).
   * Used to guard against Chrome reporting tab.title as the URL
   * before a page fully loads.
   *
   * @param {string} str
   * @returns {boolean}
   */
  looksLikeUrl(str) {
    if (!str || typeof str !== 'string') return false;

    // Has protocol
    if (/^https?:\/\//i.test(str)) return true;
    if (str.includes('://')) return true;

    // Looks like a domain path: "example.com/..." or "sub.example.com/..."
    if (/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(str)) return true;

    // Looks like a domain + query without path: "example.com?foo=bar"
    if (/^[a-z0-9.-]+\.[a-z]{2,}\?/i.test(str)) return true;

    return false;
  }

  extractJobIdFromUrl(url) {
    if (!url) return null;

    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const search = urlObj.search;
      const hash = urlObj.hash;

      const queryParamMatch = search.match(
        /[?&](?:job_?id|gh_jid|jid|posting_?id|position_?id|opening_?id|requisition_?id|req_?id)=([^&]+)/i
      );
      if (queryParamMatch && queryParamMatch[1]) {
        return queryParamMatch[1];
      }

      const uuidMatch = pathname.match(
        /\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i
      );
      if (uuidMatch) return uuidMatch[1];

      const workdayMatch = pathname.match(/_([A-Z]{1,3}-?\d{4,})/);
      if (workdayMatch) return workdayMatch[1];

      const ripplehireMatch = hash.match(/\/(?:apply|detail)\/job\/(\d+)/);
      if (ripplehireMatch) return ripplehireMatch[1];

      const pathSegmentMatch = pathname.match(
        /\/(?:jobs|job|positions|position|opening|openings|apply|posting|requisition|view)\/(\d{4,})(?:[/?#]|$)/i
      );
      if (pathSegmentMatch) return pathSegmentMatch[1];

      const tokenMatch = search.match(/[?&]token=(\d{6,})/);
      if (tokenMatch) return tokenMatch[1];

      const linkedinMatch = search.match(/[?&]currentJobId=(\d+)/);
      if (linkedinMatch) return linkedinMatch[1];

      return null;

    } catch (error) {
      console.warn('[ApplicationTracker] Error extracting job ID from URL:', error);
      return null;
    }
  }

  detectJobIdSource(url) {
    if (!url) return 'unknown';

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace('www.', '').toLowerCase();

      if (hostname.includes('linkedin.com')) return 'linkedin';
      if (hostname.includes('greenhouse.io') || hostname.includes('grnh.se')) return 'greenhouse';
      if (hostname.includes('lever.co')) return 'lever';
      if (hostname.includes('workday.com') || hostname.includes('myworkdayjobs.com')) return 'workday';
      if (hostname.includes('ashbyhq.com') || hostname.includes('ashby.com')) return 'ashby';
      if (hostname.includes('ripplehire.com')) return 'ripplehire';
      if (hostname.includes('smartrecruiters.com')) return 'smartrecruiters';
      if (hostname.includes('icims.com')) return 'icims';
      if (hostname.includes('bamboohr.com')) return 'bamboohr';
      if (hostname.includes('taleo.net')) return 'taleo';
      if (hostname.includes('deel.com')) return 'deel';

      if (url.includes('gh_jid=') || url.includes('gh_src=')) return 'greenhouse';

      const parts = hostname.split('.');
      if (parts.length >= 2) {
        const skip = new Set(['www', 'jobs', 'careers', 'apply', 'job', 'boards', 'job-boards']);
        const candidates = parts.filter(p => !skip.has(p));
        if (candidates.length > 0) {
          return candidates[0];
        }
      }

      return 'external';
    } catch (error) {
      return 'external';
    }
  }

  extractApplicationIdFromUrl(url) {
    if (!url) return null;

    try {
      const urlObj = new URL(url);
      const search = urlObj.search;
      const pathname = urlObj.pathname;
      const hash = urlObj.hash;

      const tokenMatch = search.match(/[?&]token=(\d+)/);
      if (tokenMatch) return tokenMatch[1];

      const ripplehireMatch = hash.match(/\/(?:apply|detail)\/job\/(\d+)/);
      if (ripplehireMatch) return ripplehireMatch[1];

      const appIdMatch = search.match(/[?&](?:applicationId|confirmation|reference|application_id)=([^&]+)/i);
      if (appIdMatch) return appIdMatch[1];

      const pathMatch = pathname.match(/\/confirmation\/([^\/?]+)/);
      if (pathMatch) return pathMatch[1];

      const hashConfirmMatch = hash.match(/\/(?:confirmation|success|thank-you)\/([^\/?]+)/i);
      if (hashConfirmMatch) return hashConfirmMatch[1];

      return null;

    } catch (error) {
      console.warn('[ApplicationTracker] Error extracting application ID:', error);
      return null;
    }
  }

  getUrlLabel(url) {
    if (!url) return 'Unknown';

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      const pathname = urlObj.pathname.toLowerCase();

      try {
        const strategy = strategyFactory.getStrategy(url);
        const atsName = strategy.getDisplayName();

        if (strategy && strategy.getAtsName() !== 'generic') {
          if (strategy.isSuccessPage(url)) {
            return `${atsName} Confirmation`;
          }

          if (pathname.includes('apply') ||
              pathname.includes('application') ||
              pathname.includes('embed/job_app') ||
              pathname.includes('job_app')) {
            return `${atsName} Application`;
          }

          return atsName;
        }
      } catch (strategyError) {
        console.debug('[ApplicationTracker] Strategy detection failed, using fallback:', strategyError.message);
      }

      if (hostname.includes('linkedin.com')) {
        if (pathname.includes('/jobs/search-results')) return 'LinkedIn Job Search';
        if (pathname.includes('/jobs/view')) return 'LinkedIn Job Detail';
        if (pathname.includes('/safety/go')) return 'LinkedIn Safety Redirect';
        if (pathname.includes('/jobs')) return 'LinkedIn Jobs';
        return 'LinkedIn';
      }

      if (hostname.includes('naukri.com')) {
        if (pathname.includes('/job-listings')) return 'Naukri Job Listing';
        if (pathname.includes('/job-details')) return 'Naukri Job Detail';
        return 'Naukri';
      }

      if (hostname.includes('greenhouse.io') ||
          hostname.includes('grnh.se') ||
          hostname.includes('boards.greenhouse.io') ||
          hostname.includes('job-boards.greenhouse.io')) {
        if (pathname.includes('confirmation') || pathname.includes('thank-you')) {
          return 'Greenhouse Confirmation';
        }
        if (pathname.includes('job_app') || pathname.includes('apply') || pathname.includes('application')) {
          return 'Greenhouse Application';
        }
        return 'Greenhouse';
      }

      if (hostname.includes('lever.co') || hostname.includes('jobs.lever.co')) {
        if (pathname.includes('thank-you') || pathname.includes('confirmation')) {
          return 'Lever Confirmation';
        }
        if (pathname.includes('apply')) {
          return 'Lever Application';
        }
        return 'Lever';
      }

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

      if (hostname.includes('ashby.com')) {
        if (pathname.includes('thank-you') || pathname.includes('confirmation')) {
          return 'Ashby Confirmation';
        }
        if (pathname.includes('apply')) {
          return 'Ashby Application';
        }
        return 'Ashby';
      }

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

  getActiveSessions() {
    return sessionManager.getActiveSessions();
  }

  getStats() {
    const sessionStats = sessionManager.getStats();
    return {
      ...sessionStats,
      isInitialized: this.isInitialized,
      eventHandlers: this.eventHandlers.size,
      callbacks: this.submissionCallbacks.length
    };
  }

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

const applicationTracker = new ApplicationTracker();
export default applicationTracker;