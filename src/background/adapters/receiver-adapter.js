// src/background/adapters/receiver-adapter.js
//
// Adapter between the extension's session model and Layer 2's
// receiver contract.
//
// The adapter is a PURE transformation: session → wire payload.
// It does NOT do I/O. It does NOT know about URLs or HTTP.
//
// The receiver expects:
//   {
//     event_type: "application_submitted",
//     source: "chrome_extension",
//     session_id: "...",
//     application_attempt_id: "...",   // optional
//     job_key: "...",                  // optional
//     payload: { ... }
//   }
//
// This adapter is the ONLY place in the extension that knows
// the wire shape. If the receiver's contract changes, only
// this file changes.

export class ReceiverAdapter {
  // ───────────────────────────────────────────────────────────
  // application_submitted
  // ───────────────────────────────────────────────────────────

  /**
   * Build the receiver payload for an "application_submitted" event.
   *
   * @param {Object} session - The application session
   * @returns {Object} Wire-ready payload
   */
  applicationSubmitted(session) {
    return {
      event_type: 'application_submitted',
      source: 'chrome_extension',
      session_id: session.sessionId,
      application_attempt_id: session.applicationAttemptId || null,
      job_key: session.jobKey || null,
      payload: this._applicationSubmittedInner(session),
    };
  }

  /**
   * The inner payload — what the promoter transforms into a
   * Layer 3 application.
   * @private
   */
  _applicationSubmittedInner(session) {
    return {
      // ── Job information ──────────────────────────────────────
      jobId: session.jobId,
      jobTitle: session.jobTitle,
      company: session.company,
      location: session.location || null,
      jobUrl: session.jobUrl,

      // ── Job ID tracking ──────────────────────────────────────
      linkedInJobId: session.jobId,
      externalJobId: session.externalJobId || null,
      jobIds: session.jobIds || {},
      applicationReference: session.applicationReference || null,
      confirmationNumber: session.applicationReference || null,

      // ── Application information ──────────────────────────────
      status: 'applied',
      appliedAt: session.submittedAt,
      source: session.ats || 'external',
      applyType: session.applyType || 'external',
      applyMethod: session.applyMethod || 'external_redirect',
      stepsCompleted: session.stepCount || 0,
      thankYouPhrase: session.thankYouPhrase || null,
      confirmationMessage: session.confirmationMessage || null,

      // ── URL chain ────────────────────────────────────────────
      urlChain: this._buildUrlChain(session),

      // ── Timing ───────────────────────────────────────────────
      startedAt: session.startedAt,
      redirectedAt: session.redirectedAt,
      submittedAt: session.submittedAt,
      totalTimeMs: session.submittedAt - session.startedAt,
      totalTimeSeconds: Math.round(
        (session.submittedAt - session.startedAt) / 1000
      ),

      // ── ATS ──────────────────────────────────────────────────
      ats: session.ats,
      atsName: session.atsName || 'External',

      // ── System ───────────────────────────────────────────────
      sessionId: session.sessionId,
      platform: 'linkedin',
      detectedAt: new Date().toISOString(),
      version: '0.1.0',

      // ── Steps ────────────────────────────────────────────────
      steps: (session.steps || []).map(step => ({
        step: step.step,
        label: step.label,
        timestamp: step.timestamp,
        matchedPattern: step.matchedPattern,
      })),

      // ── User ─────────────────────────────────────────────────
      userId: session.userId || null,
    };
  }

  /**
   * Build the URL chain with all metadata.
   * @private
   */
  _buildUrlChain(session) {
    if (!session.visitedUrls || session.visitedUrls.length === 0) {
      return [];
    }

    return session.visitedUrls.map(entry => ({
      order: entry.order,
      url: entry.url,
      label: entry.label || 'Unknown',
      timestamp: entry.timestamp,
      tabId: entry.tabId || null,
      title: entry.title || null,
      jobId: entry.jobId || null,
    }));
  }

  // ───────────────────────────────────────────────────────────
  // Future event types
  // ───────────────────────────────────────────────────────────
  //
  // When the extension adds new events, add one method per type:
  //
  // applyClicked(session, clickData) {
  //   return {
  //     event_type: 'apply_clicked',
  //     source: 'chrome_extension',
  //     session_id: session.sessionId,
  //     application_attempt_id: session.applicationAttemptId || null,
  //     job_key: session.jobKey || null,
  //     payload: { ...clickData },
  //   };
  // }
  //
  // jobViewed(session, viewData) { ... }
  // applicationAbandoned(session, reason) { ... }
}

// Singleton instance
export const receiverAdapter = new ReceiverAdapter();