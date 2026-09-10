// src/content/detectors/linkedin-detector.js

import { BaseDetector } from './base-detector.js';

export class LinkedInDetector extends BaseDetector {
  constructor() {
    super();
    this.platform = 'linkedin';
    this.platformName = 'LinkedIn';

    this.selectors = {
      detail: {
        title: [
          '.job-title',
          '[data-job-title]',
          '.top-card-layout__title',
          '.jobs-details-top-card__job-title',
          'h1.job-title',
          'h1[data-test-job-title]'
        ],
        company: [
          '.job-details-top-card__company-info',
          '.top-card-layout__company-name',
          '[data-company-name]',
          '.jobs-details-top-card__company-name',
          '.company-name',
          '[data-test-job-company-name]'
        ],
        location: [
          '.job-details-top-card__location',
          '.top-card-layout__location',
          '[data-job-location]',
          '.jobs-details-top-card__location',
          '[data-test-job-location]'
        ],
        description: [
          '.job-description',
          '.jobs-details__description',
          '[data-test-job-description]'
        ],
        postedDate: [
          '.posted-date',
          '.jobs-details-top-card__posted-date',
          '[data-test-posted-date]'
        ],
        employmentType: [
          '.employment-type',
          '.job-details-top-card__workplace-type'
        ],
        // Apply button selectors based on actual LinkedIn HTML
        applyButton: [
          'a[href*="safety/go?url="]',  // External apply links
          'a[aria-label*="Apply on company website"]',
          '.jobs-apply-button',
          '[data-test-apply-button]',
          'a[href*="apply"]',
          'button[class*="apply"]'
        ],
        easyApplyButton: [
          '.jobs-apply-button--easy-apply',
          '[data-test-easy-apply-button]',
          '.easy-apply-button',
          'button[aria-label*="Easy Apply"]'
        ]
      },
      search: {
        title: [
          '.job-card-container__link',
          '.job-card-list__title',
          '.base-search-card__title',
          '.job-title',
          'h3',
          'a[href*="/jobs/view/"]'
        ],
        company: [
          '.job-card-container__company-name',
          '.base-search-card__subtitle',
          '.job-card-container__subtitle',
          '[class*="company-name"]',
          'span[class*="subtitle"]'
        ],
        location: [
          '.job-card-container__location',
          '.base-search-card__metadata',
          '.job-card-container__metadata-item',
          '[class*="location"]',
          'span[class*="metadata"]'
        ]
      }
    };
  }

  // ============================================
  // MAIN DETECTION
  // ============================================

  async detect() {
    const isSearchPage = window.location.href.includes('/search-results/');
    console.log(`[${this.platform}] ${isSearchPage ? 'Search' : 'Detail'} page detected`);
    return super.detect();
  }

  async waitForPageReady() {
    const isSearchPage = window.location.href.includes('/search-results/');
    if (isSearchPage) {
      const jobId = this.getJobIdFromUrl();
      if (jobId) {
        const selector = `a[href*="/jobs/view/${jobId}/"]`;
        await this.waitForElement([selector], 5000);
      }
    } else {
      await this.waitForElement(this.selectors.detail.title, 5000);
    }
    await this.sleep(300);
  }

  // ============================================
  // EXTRACTION METHODS
  // ============================================

  async extractTitle() {
    const isSearchPage = window.location.href.includes('/search-results/');

    if (isSearchPage) {
      const jobId = this.getJobIdFromUrl();
      if (jobId) {
        const link = document.querySelector(`a[href*="/jobs/view/${jobId}/"]`);
        if (link) {
          const title = link.textContent.trim();
          if (title && !title.includes('notification')) {
            return title;
          }
        }
      }
      const title = this.findElement(this.selectors.search.title);
      if (title && !title.includes('notification')) {
        return title;
      }
    } else {
      const title = this.findElement(this.selectors.detail.title);
      if (title) return title;
    }

    const h1 = document.querySelector('h1, h2');
    if (h1) {
      const text = h1.textContent.trim();
      if (text && !text.includes('notification')) {
        return text;
      }
    }

    return null;
  }

  async extractCompany() {
    const isSearchPage = window.location.href.includes('/search-results/');

    if (isSearchPage) {
      const jobId = this.getJobIdFromUrl();
      if (jobId) {
        const link = document.querySelector(`a[href*="/jobs/view/${jobId}/"]`);
        if (link) {
          const title = link.textContent.trim();

          // Method 1: Look in parent elements for company
          let parent = link.parentElement;
          let level = 0;
          while (parent && level < 5) {
            const parentText = parent.textContent;
            if (parentText.includes(title) && parentText.length > title.length + 2) {
              const titleIndex = parentText.indexOf(title);
              if (titleIndex > 0) {
                const beforeTitle = parentText.substring(0, titleIndex).trim();
                if (beforeTitle && beforeTitle.length > 0 && beforeTitle.length < 80) {
                  const cleaned = beforeTitle.replace(/[·, \n]/g, '').trim();
                  if (cleaned && !cleaned.match(/\d/) && !cleaned.includes('notification')) {
                    console.log(`[LinkedIn] Found company at level ${level}:`, cleaned);
                    return cleaned;
                  }
                }
              }
            }
            parent = parent.parentElement;
            level++;
          }

          // Method 2: Look for patterns in the text
          const card = link.closest('div[class*="card"], li, div[class*="item"]');
          if (card) {
            const cardText = card.textContent;
            const pattern = /([A-Z][a-zA-Z0-9\s&.,-]+?)(Senior|Lead|Principal|Staff|Engineer|Developer|Manager|Architect|Analyst|Specialist|Consultant)/i;
            const match = cardText.match(pattern);
            if (match && match[1]) {
              const cleaned = match[1].trim();
              if (cleaned.length > 1 && cleaned.length < 80 && !cleaned.match(/\d/)) {
                console.log('[LinkedIn] Found company via pattern:', cleaned);
                return cleaned;
              }
            }
          }
        }
      }
    } else {
      const company = this.findElement(this.selectors.detail.company);
      if (company) return company;
    }

    return null;
  }

  async extractLocation() {
    const isSearchPage = window.location.href.includes('/search-results/');

    if (isSearchPage) {
      const jobId = this.getJobIdFromUrl();
      if (jobId) {
        const link = document.querySelector(`a[href*="/jobs/view/${jobId}/"]`);
        if (link) {
          const card = link.closest('div[class*="card"], li, div[class*="item"]');
          if (card) {
            const location = this.findElement(this.selectors.search.location, card);
            if (location) return location;

            const cardText = card.textContent;
            const locationPattern = /([A-Z][a-zA-Z\s]+[,·]\s*[A-Z][a-zA-Z\s]+)/;
            const match = cardText.match(locationPattern);
            if (match) {
              return match[1].trim();
            }
          }
        }
      }
    } else {
      const location = this.findElement(this.selectors.detail.location);
      if (location) return location;
    }

    return null;
  }

  async extractJobId() {
    const jobId = this.getJobIdFromUrl();
    if (jobId) return jobId;
    const element = document.querySelector('[data-job-id]');
    if (element) {
      const id = element.getAttribute('data-job-id');
      if (id) return id;
    }
    const link = document.querySelector('a[href*="/jobs/view/"]');
    if (link) {
      const match = link.href.match(/\/jobs\/view\/(\d+)/);
      if (match) return match[1];
    }
    return null;
  }

  getJobIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const currentJobId = urlParams.get('currentJobId');
    if (currentJobId) return currentJobId;
    const urlMatch = window.location.href.match(/\/jobs\/view\/(\d+)/);
    if (urlMatch) return urlMatch[1];
    return null;
  }

  // ============================================
  // APPLY TYPE DETECTION
  // ============================================

  /**
   * Detect if job uses Easy Apply or external redirect
   * @returns {Object} Apply type and URL
   */
  detectApplyType() {
    const isSearchPage = window.location.href.includes('/search-results/');

    if (isSearchPage) {
      return this.detectApplyTypeFromSearch();
    } else {
      return this.detectApplyTypeFromDetail();
    }
  }

  /**
   * Detect apply type from search results page
   */
  detectApplyTypeFromSearch() {
    console.log('[LinkedIn] Detecting apply type from search...');

    const result = {
      type: 'unknown',
      url: null,
      isEasyApply: false,
      isExternal: false,
      source: null
    };

    const jobId = this.getJobIdFromUrl();
    if (!jobId) {
      console.log('[LinkedIn] No job ID found');
      return result;
    }

    // Get the page text content once
    const pageText = document.body.textContent || '';

    // 1. Check for Easy Apply (anywhere on page)
    if (pageText.includes('Easy Apply')) {
      result.type = 'easy-apply';
      result.isEasyApply = true;
      console.log('[LinkedIn] ✅ Easy Apply detected from search');
      return result;
    }

    // 2. Check for external ATS sources (Lever, Greenhouse, Workday, etc.)
    const sourcePatterns = {
      'lever': /lever/i,
      'greenhouse': /greenhouse/i,
      'workday': /workday/i,
      'ashby': /ashby/i,
      'recruiter': /recruiter\.linkedin\.com/i
    };

    for (const [source, pattern] of Object.entries(sourcePatterns)) {
      if (pattern.test(pageText)) {
        result.type = 'external';
        result.isExternal = true;
        result.source = source;
        console.log(`[LinkedIn] ✅ External source detected from search: ${source}`);
        return result;
      }
    }

    // 3. Check for "LinkedIn Apply" text - this is the default apply
    if (pageText.includes('LinkedIn Apply')) {
      result.type = 'unknown';
      console.log('[LinkedIn] Standard LinkedIn Apply detected');
      return result;
    }

    console.log('[LinkedIn] No apply information found on search page');
    return result;
  }

  /**
   * Detect apply type from job detail page
   */
  detectApplyTypeFromDetail() {
    console.log('[LinkedIn] Detecting apply type from detail...');

    const result = {
      type: 'unknown',
      url: null,
      isEasyApply: false,
      isExternal: false,
      source: null
    };

    const pageText = document.body.textContent || '';

    // 1. Check for Easy Apply button (using improved selectors)
    for (const selector of this.selectors.detail.easyApplyButton) {
      const button = document.querySelector(selector);
      if (button) {
        result.type = 'easy-apply';
        result.isEasyApply = true;
        console.log('[LinkedIn] ✅ Easy Apply detected');
        return result;
      }
    }

    // 2. Check for Easy Apply text
    if (pageText.includes('Easy Apply')) {
      result.type = 'easy-apply';
      result.isEasyApply = true;
      console.log('[LinkedIn] ✅ Easy Apply detected from text');
      return result;
    }

    // 3. Check for external apply button
    for (const selector of this.selectors.detail.applyButton) {
      const button = document.querySelector(selector);
      if (button) {
        const text = button.textContent?.toLowerCase() || '';
        const href = button.href || '';
        const ariaLabel = button.getAttribute('aria-label') || '';

        // Check if it's an external apply
        if (text.includes('apply') || ariaLabel.includes('Apply')) {
          result.type = 'external';
          result.isExternal = true;

          // Get the URL
          if (href) {
            result.url = href;
            result.source = this.detectSourceFromUrl(href);
            console.log(`[LinkedIn] ✅ External apply detected: ${href}`);
          } else if (ariaLabel.includes('Apply on company website')) {
            // External apply with safety redirect
            result.type = 'external';
            result.isExternal = true;
            result.url = href || 'external-apply';
            result.source = 'company-website';
            console.log('[LinkedIn] ✅ External apply (company website) detected');
          }
          return result;
        }
      }
    }

    // 4. Check for external source indicators
    const sourcePatterns = {
      'greenhouse': /greenhouse/i,
      'lever': /lever/i,
      'workday': /workday/i,
      'ashby': /ashby/i,
      'recruiter': /recruiter\.linkedin\.com/i
    };

    for (const [source, pattern] of Object.entries(sourcePatterns)) {
      if (pattern.test(pageText)) {
        result.type = 'external';
        result.isExternal = true;
        result.source = source;
        console.log(`[LinkedIn] ✅ External source detected: ${source}`);
        return result;
      }
    }

    // 5. Check for "Apply on company website" text
    if (pageText.includes('Apply on company website')) {
      result.type = 'external';
      result.isExternal = true;
      result.source = 'company-website';
      console.log('[LinkedIn] ✅ "Apply on company website" detected');

      // Try to find the actual URL
      const applyLink = document.querySelector('a[aria-label*="Apply on company website"]');
      if (applyLink && applyLink.href) {
        result.url = applyLink.href;
      }
      return result;
    }

    // 6. Check for any apply button/link
    const applySelectors = [
      '.jobs-apply-button',
      '[data-test-apply-button]',
      '.apply-button',
      'a[data-test-apply-button]'
    ];

    for (const selector of applySelectors) {
      const button = document.querySelector(selector);
      if (button) {
        const buttonText = button.textContent?.toLowerCase() || '';
        const href = button.href || '';

        if (buttonText.includes('apply') && !buttonText.includes('easy')) {
          result.type = 'external';
          result.isExternal = true;
          if (href) {
            result.url = href;
            result.source = this.detectSourceFromUrl(href);
          }
          console.log('[LinkedIn] ✅ External apply detected:', href);
          return result;
        }
      }
    }

    console.log('[LinkedIn] No apply information found on detail page');
    return result;
  }

  /**
   * Detect the ATS source from URL
   */
  detectSourceFromUrl(url) {
    if (!url) return null;

    const patterns = {
      'greenhouse': /greenhouse\.io/,
      'lever': /lever\.co/,
      'workday': /myworkdayjobs\.com|workday\.com/,
      'ashby': /ashby\.com/,
      'recruiter': /recruiter\.linkedin\.com/,
      'linkedin-apply': /apply\.linkedin\.com/
    };

    for (const [source, pattern] of Object.entries(patterns)) {
      if (pattern.test(url)) {
        return source;
      }
    }

    // Try to extract domain
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '').split('.')[0];
      if (domain && domain.length > 2) {
        return domain;
      }
    } catch (e) {
      // Invalid URL
    }

    return 'company-website';
  }

  /**
   * Get the actual application URL (if external)
   */
  getApplicationUrl() {
    const applyType = this.detectApplyType();

    if (applyType.isEasyApply) {
      return {
        type: 'easy-apply',
        url: `https://www.linkedin.com/jobs/view/${this.getJobIdFromUrl()}/apply/`,
        isEasyApply: true
      };
    }

    if (applyType.isExternal && applyType.url) {
      return {
        type: 'external',
        url: applyType.url,
        source: applyType.source,
        isExternal: true
      };
    }

    return {
      type: 'unknown',
      url: null,
      isEasyApply: false,
      isExternal: false
    };
  }

  /**
   * Get the application type as a user-friendly string
   */
  getApplyTypeDisplay() {
    const applyType = this.detectApplyType();
    if (applyType.isEasyApply) return 'Easy Apply';
    if (applyType.isExternal) {
      const source = applyType.source || 'External';
      const displayName = source.charAt(0).toUpperCase() + source.slice(1).replace('-', ' ');
      return `Apply via ${displayName}`;
    }
    return 'Apply';
  }

  // ============================================
  // EXTRA FIELDS
  // ============================================

  async extractExtraFields() {
    const isSearchPage = window.location.href.includes('/search-results/');
    const extra = {};

    // Basic fields for detail page
    if (!isSearchPage) {
      const description = this.findElement(this.selectors.detail.description);
      if (description) extra.description = description;
      const postedDate = this.findElement(this.selectors.detail.postedDate);
      if (postedDate) extra.postedDate = postedDate;
      const employmentType = this.findElement(this.selectors.detail.employmentType);
      if (employmentType) extra.employmentType = employmentType;
      const title = await this.extractTitle();
      if (title) {
        const levelMatch = title.match(/\b(Senior|Lead|Principal|Staff|Junior|Entry|Mid)\b/i);
        if (levelMatch) extra.experienceLevel = levelMatch[1];
      }
    } else {
      // For search results, try to get apply info from the card
      const jobId = this.getJobIdFromUrl();
      if (jobId) {
        const jobLink = document.querySelector(`a[href*="/jobs/view/${jobId}/"]`);
        if (jobLink) {
          let card = jobLink.closest('li, div[class*="search-result"], div[class*="job-card"]');
          if (card) {
            const cardText = card.textContent;
            // Try to find if it's Easy Apply
            if (cardText.includes('Easy Apply')) {
              extra.isEasyApply = true;
              extra.applyType = 'easy-apply';
              extra.applyTypeDisplay = 'Easy Apply';
            }
            // Try to find external source
            const sourcePatterns = {
              'greenhouse': /greenhouse\.io/i,
              'lever': /lever\.co/i,
              'workday': /workday/i,
              'ashby': /ashby/i
            };
            for (const [source, pattern] of Object.entries(sourcePatterns)) {
              if (pattern.test(cardText)) {
                extra.applyType = 'external';
                extra.isExternal = true;
                extra.applySource = source;
                extra.applyTypeDisplay = `Apply via ${source.charAt(0).toUpperCase() + source.slice(1)}`;
                break;
              }
            }
          }
        }
      }
    }

    // Add apply type detection for all pages
    const applyType = this.detectApplyType();
    extra.applyType = extra.applyType || applyType.type;
    extra.isEasyApply = extra.isEasyApply || applyType.isEasyApply;
    extra.isExternal = extra.isExternal || applyType.isExternal;
    extra.applyUrl = extra.applyUrl || applyType.url || null;
    extra.applySource = extra.applySource || applyType.source || null;
    extra.applyTypeDisplay = extra.applyTypeDisplay || this.getApplyTypeDisplay();

    return extra;
  }

  // ============================================
  // VALIDATION
  // ============================================

  validateJob(job) {
    if (!job) return false;
    const isSearchPage = window.location.href.includes('/search-results/');
    if (isSearchPage) {
      if (!job.title || job.title.length < 2) return false;
      if (!job.url || !job.url.startsWith('http')) return false;
      if (!job.platform) return false;
      return true;
    }
    if (!job.title || job.title.length < 2) return false;
    if (!job.company || job.company.length < 1) return false;
    if (!job.url || !job.url.startsWith('http')) return false;
    if (!job.platform) return false;
    return true;
  }

  // ============================================
  // NORMALIZATION
  // ============================================

  normalizeJob(job) {
    const normalized = super.normalizeJob(job);

    // Add apply type fields
    normalized.applyType = job.applyType || 'unknown';
    normalized.isEasyApply = job.isEasyApply || false;
    normalized.isExternal = job.isExternal || false;
    normalized.applyUrl = job.applyUrl || null;
    normalized.applySource = job.applySource || null;
    normalized.applyTypeDisplay = job.applyTypeDisplay || 'Apply';

    return normalized;
  }
}