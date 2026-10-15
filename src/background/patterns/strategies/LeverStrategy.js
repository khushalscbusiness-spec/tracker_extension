// src/background/patterns/strategies/LeverStrategy.js

import { SubmissionDetectionStrategy } from '../base/SubmissionDetectionStrategy.js';

/**
 * Lever ATS Submission Detection Strategy
 *
 * Detects when a user successfully submits a job application
 * through Lever ATS (Applicant Tracking System).
 *
 * Lever is a popular ATS platform used by many companies.
 * They typically use:
 * - URL patterns: /thank-you, /apply/success, /confirmation
 * - Page titles: "Thanks for applying", "Application submitted"
 * - Page content: "Your application has been submitted", "We'll be in touch"
 *
 * Lever applications are often embedded within the company's career page
 * at a subdomain like: jobs.lever.co/company-name/job-id
 *
 * Priority: 9 (High - checked after Greenhouse)
 */
export class LeverStrategy extends SubmissionDetectionStrategy {
  constructor() {
    super();

    // ATS identification
    this.atsName = 'lever';
    this.priority = 9;

    // Lever specific success patterns
    this.successPatterns = {
      urlPatterns: [
        '/thank-you',
        '/apply/success',
        '/confirmation',
        '/success',
        '?submitted=true',
        '?confirmation=true',
        '/confirm'
      ],
      titlePatterns: [
        'thank you',
        'thanks for applying',
        'application submitted',
        'application received',
        'we received your application',
        'successfully applied'
      ],
      textPatterns: [
        'thank you for your application',
        'thanks for applying',
        'your application has been submitted',
        'we have received your application',
        'we\'ll be in touch',
        'we will review your application',
        'application submitted successfully',
        'you have successfully applied'
      ]
    };

    // Lever specific step patterns
    this.stepPatterns = {
      form: [
        '/apply',
        '/application',
        'apply?',
        'application?'
      ],
      review: [
        '/review',
        '/confirm',
        '/verify'
      ],
      submit: [
        '/submit',
        '/finalize',
        '/complete'
      ],
      success: [
        '/thank-you',
        '/success',
        '/confirmation'
      ]
    };
  }

  /**
   * Check if this strategy can handle the given URL
   * Matches Lever domains: lever.co, jobs.lever.co
   * @param {string} url - The URL to check
   * @returns {boolean} True if it's a Lever URL
   */
    canHandle(url) {
    if (!url) return false;

    const clean = this.cleanUrl(url);   // origin + path, no query/hash

    const patterns = [
      /lever\.co/,
      /jobs\.lever\.co/
    ];
    for (const pattern of patterns) {
      if (pattern.test(clean)) {
        console.log(`[LeverStrategy] ✅ Can handle URL: ${clean}`);
        return true;
      }
    }

    // Path-based substring match — must NOT see the query string,
    // otherwise LinkedIn URLs with applicantTrackingSystemName=Lever
    // would falsely match.
    if (clean.includes('lever')) {
      console.log(`[LeverStrategy] ✅ Can handle URL (path match): ${clean}`);
      return true;
    }

    return false;
  }

  /**
   * Check if the given URL is a Lever success page
   * @param {string} url - The URL to check
   * @returns {boolean} True if it's a success page
   */
  isSuccessPage(url) {
    // ✅ NULL CHECK
    if (!url) return false;

    const urlLower = url.toLowerCase();

    // First check for Lever-specific success URL patterns
    for (const pattern of this.successPatterns.urlPatterns) {
      if (urlLower.includes(pattern.toLowerCase())) {
        console.log(`[LeverStrategy] 🎉 Success page detected: ${pattern}`);
        return true;
      }
    }

    // Lever often uses: jobs.lever.co/company/job-id/thank-you
    if (urlLower.includes('/apply/success') ||
        urlLower.includes('/confirmation') ||
        urlLower.includes('/thank-you')) {
      console.log(`[LeverStrategy] 🎉 Success page detected (path match)`);
      return true;
    }

    return false;
  }

  /**
   * Detect which step the user is on in the Lever application flow
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

    // Step labels for Lever
    const stepMap = {
      'form': 'Lever Application Form',
      'review': 'Review Your Lever Application',
      'submit': 'Submitting Your Lever Application',
      'success': 'Lever Application Submitted Successfully'
    };

    // Check each step pattern
    for (const [step, patterns] of Object.entries(this.stepPatterns)) {
      // Check URL patterns
      for (const pattern of patterns) {
        if (urlLower.includes(pattern.toLowerCase())) {
          console.log(`[LeverStrategy] Step "${step}" detected by URL: ${pattern}`);
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
          console.log(`[LeverStrategy] Step "${step}" detected by title: ${pattern}`);
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
        label: 'Lever Application Submitted Successfully',
        pattern: 'success_page',
        matchedPattern: 'success_page'
      };
    }

    // Check if it's a Lever application page (form detection)
    if (urlLower.includes('/apply/') || urlLower.includes('lever.co')) {
      // Check if it's the actual form or just a job listing
      if (urlLower.includes('/apply/') && !urlLower.includes('/thank-you')) {
        return {
          step: 'form',
          label: 'Lever Application Form',
          pattern: 'url',
          matchedPattern: '/apply/'
        };
      }
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
   * Extract thank you message from Lever success page
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

    // Common Lever thank you messages
    const leverMessages = [
      'Thanks for applying',
      'Thank you for your application',
      'Your application has been submitted',
      'We have received your application',
      'We\'ll be in touch',
      'We will review your application',
      'Thank you for your interest',
      'You have successfully applied'
    ];

    // Check title patterns
    if (pageTitle) {
      for (const pattern of this.successPatterns.titlePatterns) {
        if (pageTitle.toLowerCase().includes(pattern.toLowerCase())) {
          console.log(`[LeverStrategy] Thank you from title: ${pattern}`);
          return pattern;
        }
      }

      // Check for specific Lever title format
      for (const msg of leverMessages) {
        if (pageTitle.toLowerCase().includes(msg.toLowerCase())) {
          return msg;
        }
      }
    }

    // Check text patterns
    if (pageContent) {
      for (const pattern of this.successPatterns.textPatterns) {
        if (pageContent.toLowerCase().includes(pattern.toLowerCase())) {
          console.log(`[LeverStrategy] Thank you from content: ${pattern}`);
          return pattern;
        }
      }

      // Look for specific Lever messages in content
      for (const msg of leverMessages) {
        if (pageContent.toLowerCase().includes(msg.toLowerCase())) {
          return msg;
        }
      }

      // Try to extract company name if mentioned
      const companyMatch = pageContent.match(/Thanks for applying to ([^.]+)/i) ||
                          pageContent.match(/Thank you for applying to ([^.]+)/i);
      if (companyMatch) {
        return `Thanks for applying to ${companyMatch[1].trim()}`;
      }
    }

    // Fallback message
    return 'Your Lever application has been submitted successfully';
  }

  /**
   * Get the Lever strategy priority
   * @returns {number} Priority
   */
  getPriority() {
    return this.priority;
  }

  /**
   * Get the ATS name
   * @returns {string} 'lever'
   */
  getAtsName() {
    return 'lever';
  }

  /**
   * Get display name for Lever
   * @returns {string} 'Lever'
   */
  getDisplayName() {
    return 'Lever';
  }

  /**
   * Extract ATS name from Lever URL
   * @param {string} url - The URL
   * @returns {string} 'lever'
   */
  extractAtsFromUrl(url) {
    return 'lever';
  }

  /**
   * Check if page contains Lever success indicators
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

      // Check for Lever-specific indicators
      const leverIndicators = [
        'lever',
        'thanks for applying',
        'we\'ll be in touch'
      ];
      for (const indicator of leverIndicators) {
        if (pageContent.toLowerCase().includes(indicator)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get the job ID from Lever URL if present
   * Lever URLs typically contain the job ID in the path
   * @param {string} url - The URL
   * @returns {string|null} Job ID or null
   */
  extractJobIdFromUrl(url) {
    // ✅ NULL CHECK
    if (!url) return null;

    try {
      // Lever URL patterns: jobs.lever.co/company/job-id
      const patterns = [
        /jobs\.lever\.co\/[^\/]+\/([^\/?]+)/,
        /lever\.co\/[^\/]+\/([^\/?]+)/,
        /\/apply\/([^\/?]+)/
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

  /**
   * Check if the URL is a Lever job listing page
   * @param {string} url - The URL
   * @returns {boolean} True if it's a job listing page
   */
  isJobListingPage(url) {
    // ✅ NULL CHECK
    if (!url) return false;

    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;

      // Lever job listings are typically at the root or /jobs
      // e.g., jobs.lever.co/company-name/ or jobs.lever.co/company-name/job-id
      const pathParts = pathname.split('/').filter(p => p.length > 0);

      // If the path has 1 part, it's likely a job listing page
      // If it has 2 parts, it could be a specific job
      return pathParts.length === 1 && !url.includes('/apply/');
    } catch (e) {
      return false;
    }
  }
}

export default LeverStrategy;