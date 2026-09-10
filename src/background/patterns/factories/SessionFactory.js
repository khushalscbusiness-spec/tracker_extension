// src/background/patterns/factories/SessionFactory.js

/**
 * Session Factory
 *
 * Creates and manages session objects for tracking job applications.
 *
 * This implements the Factory Pattern:
 * - Centralizes creation of session objects
 * - Ensures consistent session structure
 * - Generates unique session IDs
 * - Sets default values for all session properties
 *
 * A session represents the entire lifecycle of a job application:
 * - From the moment the user clicks "Apply" on LinkedIn
 * - Through the external application process (Greenhouse, Lever, Workday, etc.)
 * - Until the application is submitted, abandoned, or times out
 */
export class SessionFactory {

  /**
   * Create a new session for a job application
   * @param {Object} jobData - Job data from LinkedIn
   * @param {Object} applyData - Apply button data
   * @param {Object} options - Optional configuration
   * @returns {Object} Session object
   */
  static createSession(jobData, applyData, options = {}) {
    const now = Date.now();

    // Generate a unique session ID
    const sessionId = this.generateSessionId();

    // Build the session object
    const session = {
      // Session identification
      sessionId: sessionId,

      // Job information (from LinkedIn)
      jobId: jobData.externalJobId || jobData.id || null,
      jobTitle: jobData.title || 'Unknown Job',
      company: jobData.company || 'Unknown Company',
      location: jobData.location || null,
      jobUrl: jobData.url || null,

      // ✅ Job ID Tracking - NEW
      externalJobId: null,      // Job ID from external URLs (Coinbase, Greenhouse, etc.)
      jobIds: {},              // Map of job IDs by source { linkedin: '123', coinbase: '456', greenhouse: '789' }
      applicationReference: null, // Application reference/confirmation number

      // Application information
      applyUrl: applyData.applyUrl || null,
      redirectUrl: applyData.redirectUrl || null,
      applyType: applyData.applyType || 'external',
      applyMethod: applyData.applyMethod || 'external_redirect',

      // Tab tracking
      sourceTabId: applyData.sourceTabId || null,
      redirectTabId: applyData.redirectTabId || null,
      trackedTabs: [], // Array of tab IDs tracked in this session

      // URL Tracking
      visitedUrls: [], // Array of { url, timestamp, tabId, title, order, label, jobId }
      successUrl: null, // The final confirmation URL

      // ATS detection
      ats: applyData.ats || 'unknown',
      atsName: applyData.atsName || 'Unknown ATS',
      atsStrategy: null, // Strategy instance for this ATS

      // Session state
      status: 'initiated', // initiated, redirecting, in_progress, submitted, abandoned
      currentState: null, // Reference to state object
      stateHistory: [], // Array of state transitions

      // Steps tracking
      steps: [], // Array of step objects
      stepCount: 0, // Total steps completed

      // Timestamps
      startedAt: now,
      redirectedAt: null,
      lastActivityAt: now,
      submittedAt: null,
      abandonedAt: null,
      completedAt: null,
      lastStateChange: now,
      updatedAt: now,

      // Success indicators
      thankYouPhrase: null,
      confirmationMessage: null,

      // Additional metadata
      source: applyData.source || 'linkedin',
      platform: 'linkedin',
      userAgent: options.userAgent || null,
      userId: null,
      abandonReason: null,

      // Timers
      timers: {
        inactivityTimeout: null,
        sessionTimeout: null
      },

      // Version and schema
      version: '1.0.0',
      schema: 'session_v1'
    };

    // Apply any custom options
    if (options) {
      Object.assign(session, options);
    }

    console.log(`[SessionFactory] ✅ Created session: ${sessionId}`);
    console.log(`[SessionFactory]   Job: ${session.jobTitle} at ${session.company}`);
    console.log(`[SessionFactory]   LinkedIn Job ID: ${session.jobId}`);
    console.log(`[SessionFactory]   Redirect: ${session.redirectUrl}`);

    return session;
  }

  /**
   * Generate a unique session ID
   * Format: session_[timestamp]_[random]
   * @returns {string} Unique session ID
   */
  static generateSessionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `session_${timestamp}_${random}`;
  }

  /**
   * Create a minimal session for tracking without full job data
   * @param {string} jobId - Job ID from LinkedIn
   * @param {string} redirectUrl - Redirect URL
   * @param {number} sourceTabId - Source tab ID
   * @returns {Object} Minimal session object
   */
  static createMinimalSession(jobId, redirectUrl, sourceTabId) {
    return this.createSession(
      { externalJobId: jobId, title: 'Unknown Job', company: 'Unknown Company' },
      { redirectUrl, sourceTabId, applyUrl: redirectUrl }
    );
  }

  /**
   * Clone an existing session
   * @param {Object} session - The session to clone
   * @returns {Object} Cloned session with new ID
   */
  static cloneSession(session) {
    const cloned = JSON.parse(JSON.stringify(session));
    cloned.sessionId = this.generateSessionId();
    cloned.startedAt = Date.now();
    cloned.status = 'initiated';
    cloned.stateHistory = [];
    cloned.steps = [];
    cloned.visitedUrls = [];
    cloned.successUrl = null;
    cloned.trackedTabs = [];
    cloned.updatedAt = Date.now();

    // ✅ Reset job ID tracking for cloned session
    cloned.externalJobId = null;
    cloned.jobIds = {};
    cloned.applicationReference = null;

    return cloned;
  }

  /**
   * Create a session from storage data
   * @param {Object} data - Stored session data
   * @returns {Object} Restored session object
   */
  static restoreFromStorage(data) {
    // Ensure all required fields exist
    const session = {
      sessionId: data.sessionId || this.generateSessionId(),
      jobId: data.jobId || null,
      jobTitle: data.jobTitle || 'Unknown Job',
      company: data.company || 'Unknown Company',
      location: data.location || null,
      jobUrl: data.jobUrl || null,

      // ✅ Restore job ID tracking fields
      externalJobId: data.externalJobId || null,
      jobIds: data.jobIds || {},
      applicationReference: data.applicationReference || null,

      applyUrl: data.applyUrl || null,
      redirectUrl: data.redirectUrl || null,
      applyType: data.applyType || 'external',
      applyMethod: data.applyMethod || 'external_redirect',
      sourceTabId: data.sourceTabId || null,
      redirectTabId: data.redirectTabId || null,
      trackedTabs: data.trackedTabs || [],
      visitedUrls: data.visitedUrls || [],
      successUrl: data.successUrl || null,
      ats: data.ats || 'unknown',
      atsName: data.atsName || 'Unknown ATS',
      atsStrategy: null, // Will be re-initialized
      status: data.status || 'initiated',
      currentState: null,
      stateHistory: data.stateHistory || [],
      steps: data.steps || [],
      stepCount: data.stepCount || 0,
      startedAt: data.startedAt || Date.now(),
      redirectedAt: data.redirectedAt || null,
      lastActivityAt: data.lastActivityAt || Date.now(),
      submittedAt: data.submittedAt || null,
      abandonedAt: data.abandonedAt || null,
      completedAt: data.completedAt || null,
      lastStateChange: data.lastStateChange || Date.now(),
      updatedAt: data.updatedAt || Date.now(),
      thankYouPhrase: data.thankYouPhrase || null,
      confirmationMessage: data.confirmationMessage || null,
      source: data.source || 'linkedin',
      platform: 'linkedin',
      userId: data.userId || null,
      abandonReason: data.abandonReason || null,
      timers: {
        inactivityTimeout: null,
        sessionTimeout: null
      },
      version: data.version || '1.0.0',
      schema: data.schema || 'session_v1'
    };

    console.log(`[SessionFactory] ✅ Restored session: ${session.sessionId}`);
    console.log(`[SessionFactory]   URLs tracked: ${session.visitedUrls.length}`);
    console.log(`[SessionFactory]   Job IDs:`, session.jobIds);

    return session;
  }

  /**
   * Validate a session object
   * @param {Object} session - The session to validate
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  static validateSession(session) {
    const errors = [];

    // Required fields
    if (!session.sessionId) {
      errors.push('Missing sessionId');
    }
    if (!session.jobTitle || session.jobTitle === 'Unknown Job') {
      errors.push('Missing jobTitle');
    }
    if (!session.company || session.company === 'Unknown Company') {
      errors.push('Missing company');
    }
    if (!session.redirectUrl) {
      errors.push('Missing redirectUrl');
    }

    // Validate status
    const validStatuses = ['initiated', 'redirecting', 'in_progress', 'submitted', 'abandoned'];
    if (!validStatuses.includes(session.status)) {
      errors.push(`Invalid status: ${session.status}`);
    }

    // Validate timestamps
    if (session.startedAt && isNaN(session.startedAt)) {
      errors.push('Invalid startedAt timestamp');
    }
    if (session.submittedAt && isNaN(session.submittedAt)) {
      errors.push('Invalid submittedAt timestamp');
    }

    // Validate visitedUrls structure
    if (session.visitedUrls && Array.isArray(session.visitedUrls)) {
      for (const entry of session.visitedUrls) {
        if (!entry.url) {
          errors.push('Invalid visitedUrls entry: missing url');
        }
        if (entry.order && typeof entry.order !== 'number') {
          errors.push('Invalid visitedUrls entry: order must be a number');
        }
        if (entry.timestamp && typeof entry.timestamp !== 'number') {
          errors.push('Invalid visitedUrls entry: timestamp must be a number');
        }
      }
    }

    // ✅ Validate jobIds structure
    if (session.jobIds && typeof session.jobIds !== 'object') {
      errors.push('Invalid jobIds: must be an object');
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Get a summary of a session (useful for logging)
   * @param {Object} session - The session
   * @returns {Object} Summary object
   */
  static getSessionSummary(session) {
    return {
      sessionId: session.sessionId,
      job: `${session.jobTitle} at ${session.company}`,
      status: session.status,
      ats: session.ats,
      startTime: session.startedAt ? new Date(session.startedAt).toISOString() : null,
      stepsCompleted: session.stepCount,
      submitted: !!session.submittedAt,
      urlsTracked: session.visitedUrls ? session.visitedUrls.length : 0,
      lastUrl: session.visitedUrls && session.visitedUrls.length > 0
        ? session.visitedUrls[session.visitedUrls.length - 1].url
        : null,
      // ✅ Include job ID info in summary
      jobIds: session.jobIds || {},
      externalJobId: session.externalJobId || null,
      applicationReference: session.applicationReference || null
    };
  }

  /**
   * Check if a session is still active
   * @param {Object} session - The session
   * @param {number} timeoutMs - Timeout in milliseconds (default: 30 minutes)
   * @returns {boolean} True if session is active
   */
  static isActive(session, timeoutMs = 1800000) {
    if (!session) return false;

    // If session is submitted or abandoned, it's not active
    if (session.status === 'submitted' || session.status === 'abandoned') {
      return false;
    }

    // Check if session has timed out
    const lastActivity = session.lastActivityAt || session.startedAt;
    const timeSinceActivity = Date.now() - lastActivity;

    return timeSinceActivity < timeoutMs;
  }

  /**
   * Get the age of a session in milliseconds
   * @param {Object} session - The session
   * @returns {number} Age in milliseconds
   */
  static getSessionAge(session) {
    if (!session) return 0;
    const startTime = session.startedAt || Date.now();
    return Date.now() - startTime;
  }

  /**
   * Format session data for API payload
   * @param {Object} session - The session
   * @param {Object} extraData - Additional data to include
   * @returns {Object} Formatted payload
   */
  static formatForPayload(session, extraData = {}) {
    return {
      sessionId: session.sessionId,
      jobId: session.jobId,
      jobTitle: session.jobTitle,
      company: session.company,
      location: session.location,
      jobUrl: session.jobUrl,
      status: session.status,
      applyType: session.applyType,
      ats: session.ats,
      atsName: session.atsName,
      redirectUrl: session.redirectUrl,
      successUrl: session.successUrl,
      startedAt: session.startedAt,
      submittedAt: session.submittedAt,
      stepCount: session.stepCount,
      thankYouPhrase: session.thankYouPhrase,
      source: session.source,
      platform: session.platform,
      // ✅ Include job ID tracking fields
      externalJobId: session.externalJobId || null,
      jobIds: session.jobIds || {},
      applicationReference: session.applicationReference || null,
      // Include URL chain
      visitedUrls: session.visitedUrls || [],
      urlCount: session.visitedUrls ? session.visitedUrls.length : 0,
      ...extraData
    };
  }

  /**
   * Add a URL to the session's visited URLs
   * @param {Object} session - The session
   * @param {Object} urlEntry - URL entry { url, tabId, title, label, jobId }
   * @returns {Object} Updated session
   */
  static addVisitedUrl(session, urlEntry) {
    if (!session) return null;
    if (!session.visitedUrls) {
      session.visitedUrls = [];
    }

    // Check for duplicates
    const exists = session.visitedUrls.some(entry => entry.url === urlEntry.url);
    if (exists) {
      console.log(`[SessionFactory] URL already tracked: ${urlEntry.url}`);
      return session;
    }

    const order = session.visitedUrls.length + 1;

    // ✅ Add jobId to the URL entry
    session.visitedUrls.push({
      url: urlEntry.url,
      timestamp: urlEntry.timestamp || Date.now(),
      tabId: urlEntry.tabId || null,
      title: urlEntry.title || null,
      order: order,
      label: urlEntry.label || null,
      jobId: urlEntry.jobId || null  // ✅ NEW - Job ID for this specific URL
    });

    session.updatedAt = Date.now();
    session.lastActivityAt = Date.now();

    console.log(`[SessionFactory] 📌 Added URL #${order}: ${urlEntry.url}`);
    if (urlEntry.jobId) {
      console.log(`[SessionFactory]   🔑 Job ID: ${urlEntry.jobId}`);
    }

    return session;
  }

  /**
   * Get the URL chain as a formatted string
   * @param {Object} session - The session
   * @param {string} separator - Separator between URLs
   * @returns {string} Formatted URL chain
   */
  static getUrlChain(session, separator = ' → ') {
    if (!session || !session.visitedUrls || session.visitedUrls.length === 0) {
      return '';
    }

    return session.visitedUrls
      .map(entry => `#${entry.order}: ${entry.url}`)
      .join(separator);
  }

  /**
   * Get the URL chain with job IDs
   * @param {Object} session - The session
   * @param {string} separator - Separator between URLs
   * @returns {string} Formatted URL chain with job IDs
   */
  static getUrlChainWithJobIds(session, separator = ' → ') {
    if (!session || !session.visitedUrls || session.visitedUrls.length === 0) {
      return '';
    }

    return session.visitedUrls
      .map(entry => {
        const jobIdInfo = entry.jobId ? ` [Job: ${entry.jobId}]` : '';
        return `#${entry.order}${jobIdInfo}: ${entry.url}`;
      })
      .join(separator);
  }

  /**
   * Get the last visited URL
   * @param {Object} session - The session
   * @returns {string|null} Last URL or null
   */
  static getLastUrl(session) {
    if (!session || !session.visitedUrls || session.visitedUrls.length === 0) {
      return null;
    }
    return session.visitedUrls[session.visitedUrls.length - 1].url;
  }

  /**
   * Get the first visited URL
   * @param {Object} session - The session
   * @returns {string|null} First URL or null
   */
  static getFirstUrl(session) {
    if (!session || !session.visitedUrls || session.visitedUrls.length === 0) {
      return null;
    }
    return session.visitedUrls[0].url;
  }

  /**
   * Get URLs by order range
   * @param {Object} session - The session
   * @param {number} start - Start order (1-based)
   * @param {number} end - End order (1-based)
   * @returns {Array} Array of URL entries
   */
  static getUrlsInRange(session, start, end) {
    if (!session || !session.visitedUrls) return [];
    return session.visitedUrls.filter(
      entry => entry.order >= start && entry.order <= end
    );
  }

  /**
   * Get URLs by label
   * @param {Object} session - The session
   * @param {string} label - Label to filter by
   * @returns {Array} Array of URL entries with matching label
   */
  static getUrlsByLabel(session, label) {
    if (!session || !session.visitedUrls || !label) return [];
    return session.visitedUrls.filter(
      entry => entry.label && entry.label.toLowerCase().includes(label.toLowerCase())
    );
  }

  /**
   * Get the count of URLs tracked
   * @param {Object} session - The session
   * @returns {number} Number of URLs tracked
   */
  static getUrlCount(session) {
    if (!session || !session.visitedUrls) return 0;
    return session.visitedUrls.length;
  }

  /**
   * Check if a URL is already tracked
   * @param {Object} session - The session
   * @param {string} url - URL to check
   * @returns {boolean} True if URL is tracked
   */
  static hasUrl(session, url) {
    if (!session || !session.visitedUrls || !url) return false;
    return session.visitedUrls.some(entry => entry.url === url);
  }

  /**
   * Add a job ID to the session's jobIds map
   * @param {Object} session - The session
   * @param {string} source - Source name (linkedin, coinbase, greenhouse, etc.)
   * @param {string} jobId - Job ID from that source
   * @returns {Object} Updated session
   */
  static addJobId(session, source, jobId) {
    if (!session || !source || !jobId) return session;

    if (!session.jobIds) {
      session.jobIds = {};
    }

    session.jobIds[source] = jobId;
    session.updatedAt = Date.now();

    console.log(`[SessionFactory] 🔑 Added Job ID: ${source} = ${jobId}`);
    return session;
  }

  /**
   * Get a job ID from a specific source
   * @param {Object} session - The session
   * @param {string} source - Source name
   * @returns {string|null} Job ID or null
   */
  static getJobId(session, source) {
    if (!session || !session.jobIds) return null;
    return session.jobIds[source] || null;
  }

  /**
   * Set the application reference number
   * @param {Object} session - The session
   * @param {string} reference - Application reference/confirmation number
   * @returns {Object} Updated session
   */
  static setApplicationReference(session, reference) {
    if (!session) return null;
    session.applicationReference = reference;
    session.updatedAt = Date.now();
    console.log(`[SessionFactory] 📋 Application Reference: ${reference}`);
    return session;
  }
}

// Export the factory
export default SessionFactory;