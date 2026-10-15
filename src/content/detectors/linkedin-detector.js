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
  // PAGE TYPE DETECTION
  // ============================================

  /**
   * Whether the current LinkedIn page is a "list" page — a page that shows
   * a job card list with a details panel, rather than a standalone job page.
   *
   * Covers: /search-results/, /collections/, /recommended/, /similar/, /tracking/
   * All of these share the same DOM shape and the same `currentJobId` URL param.
   */
  isListPage() {
    const url = window.location.href;
    return (
      url.includes('/search-results/') ||
      url.includes('/collections/') ||
      url.includes('/recommended/') ||
      url.includes('/similar/') ||
      url.includes('/tracking/')
    );
  }

  /**
   * The detail panel — the right-hand column on list pages that shows
   * the selected job's full details, including a dedicated apply button.
   * Authoritative source for title, company, location on list pages.
   */
  getDetailPanel() {
    return document.querySelector(
      '.scaffold-layout__detail, .jobs-details, .jobs-search__job-details'
    );
  }

  // ============================================
  // MAIN DETECTION
  // ============================================

  async detect() {
    const isListPage = this.isListPage();
    console.log(`[${this.platform}] ${isListPage ? 'Search' : 'Detail'} page detected`);
    return super.detect();
  }

  async waitForPageReady() {
    const isListPage = this.isListPage();

    if (isListPage) {
      const jobId = this.getJobIdFromUrl();

      if (jobId) {
        // Wait for the job card link to exist — confirms the list rendered
        await this.waitForElement([`a[href*="/jobs/view/${jobId}/"]`], 5000);

        // Then wait for the detail panel's company element to have text.
        // LinkedIn creates these elements empty and fills them a tick later,
        // so we must wait for content, not just presence.
        await this.waitForElementWithText(
          [
            '.job-details-jobs-unified-top-card__company-name',
            '.jobs-unified-top-card__company-name'
          ],
          3000
        );
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
    const isListPage = this.isListPage();

    if (isListPage) {
      // Prefer the detail panel's dedicated title element
      const panel = this.getDetailPanel();
      const panelTitle = panel?.querySelector(
        '.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title'
      );
      if (panelTitle) {
        const text = (panelTitle.innerText || panelTitle.textContent || '').trim();
        if (text && !text.includes('notification')) {
          return text;
        }
      }

      // Fallback: the card's job link text
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
    const isListPage = this.isListPage();

    if (isListPage) {
      // Prefer the detail panel's dedicated company element
      const panel = this.getDetailPanel();
      const panelCompany = panel?.querySelector(
        '.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name'
      );
      if (panelCompany) {
        const text = (panelCompany.innerText || panelCompany.textContent || '').trim();
        if (text) {
          console.log('[LinkedIn] Found company via detail panel:', text);
          return text;
        }
      }

      // Fallback: card-scoped company element
      const jobId = this.getJobIdFromUrl();
      if (jobId) {
        const link = document.querySelector(`a[href*="/jobs/view/${jobId}/"]`);
        const card = link?.closest('li, div[class*="search-result"], div[class*="job-card"]');
        if (card) {
          const cardCompany = card.querySelector(
            '.job-card-container__company-name, .job-card-container__primary-description, .artdeco-entity-lockup__subtitle'
          );
          if (cardCompany) {
            const text = (cardCompany.innerText || cardCompany.textContent || '').trim();
            if (text) {
              console.log('[LinkedIn] Found company via card element:', text);
              return text;
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
    const isListPage = this.isListPage();

    if (isListPage) {
      // Prefer the detail panel's dedicated location element
      const panel = this.getDetailPanel();
      const panelLocation = panel?.querySelector(
        '.job-details-jobs-unified-top-card__primary-description-container, .job-details-jobs-unified-top-card__primary-description, .jobs-unified-top-card__primary-description'
      );
      if (panelLocation) {
        const raw = (panelLocation.innerText || panelLocation.textContent || '').trim();
        if (raw) {
          // Panel gives "Gurugram, Haryana, India · Reposted 1 day ago · Over 100 people..."
          // We only want the location part — up to the first "·"
          const cleaned = raw.split('·')[0].trim();
          if (cleaned) {
            console.log('[LinkedIn] Found location via detail panel:', cleaned);
            return cleaned;
          }
        }
      }

      // Fallback: card-scoped location element
      const jobId = this.getJobIdFromUrl();
      if (jobId) {
        const link = document.querySelector(`a[href*="/jobs/view/${jobId}/"]`);
        const card = link?.closest('li, div[class*="search-result"], div[class*="job-card"]');
        if (card) {
          const cardLocation = card.querySelector(
            '.job-card-container__metadata-item, .job-card-container__location, .artdeco-entity-lockup__caption'
          );
          if (cardLocation) {
            const text = (cardLocation.innerText || cardLocation.textContent || '').trim();
            if (text) {
              console.log('[LinkedIn] Found location via card element:', text);
              return text;
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
    const isListPage = this.isListPage();

    if (isListPage) {
      return this.detectApplyTypeFromSearch();
    } else {
      return this.detectApplyTypeFromDetail();
    }
  }

  /**
   * Detect apply type from list page
   */
  detectApplyTypeFromSearch() {
    console.log('[LinkedIn] Detecting apply type from list page...');

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

    // ── 1. Classify from the current job's apply button ──
    // The detail panel is authoritative. Its apply button's aria-label
    // tells us if the current job is Easy Apply or an external redirect.
    // We must NOT read page-wide text: search-list cards for OTHER jobs
    // contain "Easy Apply" and would poison the classification.
    const panel = this.getDetailPanel();

    const button =
      panel?.querySelector('.jobs-apply-button') ||
      document.querySelector('.jobs-apply-button');

    if (button) {
      const aria = (button.getAttribute('aria-label') || '').trim();
      const ariaLower = aria.toLowerCase();

      // On-site apply — LinkedIn labels the button "Easy Apply to <title>"
      if (ariaLower.startsWith('easy apply')) {
        result.type = 'easy-apply';
        result.isEasyApply = true;
        console.log('[LinkedIn] ✅ Easy Apply detected from apply button:', aria);
        return result;
      }

      // External apply — LinkedIn labels the button
      // "Apply to <title> on company website"
      if (ariaLower.includes('on company website') ||
          ariaLower.includes('apply externally')) {
        result.type = 'external';
        result.isExternal = true;

        // Try to find a redirect URL on the button or its container
        const href = button.href || button.closest('a')?.href || null;
        if (href) {
          result.url = href;
          result.source = this.detectSourceFromUrl(href);
        } else {
          result.source = 'company-website';
        }

        console.log('[LinkedIn] ✅ External apply detected from apply button:', aria);
        return result;
      }
    }

    // ── 2. Fallback: search inside the current job's card only ──
    const card = this.getCurrentJobCard();
    if (card) {
      const cardText = card.textContent || '';
      if (cardText.includes('Easy Apply')) {
        result.type = 'easy-apply';
        result.isEasyApply = true;
        console.log('[LinkedIn] ✅ Easy Apply detected from current job card');
        return result;
      }
    }

    console.log('[LinkedIn] No apply information found on list page');
    return result;
  }

  getCurrentJobCard() {
    const jobId = this.getJobIdFromUrl();
    if (!jobId) return null;
    const link = document.querySelector(`a[href*="/jobs/view/${jobId}/"]`);
    if (!link) return null;
    return link.closest('li, div[class*="search-result"], div[class*="job-card"], div[class*="scaffold-layout__list-item"]');
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
    const isListPage = this.isListPage();
    const extra = {};

    // Basic fields for detail page
    if (!isListPage) {
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
    const isListPage = this.isListPage();
    if (isListPage) {
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