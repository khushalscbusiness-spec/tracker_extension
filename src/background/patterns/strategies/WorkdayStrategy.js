// src/background/patterns/strategies/WorkdayStrategy.js

import { SubmissionDetectionStrategy } from '../base/SubmissionDetectionStrategy.js';

/**
 * Workday ATS Submission Detection Strategy
 *
 * Detects when a user successfully submits a job application
 * through Workday ATS (Applicant Tracking System).
 *
 * Workday is fundamentally different from other ATS platforms:
 *
 * 1. MULTI-STEP PROCESS:
 *    - Step 1: Personal Information
 *    - Step 2: Resume/CV Upload
 *    - Step 3: Additional Questions
 *    - Step 4: Review & Submit
 *    - Step 5: Confirmation/Success
 *
 * 2. URL BEHAVIOR:
 *    - Often stays on the same URL throughout the process
 *    - Uses JavaScript to navigate between steps
 *    - URL may only change at the beginning or end
 *
 * 3. DETECTION CHALLENGES:
 *    - Can't rely on URL changes for steps
 *    - Must detect step changes via DOM content
 *    - Success is often indicated by a confirmation message/text
 *    - Sometimes uses query parameters to indicate completion
 *
 * Priority: 8 (High - checked after Greenhouse and Lever)
 */
export class WorkdayStrategy extends SubmissionDetectionStrategy {
  constructor() {
    super();

    // ATS identification
    this.atsName = 'workday';
    this.priority = 8;

    // Workday specific success patterns
    this.successPatterns = {
      urlPatterns: [
        '/thank-you',
        '/confirmation',
        '/success',
        '?complete=true',
        '?submitted=true',
        '/submitted'
      ],
      titlePatterns: [
        'thank you',
        'application submitted',
        'application complete',
        'submitted successfully',
        'confirmation'
      ],
      textPatterns: [
        'thank you for applying',
        'your application has been submitted',
        'application submitted successfully',
        'we have received your application',
        'your application is complete',
        'you have successfully applied',
        'thank you for your interest',
        'we will review your application'
      ],
      // Workday-specific confirmation indicators
      confirmationIndicators: [
        'application submitted',
        'thank you for applying',
        'submission received',
        'your application is complete',
        'you have successfully applied'
      ]
    };

    // Workday step patterns
    this.stepPatterns = {
      // Step 1: Personal Information
      personal_info: [
        'personal information',
        'contact information',
        'personal details',
        'first name',
        'last name',
        'email address'
      ],
      // Step 2: Resume Upload
      resume_upload: [
        'upload resume',
        'resume upload',
        'attach resume',
        'upload cv',
        'choose file',
        'browse resume'
      ],
      // Step 3: Additional Questions
      questions: [
        'additional questions',
        'application questions',
        'more questions',
        'pre-screening',
        'qualifications'
      ],
      // Step 4: Review & Submit
      review_submit: [
        'review application',
        'submit application',
        'review and submit',
        'confirm application',
        'final review'
      ],
      // Step 5: Success/Confirmation
      success: [
        'thank you',
        'submitted',
        'complete',
        'confirmation'
      ]
    };
  }

  /**
   * Check if this strategy can handle the given URL
   * Matches Workday domains: myworkdayjobs.com, workday.com
   * @param {string} url - The URL to check
   * @returns {boolean} True if it's a Workday URL
   */
  canHandle(url) {
    if (!url) return false;
    const patterns = [
      /myworkdayjobs\.com/,
      /workday\.com/,
      /workday\./
    ];

    for (const pattern of patterns) {
      if (this.matchesDomain(url, pattern)) {
        console.log(`[WorkdayStrategy] ✅ Can handle URL: ${url}`);
        return true;
      }
    }

    // Also check if URL contains workday-specific paths
    const urlLower = url.toLowerCase();
    if (urlLower.includes('workday') ||
        urlLower.includes('myworkday')) {
      console.log(`[WorkdayStrategy] ✅ Can handle URL (path match): ${url}`);
      return true;
    }

    return false;
  }

  /**
   * Check if the given URL is a Workday success page
   * Workday success is often indicated by:
   * - URL changes to /submitted or /confirmation
   * - Query parameters like ?complete=true
   * - Page content with success messages
   *
   * @param {string} url - The URL to check
   * @returns {boolean} True if it's a success page
   */
  isSuccessPage(url) {
    if (!url) return false;
    const urlLower = url.toLowerCase();

    // Check URL patterns
    for (const pattern of this.successPatterns.urlPatterns) {
      if (urlLower.includes(pattern.toLowerCase())) {
        console.log(`[WorkdayStrategy] 🎉 Success page detected (URL): ${pattern}`);
        return true;
      }
    }

    // Check for Workday-specific success URL patterns
    if (urlLower.includes('/submitted') ||
        urlLower.includes('/confirmation') ||
        urlLower.includes('complete=true') ||
        urlLower.includes('submitted=true')) {
      console.log(`[WorkdayStrategy] 🎉 Success page detected (Workday pattern)`);
      return true;
    }

    return false;
  }

  /**
   * Detect which step the user is on in the Workday application flow
   *
   * IMPORTANT: Workday often doesn't change URLs between steps.
   * We must detect steps based on page content/DOM elements.
   *
   * @param {string} url - Current URL
   * @param {string} pageTitle - Current page title
   * @param {string} pageContent - Page text content
   * @returns {Object} { step: string, label: string, pattern: string, matchedPattern: string }
   */
  detectStep(url, pageTitle, pageContent) {
    if (!url) {
      return {  // ✅ ADD THIS BLOCK
        step: 'unknown',
        label: 'Unknown Step',
        pattern: 'none',
        matchedPattern: null
      };
    }
    const urlLower = url.toLowerCase();
    const titleLower = pageTitle ? pageTitle.toLowerCase() : '';
    const contentLower = pageContent ? pageContent.toLowerCase() : '';

    // Step labels for Workday
    const stepMap = {
      'personal_info': 'Personal Information',
      'resume_upload': 'Resume/CV Upload',
      'questions': 'Additional Questions',
      'review_submit': 'Review & Submit',
      'success': 'Application Submitted Successfully'
    };

    // FIRST: Check for success (highest priority)
    if (this.isSuccessPage(url)) {
      return {
        step: 'success',
        label: 'Application Submitted Successfully',
        pattern: 'success_page',
        matchedPattern: 'success_page'
      };
    }

    // Check if it's a confirmation page by content
    if (contentLower) {
      for (const indicator of this.successPatterns.confirmationIndicators) {
        if (contentLower.includes(indicator.toLowerCase())) {
          console.log(`[WorkdayStrategy] 🎉 Success detected from content: ${indicator}`);
          return {
            step: 'success',
            label: 'Application Submitted Successfully',
            pattern: 'content',
            matchedPattern: indicator
          };
        }
      }
    }

    // Check page title for success
    if (titleLower) {
      for (const pattern of this.successPatterns.titlePatterns) {
        if (titleLower.includes(pattern.toLowerCase())) {
          console.log(`[WorkdayStrategy] 🎉 Success detected from title: ${pattern}`);
          return {
            step: 'success',
            label: 'Application Submitted Successfully',
            pattern: 'title',
            matchedPattern: pattern
          };
        }
      }
    }

    // SECOND: Detect which step user is on based on content
    // This is the key for Workday - content-based detection

    // Check for each step
    for (const [step, patterns] of Object.entries(this.stepPatterns)) {
      // Skip success step (already checked)
      if (step === 'success') continue;

      // Check content for patterns
      if (contentLower) {
        for (const pattern of patterns) {
          if (contentLower.includes(pattern.toLowerCase())) {
            console.log(`[WorkdayStrategy] Step "${step}" detected by content: ${pattern}`);
            return {
              step: step,
              label: stepMap[step] || step,
              pattern: 'content',
              matchedPattern: pattern
            };
          }
        }
      }

      // Check URL for patterns
      for (const pattern of patterns) {
        if (urlLower.includes(pattern.toLowerCase())) {
          console.log(`[WorkdayStrategy] Step "${step}" detected by URL: ${pattern}`);
          return {
            step: step,
            label: stepMap[step] || step,
            pattern: 'url',
            matchedPattern: pattern
          };
        }
      }
    }

    // THIRD: Check for step indicators in the page structure
    if (contentLower) {
      // Check for step indicators like "Step 1 of 4", "Step 2 of 4", etc.
      const stepMatch = contentLower.match(/step\s*(\d+)\s*of\s*(\d+)/i);
      if (stepMatch) {
        const currentStep = parseInt(stepMatch[1]);
        const totalSteps = parseInt(stepMatch[2]);
        const stepNames = [
          'personal_info',
          'resume_upload',
          'questions',
          'review_submit'
        ];

        if (currentStep <= stepNames.length) {
          const stepName = stepNames[currentStep - 1];
          console.log(`[WorkdayStrategy] Step detected from "Step ${currentStep} of ${totalSteps}": ${stepName}`);
          return {
            step: stepName,
            label: stepMap[stepName] || stepName,
            pattern: 'step_indicator',
            matchedPattern: `Step ${currentStep} of ${totalSteps}`
          };
        }
      }

      // Check for "Next" or "Continue" buttons - indicates form is active
      if (contentLower.includes('next') || contentLower.includes('continue')) {
        // Determine which step by looking at other content
        if (contentLower.includes('resume') || contentLower.includes('upload')) {
          return {
            step: 'resume_upload',
            label: 'Resume/CV Upload',
            pattern: 'content',
            matchedPattern: 'resume_upload'
          };
        }
        if (contentLower.includes('question') || contentLower.includes('screening')) {
          return {
            step: 'questions',
            label: 'Additional Questions',
            pattern: 'content',
            matchedPattern: 'questions'
          };
        }
        if (contentLower.includes('review') || contentLower.includes('confirm')) {
          return {
            step: 'review_submit',
            label: 'Review & Submit',
            pattern: 'content',
            matchedPattern: 'review_submit'
          };
        }
        // Default to personal info if nothing else matches
        return {
          step: 'personal_info',
          label: 'Personal Information',
          pattern: 'content',
          matchedPattern: 'form_active'
        };
      }
    }

    // FOURTH: Check URL patterns for step detection (fallback)
    if (urlLower.includes('personal') || urlLower.includes('contact')) {
      return {
        step: 'personal_info',
        label: 'Personal Information',
        pattern: 'url',
        matchedPattern: 'personal'
      };
    }
    if (urlLower.includes('resume') || urlLower.includes('upload')) {
      return {
        step: 'resume_upload',
        label: 'Resume/CV Upload',
        pattern: 'url',
        matchedPattern: 'resume_upload'
      };
    }
    if (urlLower.includes('question') || urlLower.includes('screening')) {
      return {
        step: 'questions',
        label: 'Additional Questions',
        pattern: 'url',
        matchedPattern: 'questions'
      };
    }
    if (urlLower.includes('review') || urlLower.includes('submit')) {
      return {
        step: 'review_submit',
        label: 'Review & Submit',
        pattern: 'url',
        matchedPattern: 'review_submit'
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
   * Extract thank you message from Workday success page
   * Workday often has success messages embedded in the page content
   * @param {string} url - Current URL
   * @param {string} pageTitle - Current page title
   * @param {string} pageContent - Page text content
   * @returns {string|null} Thank you message or null
   */
  extractThankYouMessage(url, pageTitle, pageContent) {
    // First check if it's a success page
    if (!this.isSuccessPage(url)) {
      // Check if content indicates success
      if (pageContent) {
        for (const indicator of this.successPatterns.confirmationIndicators) {
          if (pageContent.toLowerCase().includes(indicator.toLowerCase())) {
            // It is a success page, continue
            break;
          }
        }
        // If no indicators found, return null
        const hasIndicator = this.successPatterns.confirmationIndicators.some(
          i => pageContent.toLowerCase().includes(i.toLowerCase())
        );
        if (!hasIndicator) {
          return null;
        }
      } else {
        return null;
      }
    }

    // Common Workday thank you messages
    const workdayMessages = [
      'Thank you for applying',
      'Your application has been submitted',
      'Application submitted successfully',
      'We have received your application',
      'Your application is complete',
      'You have successfully applied',
      'Thank you for your interest'
    ];

    // Check title patterns
    if (pageTitle) {
      for (const pattern of this.successPatterns.titlePatterns) {
        if (pageTitle.toLowerCase().includes(pattern.toLowerCase())) {
          console.log(`[WorkdayStrategy] Thank you from title: ${pattern}`);
          return pattern;
        }
      }

      for (const msg of workdayMessages) {
        if (pageTitle.toLowerCase().includes(msg.toLowerCase())) {
          return msg;
        }
      }
    }

    // Check text patterns
    if (pageContent) {
      for (const pattern of this.successPatterns.textPatterns) {
        if (pageContent.toLowerCase().includes(pattern.toLowerCase())) {
          console.log(`[WorkdayStrategy] Thank you from content: ${pattern}`);
          return pattern;
        }
      }

      for (const msg of workdayMessages) {
        if (pageContent.toLowerCase().includes(msg.toLowerCase())) {
          return msg;
        }
      }

      // Try to extract the company name
      const companyMatch = pageContent.match(/Thank you for applying to ([^.]+)/i) ||
                          pageContent.match(/Your application to ([^.]+) has been submitted/i);
      if (companyMatch) {
        return `Thank you for applying to ${companyMatch[1].trim()}`;
      }
    }

    // Fallback message
    return 'Your Workday application has been submitted successfully';
  }

  /**
   * Get the Workday strategy priority
   * @returns {number} Priority
   */
  getPriority() {
    return this.priority;
  }

  /**
   * Get the ATS name
   * @returns {string} 'workday'
   */
  getAtsName() {
    return 'workday';
  }

  /**
   * Get display name for Workday
   * @returns {string} 'Workday'
   */
  getDisplayName() {
    return 'Workday';
  }

  /**
   * Extract ATS name from Workday URL
   * @param {string} url - The URL
   * @returns {string} 'workday'
   */
  extractAtsFromUrl(url) {
    return 'workday';
  }

  /**
   * Check if page contains Workday success indicators
   * @param {string} pageContent - Page text content
   * @param {string} pageTitle - Page title
   * @returns {boolean} True if success indicators are found
   */
  containsSuccessIndicators(pageContent, pageTitle) {
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

      // Check Workday-specific indicators
      for (const indicator of this.successPatterns.confirmationIndicators) {
        if (pageContent.toLowerCase().includes(indicator.toLowerCase())) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get the job ID from Workday URL if present
   * @param {string} url - The URL
   * @returns {string|null} Job ID or null
   */
  extractJobIdFromUrl(url) {
    if (!url) return null;
    try {
      // Workday URL patterns
      const patterns = [
        /\/jobs\/([^\/?]+)/,
        /\/requisition\/([^\/?]+)/,
        /job-([^\/?]+)/,
        /jobId=([^&]+)/
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
   * Check if the URL is a Workday application page
   * @param {string} url - The URL
   * @returns {boolean} True if it's an application page
   */
  isApplicationPage(url) {
    const urlLower = url.toLowerCase();
    return urlLower.includes('/apply') ||
           urlLower.includes('/application') ||
           urlLower.includes('/careers') && !urlLower.includes('/thank-you');
  }

  /**
   * Detect if user is in the middle of the Workday flow
   * @param {string} pageContent - Page text content
   * @param {string} url - Current URL
   * @returns {boolean} True if in progress
   */
  isInProgress(pageContent, url) {
    // Check if URL indicates application flow
    if (this.isApplicationPage(url)) {
      // Check if not at success page
      if (!this.isSuccessPage(url)) {
        // Check content for form indicators
        if (pageContent) {
          const formIndicators = [
            'next', 'continue', 'save',
            'personal', 'resume', 'upload',
            'question', 'review', 'submit'
          ];
          return formIndicators.some(i => pageContent.toLowerCase().includes(i));
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Get the current step number from the page content
   * @param {string} pageContent - Page text content
   * @returns {number|null} Step number or null
   */
  getCurrentStepNumber(pageContent) {
    if (!pageContent) return null;

    const stepMatch = pageContent.match(/step\s*(\d+)\s*of\s*(\d+)/i);
    if (stepMatch) {
      return parseInt(stepMatch[1]);
    }

    // Look for progress indicators like "1/4", "2/4", etc.
    const progressMatch = pageContent.match(/(\d+)\s*\/\s*(\d+)/);
    if (progressMatch) {
      return parseInt(progressMatch[1]);
    }

    return null;
  }

  /**
   * Get the total number of steps from the page content
   * @param {string} pageContent - Page text content
   * @returns {number|null} Total steps or null
   */
  getTotalSteps(pageContent) {
    if (!pageContent) return null;

    const stepMatch = pageContent.match(/step\s*(\d+)\s*of\s*(\d+)/i);
    if (stepMatch) {
      return parseInt(stepMatch[2]);
    }

    const progressMatch = pageContent.match(/(\d+)\s*\/\s*(\d+)/);
    if (progressMatch) {
      return parseInt(progressMatch[2]);
    }

    return null;
  }
}

export default WorkdayStrategy;