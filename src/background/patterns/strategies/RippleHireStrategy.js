// src/background/patterns/strategies/RippleHireStrategy.js

import { SubmissionDetectionStrategy } from '../base/SubmissionDetectionStrategy.js';

/**
 * RippleHire ATS Submission Detection Strategy
 *
 * Detects when a user successfully submits a job application
 * through RippleHire ATS.
 *
 * RippleHire is an Indian ATS used by companies like:
 * - Paytm (One97 Communications)
 * - HDFC Bank
 * - Axis Bank
 * - Mphasis
 * - Myntra
 *
 * URL pattern:
 * - https://company.ripplehire.com/candidate/?token=xxx#detail/job/844714
 * - https://company.ripplehire.com/candidate/?token=xxx#apply/job/844714
 *
 * Priority: 6
 */
export class RippleHireStrategy extends SubmissionDetectionStrategy {
  constructor() {
    super();
    this.atsName = 'ripplehire';
    this.priority = 6;

    this.successPatterns = {
      urlPatterns: [
        '#apply-success',
        '/apply-success',
        '/confirmation',
        '/thank-you',
        '/success'
      ],
      titlePatterns: [
        'thank you',
        'application submitted',
        'successfully applied',
        'application received'
      ],
      textPatterns: [
        'successfully applied',
        'thank you for applying',
        'your application has been submitted',
        'application submitted successfully',
        'we have received your application'
      ]
    };

    this.stepPatterns = {
      detail: [
        '#detail/job/'
      ],
      form: [
        '#apply/job/',
        '/apply/'
      ],
      success: [
        '#apply-success',
        '/apply-success'
      ]
    };
  }

  /**
   * Check if this strategy can handle the given URL
   */
  canHandle(url) {
    if (!url) return false;
    const clean = this.cleanUrl(url);
    return clean.includes('ripplehire.com');
  }

  /**
   * Check if the given URL is a success page
   */
  isSuccessPage(url) {
    if (!url) return false;
    const urlLower = url.toLowerCase();

    for (const pattern of this.successPatterns.urlPatterns) {
      if (urlLower.includes(pattern.toLowerCase())) {
        console.log(`[RippleHireStrategy] 🎉 Success page detected: ${pattern}`);
        return true;
      }
    }

    return false;
  }

  /**
   * Detect which step the user is on
   */
  detectStep(url, pageTitle) {
    if (!url) {
      return { step: 'unknown', label: 'Unknown Step', pattern: 'none', matchedPattern: null };
    }

    const urlLower = url.toLowerCase();
    const titleLower = pageTitle ? pageTitle.toLowerCase() : '';

    const stepMap = {
      'detail': 'Job Detail Page',
      'form': 'Application Form',
      'success': 'Application Submitted'
    };

    // Check URL patterns
    for (const [step, patterns] of Object.entries(this.stepPatterns)) {
      for (const pattern of patterns) {
        if (urlLower.includes(pattern.toLowerCase())) {
          console.log(`[RippleHireStrategy] Step "${step}" detected by URL: ${pattern}`);
          return {
            step: step,
            label: stepMap[step] || step,
            pattern: 'url',
            matchedPattern: pattern
          };
        }
      }
    }

    // Check title patterns
    if (titleLower.includes('apply for') || titleLower.includes('application form')) {
      return {
        step: 'form',
        label: 'Application Form',
        pattern: 'title',
        matchedPattern: 'apply for'
      };
    }

    if (titleLower.includes('job detail') || titleLower.includes('careers')) {
      return {
        step: 'detail',
        label: 'Job Detail Page',
        pattern: 'title',
        matchedPattern: 'careers'
      };
    }

    return { step: 'unknown', label: 'Unknown Step', pattern: 'none', matchedPattern: null };
  }

  /**
   * Extract thank you message
   */
  extractThankYouMessage(url, pageTitle, pageContent) {
    if (!this.isSuccessPage(url)) {
      return null;
    }

    const messages = [
      'successfully applied',
      'thank you for applying',
      'your application has been submitted',
      'application submitted successfully',
      'we have received your application'
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

    return 'Application submitted successfully via RippleHire';
  }

  /**
   * Extract application ID from URL
   */
  extractApplicationId(url) {
    if (!url) return null;

    try {
      const urlObj = new URL(url);
      const hash = urlObj.hash;

      // #apply-success or similar
      const hashMatch = hash.match(/\/(\d+)/);
      if (hashMatch) return hashMatch[1];

      const search = urlObj.search;
      const tokenMatch = search.match(/[?&]token=([^&]+)/);
      if (tokenMatch) return tokenMatch[1];

      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Extract job ID from URL
   */
  extractJobId(url) {
    if (!url) return null;

    try {
      const urlObj = new URL(url);
      const hash = urlObj.hash;

      const match = hash.match(/\/(?:apply|detail)\/job\/(\d+)/);
      if (match) return match[1];

      return null;
    } catch (e) {
      return null;
    }
  }

  getPriority() { return this.priority; }
  getAtsName() { return this.atsName; }
  getDisplayName() { return 'RippleHire'; }
  extractAtsFromUrl(url) { return 'ripplehire'; }

  containsSuccessIndicators(pageContent, pageTitle) {
    if (!pageContent && !pageTitle) return false;

    if (pageTitle) {
      for (const pattern of this.successPatterns.titlePatterns) {
        if (pageTitle.toLowerCase().includes(pattern.toLowerCase())) {
          return true;
        }
      }
    }

    if (pageContent) {
      for (const pattern of this.successPatterns.textPatterns) {
        if (pageContent.toLowerCase().includes(pattern.toLowerCase())) {
          return true;
        }
      }
    }

    return false;
  }
}

export default RippleHireStrategy;