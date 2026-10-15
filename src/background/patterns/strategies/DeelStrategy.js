// src/background/patterns/strategies/DeelStrategy.js

import { SubmissionDetectionStrategy } from '../base/SubmissionDetectionStrategy.js';

/**
 * Deel ATS Submission Detection Strategy
 *
 * Detects when a user successfully submits a job application
 * through Deel ATS (Applicant Tracking System).
 *
 * Deel is a global HR/payroll platform that also hosts job boards.
 * Many companies use Deel for hiring.
 *
 * Deel URLs:
 * - jobs.deel.com/company/job-details/job-id/application
 * - jobs.deel.com/company/job-details/job-id
 * - deel.com/careers
 *
 * Priority: 7 (same tier as Ashby)
 */
export class DeelStrategy extends SubmissionDetectionStrategy {
  constructor() {
    super();

    // ATS identification
    this.atsName = 'deel';
    this.priority = 7;

    // Deel specific success patterns
    this.successPatterns = {
      urlPatterns: [
        '/confirmation',
        '/thank-you',
        '/success',
        '/submitted',
        '/application-submitted',
        '?submitted=true',
        '?success=true',
        '?application_submitted=true'
      ],
      titlePatterns: [
        'thank you',
        'application submitted',
        'application received',
        'successfully applied',
        'application complete'
      ],
      textPatterns: [
        'thank you for applying',
        'your application has been submitted',
        'application submitted successfully',
        'we have received your application',
        'you have successfully applied',
        'thank you for your interest'
      ]
    };

    // Deel specific step patterns
    this.stepPatterns = {
      form: [
        '/application',
        '/apply',
        '/job-details',
        '/form'
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
        '/confirmation',
        '/thank-you',
        '/success',
        '/submitted',
        '/application-submitted'
      ]
    };
  }

  /**
   * Check if this strategy can handle the given URL
   * Matches Deel domains: jobs.deel.com, deel.com
   * @param {string} url - The URL to check
   * @returns {boolean} True if it's a Deel URL
   */
  canHandle(url) {
    if (!url) return false;

    const clean = this.cleanUrl(url);

    const patterns = [
      /jobs\.deel\.com/,
      /deel\.com/
    ];
    for (const pattern of patterns) {
      if (pattern.test(clean)) {
        console.log(`[DeelStrategy] ✅ Can handle URL: ${clean}`);
        return true;
      }
    }

    if (clean.includes('deel.com') || clean.includes('jobs.deel')) {
      console.log(`[DeelStrategy] ✅ Can handle URL (path match): ${clean}`);
      return true;
    }

    return false;
  }

  /**
   * Check if the given URL is a Deel success page
   * @param {string} url - The URL to check
   * @returns {boolean} True if it's a success page
   */
  isSuccessPage(url) {
    // ✅ NULL CHECK
    if (!url) return false;

    const urlLower = url.toLowerCase();

    // First check for Deel-specific success URL patterns
    for (const pattern of this.successPatterns.urlPatterns) {
      if (urlLower.includes(pattern.toLowerCase())) {
        console.log(`[DeelStrategy] 🎉 Success page detected: ${pattern}`);
        return true;
      }
    }

    // Deel often uses: /confirmation or /submitted
    if (urlLower.includes('/confirmation') ||
        urlLower.includes('/thank-you') ||
        urlLower.includes('/submitted') ||
        urlLower.includes('/application-submitted')) {
      console.log(`[DeelStrategy] 🎉 Success page detected (path match)`);
      return true;
    }

    return false;
  }

  /**
   * Detect which step the user is on in the Deel application flow
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

    // Step labels for Deel
    const stepMap = {
      'form': 'Deel Application Form',
      'review': 'Review Your Deel Application',
      'submit': 'Submitting Your Deel Application',
      'success': 'Deel Application Submitted Successfully'
    };

    // Check each step pattern
    for (const [step, patterns] of Object.entries(this.stepPatterns)) {
      // Check URL patterns
      for (const pattern of patterns) {
        if (urlLower.includes(pattern.toLowerCase())) {
          console.log(`[DeelStrategy] Step "${step}" detected by URL: ${pattern}`);
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
          console.log(`[DeelStrategy] Step "${step}" detected by title: ${pattern}`);
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
        label: 'Deel Application Submitted Successfully',
        pattern: 'success_page',
        matchedPattern: 'success_page'
      };
    }

    // Check if it's a Deel application page (form detection)
    if (urlLower.includes('/application') && !urlLower.includes('/confirmation')) {
      return {
        step: 'form',
        label: 'Deel Application Form',
        pattern: 'url',
        matchedPattern: '/application'
      };
    }

    // Check for job-details page (pre-application)
    if (urlLower.includes('/job-details')) {
      return {
        step: 'form',
        label: 'Deel Job Details',
        pattern: 'url',
        matchedPattern: '/job-details'
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
   * Extract thank you message from Deel success page
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

    // Common Deel thank you messages
    const deelMessages = [
      'Thank you for applying',
      'Your application has been submitted',
      'Application submitted successfully',
      'We have received your application',
      'You have successfully applied',
      'Thank you for your interest'
    ];

    // Check title patterns
    if (pageTitle) {
      for (const pattern of this.successPatterns.titlePatterns) {
        if (pageTitle.toLowerCase().includes(pattern.toLowerCase())) {
          console.log(`[DeelStrategy] Thank you from title: ${pattern}`);
          return pattern;
        }
      }

      // Check for specific Deel title format
      for (const msg of deelMessages) {
        if (pageTitle.toLowerCase().includes(msg.toLowerCase())) {
          return msg;
        }
      }
    }

    // Check text patterns
    if (pageContent) {
      for (const pattern of this.successPatterns.textPatterns) {
        if (pageContent.toLowerCase().includes(pattern.toLowerCase())) {
          console.log(`[DeelStrategy] Thank you from content: ${pattern}`);
          return pattern;
        }
      }

      // Look for specific Deel messages in content
      for (const msg of deelMessages) {
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
    return 'Your Deel application has been submitted successfully';
  }

  /**
   * Get the Deel strategy priority
   * @returns {number} Priority
   */
  getPriority() {
    return this.priority;
  }

  /**
   * Get the ATS name
   * @returns {string} 'deel'
   */
  getAtsName() {
    return 'deel';
  }

  /**
   * Get display name for Deel
   * @returns {string} 'Deel'
   */
  getDisplayName() {
    return 'Deel';
  }

  /**
   * Extract ATS name from Deel URL
   * @param {string} url - The URL
   * @returns {string} 'deel'
   */
  extractAtsFromUrl(url) {
    return 'deel';
  }

  /**
   * Check if page contains Deel success indicators
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

      // Check for Deel-specific indicators
      const deelIndicators = [
        'deel',
        'thank you for applying',
        'application submitted'
      ];
      for (const indicator of deelIndicators) {
        if (pageContent.toLowerCase().includes(indicator)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get the job ID from Deel URL if present
   * Deel URLs contain UUID: /job-details/859935f9-29c0-4cce-9e38-160a8b30854b/application
   * @param {string} url - The URL
   * @returns {string|null} Job ID or null
   */
  extractJobIdFromUrl(url) {
    // ✅ NULL CHECK
    if (!url) return null;

    try {
      // Deel URL patterns: /job-details/<uuid>/application
      const patterns = [
        /\/job-details\/([a-f0-9-]{36})/i,
        /\/jobs\/([a-f0-9-]{36})/i,
        /\/application\/([a-f0-9-]{36})/i
      ];

      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
          return match[1];
        }
      }

      // Fallback: any UUID in URL
      const uuidMatch = url.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
      if (uuidMatch) {
        return uuidMatch[1];
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Extract application ID from URL
   * @param {string} url - The URL
   * @returns {string|null} Application ID or null
   */
  extractApplicationId(url) {
    // ✅ NULL CHECK
    if (!url) return null;

    try {
      const match = url.match(/[?&](?:applicationId|application_id|id)=([^&]+)/i);
      if (match) return match[1];

      return null;
    } catch (e) {
      return null;
    }
  }
}

export default DeelStrategy;