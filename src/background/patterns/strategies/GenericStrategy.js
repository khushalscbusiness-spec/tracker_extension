// src/background/patterns/strategies/GenericStrategy.js

import { SubmissionDetectionStrategy } from '../base/SubmissionDetectionStrategy.js';

export class GenericStrategy extends SubmissionDetectionStrategy {
  constructor() {
    super();
    this.atsName = 'generic';
    this.priority = 0;

    this.successPatterns = {
      urlPatterns: [
        '/thank-you',
        '/thankyou',
        '/thank_you',
        '/submitted',
        '/success',
        '/confirmation',
        '/application-submitted',
        '/application-submitted/',
        '/apply/success',
        '/apply/thank-you',
        '?submitted=true',
        '?success=true',
        '?application_submitted=true',
        '?thankyou=true'
      ],
      titlePatterns: [
        'thank you',
        'thankyou',
        'submitted',
        'success',
        'confirmation',
        'application submitted',
        'application received',
        'we\'ve received your application',
        'your application has been submitted'
      ],
      textPatterns: [
        'thank you for applying',
        'thank you for your application',
        'your application has been submitted',
        'application submitted successfully',
        'we have received your application',
        'we appreciate your interest',
        'your application is complete',
        'application received'
      ]
    };

    this.stepPatterns = {
      form: [
        'apply',
        'application',
        'job-apply',
        'careers/apply',
        'jobs/apply'
      ],
      review: [
        'review',
        'confirm',
        'verify',
        'check-answers',
        'summary'
      ],
      submit: [
        'submit',
        'finalize',
        'complete',
        'finish',
        'send'
      ],
      success: [
        'thank-you',
        'thankyou',
        'success',
        'confirmed',
        'submitted'
      ]
    };
  }

  canHandle(url) {
    return true;
  }

  isSuccessPage(url) {
    const urlLower = url.toLowerCase();
    for (const pattern of this.successPatterns.urlPatterns) {
      if (urlLower.includes(pattern.toLowerCase())) {
        console.log(`[GenericStrategy] Success page detected by URL pattern: ${pattern}`);
        return true;
      }
    }
    return false;
  }

  detectStep(url, pageTitle) {
    const urlLower = url.toLowerCase();
    const titleLower = pageTitle ? pageTitle.toLowerCase() : '';

    const stepMap = {
      'form': 'Application Form',
      'review': 'Review Application',
      'submit': 'Submitting Application',
      'success': 'Application Submitted'
    };

    for (const [step, patterns] of Object.entries(this.stepPatterns)) {
      for (const pattern of patterns) {
        if (urlLower.includes(pattern.toLowerCase())) {
          return {
            step: step,
            label: stepMap[step] || step,
            pattern: 'url',
            matchedPattern: pattern
          };
        }
        if (titleLower.includes(pattern.toLowerCase())) {
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
        label: 'Application Submitted',
        pattern: 'success_page',
        matchedPattern: 'success_page'
      };
    }

    return {
      step: 'unknown',
      label: 'Unknown Step',
      pattern: 'none',
      matchedPattern: null
    };
  }

  extractThankYouMessage(url, pageTitle, pageContent) {
    if (!this.isSuccessPage(url)) {
      return null;
    }

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

    return 'Application submitted successfully';
  }

  getSuccessPatterns() {
    return this.successPatterns;
  }

  getAtsName() {
    return 'generic';
  }

  getDisplayName() {
    return 'External Site';
  }

  extractAtsFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace('www.', '');
      return hostname.split('.')[0] || 'external';
    } catch (e) {
      return 'external';
    }
  }

  containsSuccessIndicators(pageContent) {
    if (!pageContent) return false;
    const contentLower = pageContent.toLowerCase();
    for (const pattern of this.successPatterns.textPatterns) {
      if (contentLower.includes(pattern.toLowerCase())) {
        return true;
      }
    }
    return false;
  }
}

export default GenericStrategy;