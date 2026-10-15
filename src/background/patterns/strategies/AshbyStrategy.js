// src/background/patterns/strategies/AshbyStrategy.js

import { SubmissionDetectionStrategy } from '../base/SubmissionDetectionStrategy.js';

/**
 * Ashby ATS Submission Detection Strategy
 *
 * Detects when a user successfully submits a job application
 * through Ashby ATS (Applicant Tracking System).
 *
 * Ashby URLs:
 * - jobs.ashbyhq.com/company/job-id/application
 * - jobs.ashbyhq.com/company/job-id
 * - app.ashbyhq.com
 *
 * Priority: 7
 */
export class AshbyStrategy extends SubmissionDetectionStrategy {
  constructor() {
    super();
    this.atsName = 'ashby';
    this.priority = 7;

    this.successPatterns = {
      urlPatterns: [
        '/confirmation',
        '/thank-you',
        '/success',
        '/submitted',
        '?submitted=true',
        '/application/complete'
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

    this.stepPatterns = {
      form: ['/application', '/apply', '/form'],
      review: ['/review', '/confirm', '/verify'],
      submit: ['/submit', '/finalize', '/complete'],
      success: ['/confirmation', '/thank-you', '/success', '/submitted']
    };
  }

  /**
   * Check if this strategy can handle the given URL
   * @param {string} url - The URL to check
   * @returns {boolean} True if it's an Ashby URL
   */
    canHandle(url) {
    if (!url) return false;

    const clean = this.cleanUrl(url);

    if (clean.includes('ashbyhq.com') ||
        clean.includes('ashby.com') ||
        clean.includes('jobs.ashbyhq.com')) {
      console.log(`[AshbyStrategy] ✅ Can handle URL: ${clean}`);
      return true;
    }

    // Path-based fallback — no query string, so no false positives
    if (clean.includes('/application') && clean.includes('ashby')) {
      console.log(`[AshbyStrategy] ✅ Can handle URL (path match): ${clean}`);
      return true;
    }

    return false;
  }

  /**
   * Check if the given URL is an Ashby success page
   * @param {string} url - The URL to check
   * @returns {boolean} True if it's a success page
   */
  isSuccessPage(url) {
    if (!url) return false;

    const urlLower = url.toLowerCase();

    for (const pattern of this.successPatterns.urlPatterns) {
      if (urlLower.includes(pattern.toLowerCase())) {
        console.log(`[AshbyStrategy] 🎉 Success page detected: ${pattern}`);
        return true;
      }
    }

    // Ashby-specific success patterns
    if (urlLower.includes('/application/complete') ||
        urlLower.includes('/submitted') ||
        urlLower.includes('thank-you')) {
      console.log(`[AshbyStrategy] 🎉 Success page detected (Ashby pattern)`);
      return true;
    }

    return false;
  }

  /**
   * Detect which step the user is on
   * @param {string} url - Current URL
   * @param {string} pageTitle - Current page title
   * @returns {Object} Step result
   */
  detectStep(url, pageTitle) {
    if (!url) {
      return { step: 'unknown', label: 'Unknown Step', pattern: 'none', matchedPattern: null };
    }

    const urlLower = url.toLowerCase();
    const titleLower = pageTitle ? pageTitle.toLowerCase() : '';

    const stepMap = {
      'form': 'Ashby Application Form',
      'review': 'Review Application',
      'submit': 'Submitting Application',
      'success': 'Application Submitted Successfully'
    };

    for (const [step, patterns] of Object.entries(this.stepPatterns)) {
      for (const pattern of patterns) {
        if (urlLower.includes(pattern.toLowerCase())) {
          console.log(`[AshbyStrategy] Step "${step}" detected by URL: ${pattern}`);
          return {
            step: step,
            label: stepMap[step] || step,
            pattern: 'url',
            matchedPattern: pattern
          };
        }
      }

      for (const pattern of patterns) {
        if (titleLower.includes(pattern.toLowerCase())) {
          console.log(`[AshbyStrategy] Step "${step}" detected by title: ${pattern}`);
          return {
            step: step,
            label: stepMap[step] || step,
            pattern: 'title',
            matchedPattern: pattern
          };
        }
      }
    }

    if (this.isSuccessPage(url)) {
      return {
        step: 'success',
        label: 'Application Submitted Successfully',
        pattern: 'success_page',
        matchedPattern: 'success_page'
      };
    }

    if (urlLower.includes('/application')) {
      return {
        step: 'form',
        label: 'Ashby Application Form',
        pattern: 'url',
        matchedPattern: '/application'
      };
    }

    return { step: 'unknown', label: 'Unknown Step', pattern: 'none', matchedPattern: null };
  }

  /**
   * Extract thank you message from success page
   * @param {string} url - Current URL
   * @param {string} pageTitle - Current page title
   * @param {string} pageContent - Page content
   * @returns {string|null} Thank you message
   */
  extractThankYouMessage(url, pageTitle, pageContent) {
    if (!this.isSuccessPage(url)) {
      return null;
    }

    const ashbyMessages = [
      'Thank you for applying',
      'Your application has been submitted',
      'Application submitted successfully',
      'We have received your application',
      'Thank you for your interest'
    ];

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

    return 'Your Ashby application has been submitted successfully';
  }

  /**
   * Extract application ID from URL
   * @param {string} url - The URL
   * @returns {string|null} Application ID
   */
  extractApplicationId(url) {
    if (!url) return null;

    const match = url.match(/[?&](?:applicationId|application_id|id)=([^&]+)/i);
    if (match) return match[1];

    const pathMatch = url.match(/\/application\/([^\/?]+)/);
    if (pathMatch) return pathMatch[1];

    return null;
  }

  /**
   * Extract job ID from URL
   * @param {string} url - The URL
   * @returns {string|null} Job ID
   */
  extractJobId(url) {
    if (!url) return null;

    // Ashby URL pattern: /company/job-id/application
    const match = url.match(/\/[^\/]+\/([a-f0-9-]{36})/i);
    if (match) return match[1];

    // Fallback: any UUID in URL
    const uuidMatch = url.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    if (uuidMatch) return uuidMatch[1];

    return null;
  }

  getPriority() { return this.priority; }
  getAtsName() { return this.atsName; }
  getDisplayName() { return 'Ashby'; }
  extractAtsFromUrl(url) { return 'ashby'; }
  containsSuccessIndicators(pageContent, pageTitle) {
    return this.isSuccessPage(pageContent || pageTitle);
  }
}

export default AshbyStrategy;