// src/background/patterns/strategies/GreenhouseStrategy.js

import { SubmissionDetectionStrategy } from '../base/SubmissionDetectionStrategy.js';

/**
 * Greenhouse ATS Submission Detection Strategy
 *
 * Detects when a user successfully submits a job application
 * through Greenhouse ATS (Applicant Tracking System).
 *
 * Greenhouse is one of the most popular ATS platforms used by companies
 * for job applications. They typically use:
 * - URL patterns: /apply/thank-you, /apply/success, /jobs/thank-you
 * - Query params: gh_jid, gh_src (works on custom domains)
 * - Page titles: "Thank you for applying", "Application submitted"
 * - Page content: "We appreciate your interest", "Your application has been received"
 *
 * Priority: 10 (High - checked before generic strategies)
 */
export class GreenhouseStrategy extends SubmissionDetectionStrategy {
  constructor() {
    super();

    // ATS identification
    this.atsName = 'greenhouse';
    this.priority = 10;

    // ✅ Complete Greenhouse specific success patterns with all confirmation URLs
    this.successPatterns = {
      urlPatterns: [
        '/thank-you',
        '/apply/thank-you',
        '/apply/success',
        '/jobs/thank-you',
        '/confirmation',
        '/embed/job_app/confirmation',
        '/embed/job_app/success',
        '?application_submitted=true',
        '?submitted=true',
        '?success=true',
        '?confirmation=true'
      ],
      titlePatterns: [
        'thank you for applying',
        'thank you for your application',
        'application submitted',
        'application received',
        'successfully applied',
        'your application has been submitted',
        'application complete'
      ],
      textPatterns: [
        'thank you for applying to',
        'thank you for your application to',
        'your application has been submitted',
        'we have received your application',
        'we appreciate your interest in',
        'application submitted successfully',
        'you have successfully applied',
        'we will review your application',
        'you will hear from us',
        'your application has been received',
        'your application has been received. if there is a fit, someone will be getting back to you'
      ]
    };

    // ✅ Complete step patterns with confirmation
    this.stepPatterns = {
      form: [
        '/apply/',
        '/application/',
        'apply?',
        'application?',
        'gh_jid='
      ],
      review: [
        '/review',
        '/confirm',
        '/verify-answers',
        '/check-answers'
      ],
      submit: [
        '/submit',
        '/finalize',
        '/complete-application'
      ],
      success: [
        '/thank-you',
        '/apply/thank-you',
        '/apply/success',
        '/confirmation',
        '/embed/job_app/confirmation',
        '/embed/job_app/success'
      ]
    };
  }

  /**
   * Check if this strategy can handle the given URL
   *
   * Detection methods (in order):
   * 1. Domain match (greenhouse.io, grnh.se, boards.greenhouse.io, job-boards.greenhouse.io)
   * 2. Query params (gh_jid=, gh_src=) — works on custom domains
   * 3. Path match (greenhouse, grnh.se)
   *
   * @param {string} url - The URL to check
   * @returns {boolean} True if it's a Greenhouse URL
   */
  canHandle(url) {
      if (!url) return false;

      const clean = this.cleanUrl(url);   // origin + path, no query/hash
      const full = url.toLowerCase();     // needed for gh_jid / gh_src

      // 1. Domain match
      const patterns = [
        /greenhouse\.io/,
        /grnh\.se/,
        /boards\.greenhouse\.io/,
        /job-boards\.greenhouse\.io/
      ];
      for (const pattern of patterns) {
        if (pattern.test(clean)) {
          console.log(`[GreenhouseStrategy] ✅ Can handle URL (domain): ${clean}`);
          return true;
        }
      }

      // 2. Greenhouse-specific query params — intentional, on the raw URL
      //    https://keydatacyber.com/careers?gh_jid=4726983005&gh_src=...
      if (full.includes('gh_jid=') || full.includes('gh_src=')) {
        console.log(`[GreenhouseStrategy] ✅ Can handle URL (query params): ${url}`);
        return true;
      }

      // 3. Path substring — fallback
      if (clean.includes('greenhouse') || clean.includes('grnh.se')) {
        console.log(`[GreenhouseStrategy] ✅ Can handle URL (path match): ${clean}`);
        return true;
      }

      return false;
    }

  /**
   * Check if the given URL is a Greenhouse success page
   * @param {string} url - The URL to check
   * @returns {boolean} True if it's a success page
   */
  isSuccessPage(url) {
    // ✅ NULL CHECK
    if (!url) return false;

    const urlLower = url.toLowerCase();

    // First check for Greenhouse-specific success URL patterns
    for (const pattern of this.successPatterns.urlPatterns) {
      if (urlLower.includes(pattern.toLowerCase())) {
        console.log(`[GreenhouseStrategy] 🎉 Success page detected: ${pattern}`);
        return true;
      }
    }

    // ✅ Check for embed confirmation URL
    if (urlLower.includes('/embed/job_app/confirmation')) {
      console.log('[GreenhouseStrategy] 🎉 Greenhouse embed confirmation detected!');
      return true;
    }

    // Check for typical Greenhouse success URL structure
    if (urlLower.includes('/apply/thank-you') ||
        urlLower.includes('/apply/success') ||
        urlLower.includes('/jobs/thank-you') ||
        urlLower.includes('/confirmation')) {
      console.log(`[GreenhouseStrategy] 🎉 Success page detected (path match)`);
      return true;
    }

    return false;
  }

  /**
   * Detect which step the user is on in the Greenhouse application flow
   * @param {string} url - Current URL
   * @param {string} pageTitle - Current page title
   * @returns {Object} { step: string, label: string, pattern: string, matchedPattern: string }
   */
  detectStep(url, pageTitle) {
    // ✅ NULL CHECK
    if (!url) {
      return {
        step: 'unknown',
        label: 'Unknown Step',
        pattern: 'none',
        matchedPattern: null
      };
    }

    const urlLower = url.toLowerCase();
    const titleLower = pageTitle ? pageTitle.toLowerCase() : '';

    // Step labels for Greenhouse
    const stepMap = {
      'form': 'Application Form',
      'review': 'Review Your Application',
      'submit': 'Submitting Your Application',
      'success': 'Application Submitted Successfully'
    };

    // Check each step pattern
    for (const [step, patterns] of Object.entries(this.stepPatterns)) {
      // Check URL patterns
      for (const pattern of patterns) {
        if (urlLower.includes(pattern.toLowerCase())) {
          console.log(`[GreenhouseStrategy] Step "${step}" detected by URL: ${pattern}`);
          return {
            step: step,
            label: stepMap[step] || step,
            pattern: 'url',
            matchedPattern: pattern
          };
        }
      }

      // Check title patterns
      for (const pattern of patterns) {
        if (titleLower.includes(pattern.toLowerCase())) {
          console.log(`[GreenhouseStrategy] Step "${step}" detected by title: ${pattern}`);
          return {
            step: step,
            label: stepMap[step] || step,
            pattern: 'title',
            matchedPattern: pattern
          };
        }
      }
    }

    // If no step detected, check if it's a success page
    if (this.isSuccessPage(url)) {
      return {
        step: 'success',
        label: 'Application Submitted Successfully',
        pattern: 'success_page',
        matchedPattern: 'success_page'
      };
    }

    // ✅ Check if it's a Greenhouse application page via query params
    if (urlLower.includes('gh_jid=') || urlLower.includes('gh_src=')) {
      // If it has gh_jid but no success path, it's a form
      if (!urlLower.includes('/confirmation') &&
          !urlLower.includes('/thank-you') &&
          !urlLower.includes('/success')) {
        return {
          step: 'form',
          label: 'Application Form',
          pattern: 'query_param',
          matchedPattern: 'gh_jid'
        };
      }
    }

    // Check if it's a Greenhouse application page (form detection)
    if (urlLower.includes('/apply/') && !urlLower.includes('/thank-you')) {
      return {
        step: 'form',
        label: 'Application Form',
        pattern: 'url',
        matchedPattern: '/apply/'
      };
    }

    // Default: unknown step
    return {
      step: 'unknown',
      label: 'Unknown Step',
      pattern: 'none',
      matchedPattern: null
    };
  }

  /**
   * Extract thank you message from Greenhouse success page
   * @param {string} url - Current URL
   * @param {string} pageTitle - Current page title
   * @param {string} pageContent - Page text content (if available)
   * @returns {string|null} Thank you message or null
   */
  extractThankYouMessage(url, pageTitle, pageContent) {
    // First check if it's a success page
    if (!this.isSuccessPage(url)) {
      return null;
    }

    // Common Greenhouse thank you messages
    const greenhouseMessages = [
      'Thank you for applying to',
      'We appreciate your interest in',
      'Your application has been submitted',
      'We have received your application',
      'You have successfully applied',
      'Thank you for your application',
      'We will review your application',
      'You will hear from us',
      'Your application has been received',
      'If there is a fit, someone will be getting back to you'
    ];

    // Check title patterns
    if (pageTitle) {
      for (const pattern of this.successPatterns.titlePatterns) {
        if (pageTitle.toLowerCase().includes(pattern.toLowerCase())) {
          console.log(`[GreenhouseStrategy] Thank you from title: ${pattern}`);
          return pattern;
        }
      }

      // Check for specific Greenhouse title format
      for (const msg of greenhouseMessages) {
        if (pageTitle.toLowerCase().includes(msg.toLowerCase())) {
          return msg;
        }
      }
    }

    // Check text patterns
    if (pageContent) {
      for (const pattern of this.successPatterns.textPatterns) {
        if (pageContent.toLowerCase().includes(pattern.toLowerCase())) {
          console.log(`[GreenhouseStrategy] Thank you from content: ${pattern}`);
          return pattern;
        }
      }

      // Look for specific Greenhouse messages in content
      for (const msg of greenhouseMessages) {
        if (pageContent.toLowerCase().includes(msg.toLowerCase())) {
          return msg;
        }
      }

      // Try to extract company name if mentioned
      const companyMatch = pageContent.match(/Thank you for applying to ([^.]+)/i);
      if (companyMatch) {
        return `Thank you for applying to ${companyMatch[1].trim()}`;
      }
    }

    // Fallback message
    return 'Your application has been submitted successfully';
  }

  /**
   * Get the Greenhouse strategy priority
   * @returns {number} Priority
   */
  getPriority() {
    return this.priority;
  }

  /**
   * Get the ATS name
   * @returns {string} 'greenhouse'
   */
  getAtsName() {
    return 'greenhouse';
  }

  /**
   * Get display name for Greenhouse
   * @returns {string} 'Greenhouse'
   */
  getDisplayName() {
    return 'Greenhouse';
  }

  /**
   * Extract ATS name from Greenhouse URL
   * @param {string} url - The URL
   * @returns {string} 'greenhouse'
   */
  extractAtsFromUrl(url) {
    return 'greenhouse';
  }

  /**
   * Check if page contains Greenhouse success indicators
   * @param {string} pageContent - Page text content
   * @param {string} pageTitle - Page title
   * @returns {boolean} True if success indicators are found
   */
  containsSuccessIndicators(pageContent, pageTitle) {
    // ✅ NULL CHECK
    if (!pageContent && !pageTitle) return false;

    // Check title
    if (pageTitle) {
      for (const pattern of this.successPatterns.titlePatterns) {
        if (pageTitle.toLowerCase().includes(pattern.toLowerCase())) {
          return true;
        }
      }
    }

    // Check content
    if (pageContent) {
      for (const pattern of this.successPatterns.textPatterns) {
        if (pageContent.toLowerCase().includes(pattern.toLowerCase())) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get the job ID from Greenhouse URL if present
   * @param {string} url - The URL
   * @returns {string|null} Job ID or null
   */
  extractJobIdFromUrl(url) {
    // ✅ NULL CHECK
    if (!url) return null;

    try {
      // Greenhouse URL patterns: /jobs/1234567890
      const patterns = [
        /\/jobs\/(\d+)/,
        /\/apply\/(\d+)/,
        /job_id=(\d+)/,
        /token=(\d+)/,
        /gh_jid=(\d+)/
      ];

      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
          return match[1];
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }
}

export default GreenhouseStrategy;