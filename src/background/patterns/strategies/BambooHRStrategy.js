// src/background/patterns/strategies/BambooHRStrategy.js

import { SubmissionDetectionStrategy } from '../base/SubmissionDetectionStrategy.js';

/**
 * BambooHR ATS Submission Detection Strategy
 *
 * BambooHR URLs:
 * - company.bamboohr.com/careers/12345
 * - bamboohr.com
 * - *.bamboohr.com
 *
 * Priority: 4
 */
export class BambooHRStrategy extends SubmissionDetectionStrategy {
  constructor() {
    super();
    this.atsName = 'bamboohr';
    this.priority = 4;

    this.successPatterns = {
      urlPatterns: [
        '/confirmation',
        '/thank-you',
        '/success',
        '/submitted',
        '?submitted=true',
        '/application/submitted'
      ],
      titlePatterns: [
        'thank you',
        'application submitted',
        'application received'
      ],
      textPatterns: [
        'thank you for applying',
        'your application has been submitted',
        'application submitted successfully',
        'we have received your application'
      ]
    };

    this.stepPatterns = {
      form: ['/careers/', '/apply', '/application'],
      review: ['/review', '/confirm'],
      submit: ['/submit'],
      success: ['/confirmation', '/thank-you', '/success', '/application/submitted']
    };
  }

  canHandle(url) {
    if (!url) return false;
    const clean = this.cleanUrl(url);
    return clean.includes('bamboohr.com');
  }

  isSuccessPage(url) {
    if (!url) return false;
    const urlLower = url.toLowerCase();

    for (const pattern of this.successPatterns.urlPatterns) {
      if (urlLower.includes(pattern.toLowerCase())) {
        console.log(`[BambooHRStrategy] 🎉 Success page detected: ${pattern}`);
        return true;
      }
    }
    return false;
  }

  detectStep(url, pageTitle) {
    if (!url) {
      return { step: 'unknown', label: 'Unknown Step', pattern: 'none', matchedPattern: null };
    }

    const urlLower = url.toLowerCase();
    const titleLower = pageTitle ? pageTitle.toLowerCase() : '';

    const stepMap = {
      'form': 'BambooHR Application Form',
      'review': 'Review Application',
      'submit': 'Submitting Application',
      'success': 'Application Submitted Successfully'
    };

    for (const [step, patterns] of Object.entries(this.stepPatterns)) {
      for (const pattern of patterns) {
        if (urlLower.includes(pattern.toLowerCase())) {
          return { step, label: stepMap[step], pattern: 'url', matchedPattern: pattern };
        }
        if (titleLower.includes(pattern.toLowerCase())) {
          return { step, label: stepMap[step], pattern: 'title', matchedPattern: pattern };
        }
      }
    }

    if (this.isSuccessPage(url)) {
      return { step: 'success', label: 'Application Submitted Successfully', pattern: 'success_page', matchedPattern: 'success_page' };
    }

    return { step: 'unknown', label: 'Unknown Step', pattern: 'none', matchedPattern: null };
  }

  extractThankYouMessage(url, pageTitle, pageContent) {
    if (!this.isSuccessPage(url)) return null;

    if (pageTitle) {
      for (const pattern of this.successPatterns.titlePatterns) {
        if (pageTitle.toLowerCase().includes(pattern.toLowerCase())) return pattern;
      }
    }

    if (pageContent) {
      for (const pattern of this.successPatterns.textPatterns) {
        if (pageContent.toLowerCase().includes(pattern.toLowerCase())) return pattern;
      }
    }

    return 'Your BambooHR application has been submitted successfully';
  }

  extractApplicationId(url) {
    if (!url) return null;
    const match = url.match(/[?&](?:applicationId|id)=([^&]+)/i);
    if (match) return match[1];
    return null;
  }

  extractJobId(url) {
    if (!url) return null;
    const match = url.match(/\/careers\/(\d+)/);
    if (match) return match[1];
    return null;
  }

  getPriority() { return this.priority; }
  getAtsName() { return this.atsName; }
  getDisplayName() { return 'BambooHR'; }
  extractAtsFromUrl(url) { return 'bamboohr'; }
  containsSuccessIndicators(pageContent, pageTitle) {
    return this.isSuccessPage(pageContent || pageTitle);
  }
}

export default BambooHRStrategy;