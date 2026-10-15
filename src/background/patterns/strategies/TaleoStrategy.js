// src/background/patterns/strategies/TaleoStrategy.js

import { SubmissionDetectionStrategy } from '../base/SubmissionDetectionStrategy.js';

/**
 * Taleo ATS Submission Detection Strategy
 *
 * Taleo URLs:
 * - company.taleo.net/careersection/...
 * - taleo.net
 * - *.taleo.net
 *
 * Priority: 3
 */
export class TaleoStrategy extends SubmissionDetectionStrategy {
  constructor() {
    super();
    this.atsName = 'taleo';
    this.priority = 3;

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
      form: ['/careersection/', '/apply', '/application'],
      review: ['/review', '/confirm'],
      submit: ['/submit'],
      success: ['/confirmation', '/thank-you', '/success', '/application/complete']
    };
  }

  canHandle(url) {
    if (!url) return false;
    const clean = this.cleanUrl(url);
    return clean.includes('taleo.net');
  }

  isSuccessPage(url) {
    if (!url) return false;
    const urlLower = url.toLowerCase();

    for (const pattern of this.successPatterns.urlPatterns) {
      if (urlLower.includes(pattern.toLowerCase())) {
        console.log(`[TaleoStrategy] 🎉 Success page detected: ${pattern}`);
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
      'form': 'Taleo Application Form',
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

    return 'Your Taleo application has been submitted successfully';
  }

  extractApplicationId(url) {
    if (!url) return null;
    const match = url.match(/[?&](?:applicationId|id)=([^&]+)/i);
    if (match) return match[1];
    return null;
  }

  extractJobId(url) {
    if (!url) return null;
    const match = url.match(/\/jobs\/(\d+)/) || url.match(/job=(\d+)/);
    if (match) return match[1];
    return null;
  }

  getPriority() { return this.priority; }
  getAtsName() { return this.atsName; }
  getDisplayName() { return 'Taleo'; }
  extractAtsFromUrl(url) { return 'taleo'; }
  containsSuccessIndicators(pageContent, pageTitle) {
    return this.isSuccessPage(pageContent || pageTitle);
  }
}

export default TaleoStrategy;