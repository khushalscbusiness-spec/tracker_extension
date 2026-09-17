// src/background/patterns/strategies/iCIMSStrategy.js

import { SubmissionDetectionStrategy } from '../base/SubmissionDetectionStrategy.js';

/**
 * iCIMS ATS Submission Detection Strategy
 *
 * iCIMS URLs:
 * - careers-company.icims.com/jobs/12345
 * - icims.com
 * - *.icims.com
 *
 * Priority: 5
 */
export class iCIMSStrategy extends SubmissionDetectionStrategy {
  constructor() {
    super();
    this.atsName = 'icims';
    this.priority = 5;

    this.successPatterns = {
      urlPatterns: [
        '/confirmation',
        '/thank-you',
        '/success',
        '/submitted',
        '?submitted=true',
        '/application-submitted'
      ],
      titlePatterns: [
        'thank you',
        'application submitted',
        'application received',
        'successfully applied'
      ],
      textPatterns: [
        'thank you for applying',
        'your application has been submitted',
        'application submitted successfully',
        'we have received your application'
      ]
    };

    this.stepPatterns = {
      form: ['/jobs/', '/apply', '/application'],
      review: ['/review', '/confirm'],
      submit: ['/submit', '/finalize'],
      success: ['/confirmation', '/thank-you', '/success', '/application-submitted']
    };
  }

  canHandle(url) {
    if (!url) return false;
    const urlLower = url.toLowerCase();

    if (urlLower.includes('icims.com')) {
      return true;
    }

    return false;
  }

  isSuccessPage(url) {
    if (!url) return false;
    const urlLower = url.toLowerCase();

    for (const pattern of this.successPatterns.urlPatterns) {
      if (urlLower.includes(pattern.toLowerCase())) {
        console.log(`[iCIMSStrategy] 🎉 Success page detected: ${pattern}`);
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
      'form': 'iCIMS Application Form',
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

    if (urlLower.includes('/jobs/')) {
      return { step: 'form', label: 'iCIMS Application Form', pattern: 'url', matchedPattern: '/jobs/' };
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

    return 'Your iCIMS application has been submitted successfully';
  }

  extractApplicationId(url) {
    if (!url) return null;
    const match = url.match(/[?&](?:applicationId|id)=([^&]+)/i);
    if (match) return match[1];
    return null;
  }

  extractJobId(url) {
    if (!url) return null;
    const match = url.match(/\/jobs\/(\d+)/);
    if (match) return match[1];
    return null;
  }

  getPriority() { return this.priority; }
  getAtsName() { return this.atsName; }
  getDisplayName() { return 'iCIMS'; }
  extractAtsFromUrl(url) { return 'icims'; }
  containsSuccessIndicators(pageContent, pageTitle) {
    return this.isSuccessPage(pageContent || pageTitle);
  }
}

export default iCIMSStrategy;