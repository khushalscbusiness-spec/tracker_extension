// src/background/patterns/base/SubmissionDetectionStrategy.js

/**
 * Submission Detection Strategy
 *
 * Abstract base class for detecting when a user successfully submits
 * a job application on an external ATS (Applicant Tracking System).
 *
 * This implements the Strategy Pattern:
 * - Defines a common interface for all submission detection strategies
 * - Each ATS (Greenhouse, Lever, Workday, etc.) has its own concrete strategy
 * - The StrategyFactory selects the appropriate strategy based on URL
 *
 * @abstract
 */
export class SubmissionDetectionStrategy {
  constructor() {
    // Name of the ATS (greenhouse, lever, workday, etc.)
    this.atsName = 'generic';

    // Priority for strategy selection (higher = checked first)
    this.priority = 0;

    // Success patterns for this ATS
    this.successPatterns = {
      urlPatterns: [],      // URL patterns that indicate success
      titlePatterns: [],    // Page title patterns that indicate success
      textPatterns: []      // Page text patterns that indicate success
    };

    // Step patterns for this ATS
    this.stepPatterns = {
      form: [],     // Patterns for "on application form"
      review: [],   // Patterns for "reviewing application"
      submit: [],   // Patterns for "submitting"
      success: []   // Patterns for "submission success"
    };
  }

  /**
   * Check if this strategy can handle the given URL
   * Must be implemented by child classes
   * @param {string} url - The URL to check
   * @returns {boolean} True if this strategy can handle the URL
   */
  canHandle(url) {
    throw new Error('canHandle() must be implemented by subclass');
  }

  /**
   * Check if the given URL is a success page
   * @param {string} url - The URL to check
   * @returns {boolean} True if it's a success page
   */
  isSuccessPage(url) {
    const urlLower = url.toLowerCase();
    return this.successPatterns.urlPatterns.some(pattern =>
      urlLower.includes(pattern.toLowerCase())
    );
  }

  /**
   * Detect which step the user is on in the application flow
   * @param {string} url - Current URL
   * @param {string} pageTitle - Current page title
   * @returns {Object} { step: string, label: string }
   */
  detectStep(url, pageTitle) {
    const urlLower = url.toLowerCase();
    const titleLower = pageTitle ? pageTitle.toLowerCase() : '';

    for (const [step, patterns] of Object.entries(this.stepPatterns)) {
      for (const pattern of patterns) {
        if (urlLower.includes(pattern.toLowerCase()) ||
            titleLower.includes(pattern.toLowerCase())) {
          return {
            step: step,
            label: this.getStepLabel(step)
          };
        }
      }
    }

    return { step: 'unknown', label: 'Unknown Step' };
  }

  /**
   * Extract thank you message from page
   * @param {string} url - Current URL
   * @param {string} pageTitle - Current page title
   * @param {string} pageContent - Page text content (if available)
   * @returns {string|null} Thank you message or null
   */
  extractThankYouMessage(url, pageTitle, pageContent) {
    if (pageTitle) {
      for (const pattern of this.successPatterns.titlePatterns) {
        if (pageTitle.toLowerCase().includes(pattern.toLowerCase())) {
          return pattern;
        }
      }
    }

    if (pageContent) {
      for (const pattern of this.successPatterns.textPatterns) {
        if (pageContent.toLowerCase().includes(pattern.toLowerCase())) {
          return pattern;
        }
      }
    }

    return null;
  }

  /**
   * Get success patterns for this ATS
   * @returns {Object} { urlPatterns, titlePatterns, textPatterns }
   */
  getSuccessPatterns() {
    return this.successPatterns;
  }

  /**
   * Get step patterns for this ATS
   * @returns {Object} { form, review, submit, success }
   */
  getStepPatterns() {
    return this.stepPatterns;
  }

  /**
   * Get display name for ATS
   * @returns {string} Display name
   */
  getDisplayName() {
    return this.atsName.charAt(0).toUpperCase() + this.atsName.slice(1);
  }

  /**
   * Get human-readable label for a step
   * @param {string} step - Step identifier
   * @returns {string} Human-readable label
   */
  getStepLabel(step) {
    const labels = {
      'form': 'Application Form',
      'review': 'Review Application',
      'submit': 'Submitting',
      'success': 'Application Submitted',
      'unknown': 'Unknown Step'
    };
    return labels[step] || step;
  }

  /**
   * Get the ATS name
   * @returns {string} ATS name
   */
  getAtsName() {
    return this.atsName;
  }

  /**
   * Check if this strategy should handle the URL based on domain pattern
   * @param {string} url - The URL to check
   * @param {RegExp} pattern - Domain pattern to match
   * @returns {boolean} True if URL matches the pattern
   */
  matchesDomain(url, pattern) {
    try {
      const urlObj = new URL(url);
      return pattern.test(urlObj.hostname) || pattern.test(url);
    } catch (e) {
      return false;
    }
  }

  /**
     * Normalize a URL for strategy matching.
     *
     * Strips the query string and hash so that a strategy's substring
     * checks can't accidentally match on tracking parameters.
     *
     * Example of the bug this prevents:
     *   https://www.linkedin.com/jobs/view/4423880462/?applicantTrackingSystemName=Lever
     *   → cleanUrl() returns https://www.linkedin.com/jobs/view/4423880462/
     *   → LeverStrategy no longer matches, because "lever" is gone.
     *
     * Strategies that intentionally read query params (Greenhouse's
     * gh_jid / gh_src) must use the original `url` argument, not this.
     *
     * @param {string} url
     * @returns {string} origin + pathname, lowercased. Falls back to the
     *                   raw lowercased input if the URL can't be parsed.
   */
  cleanUrl(url) {
    if (!url || typeof url !== 'string') return '';
    try {
      const u = new URL(url);
      return (u.origin + u.pathname).toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }

  /**
   * Extract ATS name from URL
   * @param {string} url - The URL
   * @returns {string} Extracted ATS name or null
   */
  extractAtsFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace('www.', '');
      const parts = hostname.split('.');

      if (hostname.includes('greenhouse')) return 'greenhouse';
      if (hostname.includes('lever')) return 'lever';
      if (hostname.includes('workday')) return 'workday';
      if (hostname.includes('ashby')) return 'ashby';
      if (hostname.includes('recruiter')) return 'recruiter';

      return parts.length > 1 ? parts[parts.length - 2] : parts[0];
    } catch (e) {
      return null;
    }
  }
}

export default SubmissionDetectionStrategy;