// src/content/detectors/generic-detector.js

import { BaseDetector } from './base-detector.js';

/**
 * @typedef {Object} PostalAddress
 * @property {string} [addressLocality] - City
 * @property {string} [addressRegion] - State/Region
 * @property {string} [addressCountry] - Country
 * @property {string} [streetAddress] - Street
 * @property {string} [postalCode] - ZIP/Postal code
 */

export class GenericDetector extends BaseDetector {
  constructor() {
    super();
    this.platform = 'generic';
    this.platformName = 'Career Page';
    this.selectors = {
      title: ['h1', '.job-title', '.title', '[data-job-title]', '.position-title'],
      company: ['.company', '.company-name', '[data-company]', '.employer'],
      location: ['.location', '[data-location]', '.job-location'],
      description: ['.job-description', '.description']
    };
  }

  async detect() {
    try {
      const jsonLd = this.extractJSONLD();
      if (jsonLd && jsonLd['@type'] === 'JobPosting') {
        return this.parseJSONLD(jsonLd);
      }
      return await super.detect();
    } catch (error) {
      console.error('[Generic Detector] Error:', error);
      return null;
    }
  }

  extractJSONLD() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data['@type'] === 'JobPosting') return data;
        if (data['@graph']) {
          for (const item of data['@graph']) {
            if (item['@type'] === 'JobPosting') return item;
          }
        }
      } catch (e) {}
    }
    return null;
  }

  parseJSONLD(data) {
    const job = {
      title: data.title || data.name,
      company: this.extractCompanyFromJSONLD(data),
      location: this.extractLocationFromJSONLD(data),
      url: data.url || data.applyUrl || window.location.href,
      platform: this.platform,
      externalJobId: data.identifier || data.externalId || null
    };
    if (data.description) job.description = data.description;
    if (data.datePosted) job.postedDate = data.datePosted;
    if (data.employmentType) job.employmentType = data.employmentType;
    if (data.baseSalary) {
      if (data.baseSalary.value) {
        job.salaryMin = data.baseSalary.value;
        job.salaryCurrency = data.baseSalary.currency || 'USD';
      }
    }
    return job;
  }

  extractCompanyFromJSONLD(data) {
    if (data.hiringOrganization) {
      if (typeof data.hiringOrganization === 'string') return data.hiringOrganization;
      if (data.hiringOrganization.name) return data.hiringOrganization.name;
    }
    if (data.employer) {
      if (typeof data.employer === 'string') return data.employer;
      if (data.employer.name) return data.employer.name;
    }
    return null;
  }

  extractLocationFromJSONLD(data) {
    if (data.jobLocation) {
      if (typeof data.jobLocation === 'string') return data.jobLocation;
      if (data.jobLocation.address) {
        if (typeof data.jobLocation.address === 'string') return data.jobLocation.address;

        /** @type {PostalAddress} */
        const address = data.jobLocation.address;
        const parts = [
          address.addressLocality,
          address.addressRegion,
          address.addressCountry
        ].filter(Boolean);

        if (parts.length > 0) {
          return parts.join(', ');
        }
      }
    }
    if (data.location) return data.location;
    return null;
  }

  async extractTitle() {
    return this.findElement(this.selectors.title);
  }

  async extractCompany() {
    return this.findElement(this.selectors.company);
  }

  async extractLocation() {
    try {
      // ============================================
      // STRATEGY 1: Selector Scan (expanded list)
      // ============================================
      const selectors = [
        // Common patterns
        '.location',
        '[data-location]',
        '.job-location',
        '[class*="location"]',
        '[class*="Location"]',
        '[itemprop="jobLocation"]',
        '[itemprop="address"]',

        // Job detail containers
        '[class*="job-detail"] [class*="location"]',
        '[class*="job-details"] [class*="location"]',
        '[class*="job-info"] [class*="location"]',
        '[class*="job-meta"] [class*="location"]',

        // RippleHire specific
        '.job-detail-location',
        '.job-location-info',
        '.candidate-job-location',

        // Workday specific
        '[data-automation-id="locations"]',
        '[data-automation-id="location"]',

        // Greenhouse specific
        '.job__location',
        '.location.location',

        // Lever specific
        '.posting-categories .location',
        '.sort-by-time.posting-category.location',

        // Generic
        'address',
        '[class*="city"]',
        '[class*="region"]'
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          const text = (element.textContent || '').trim();
          if (this.isValidLocation(text)) {
            console.log(`[GenericDetector] Location found via selector "${selector}":`, text);
            return text;
          }
        }
      }

      // ============================================
      // STRATEGY 2: Label-based extraction
      // ============================================
      const pageText = document.body?.innerText || '';
      const labelPatterns = [
        /Location:\s*([^\n]+)/i,
        /City:\s*([^\n]+)/i,
        /Location\s*[-–]\s*([^\n]+)/i,
        /Based in:\s*([^\n]+)/i,
        /Work Location:\s*([^\n]+)/i
      ];

      for (const pattern of labelPatterns) {
        const match = pageText.match(pattern);
        if (match && match[1]) {
          const location = (match[1] || '').trim();
          if (this.isValidLocation(location)) {
            console.log(`[GenericDetector] Location found via label:`, location);
            return location;
          }
        }
      }

      // ============================================
      // STRATEGY 3: City name detection
      // ============================================
      const cities = [
        'Bangalore', 'Bengaluru', 'Mumbai', 'Delhi', 'New Delhi',
        'Hyderabad', 'Chennai', 'Pune', 'Noida', 'Gurgaon', 'Gurugram',
        'Kolkata', 'Ahmedabad', 'Jaipur', 'Kochi', 'Indore',
        'San Francisco', 'New York', 'Seattle', 'Austin', 'Boston',
        'London', 'Berlin', 'Paris', 'Amsterdam', 'Dublin', 'Toronto',
        'Singapore', 'Sydney', 'Tokyo', 'Dubai', 'Remote'
      ];

      for (const city of cities) {
        const cityRegex = new RegExp(`\\b${city}\\b`, 'i');
        if (cityRegex.test(pageText)) {
          console.log(`[GenericDetector] Location found via city:`, city);
          return city;
        }
      }

      // ============================================
      // STRATEGY 4: JSON-LD structured data
      // ============================================
      const jsonLd = this.extractJSONLD();
      if (jsonLd && jsonLd.jobLocation) {
        const loc = jsonLd.jobLocation;
        if (typeof loc === 'string') {
          return loc;
        }
        if (loc.address) {
          /** @type {PostalAddress} */
          const address = loc.address;
          const parts = [
            address.addressLocality,
            address.addressRegion,
            address.addressCountry
          ].filter(Boolean);

          if (parts.length > 0) {
            const location = parts.join(', ');
            console.log(`[GenericDetector] Location found via JSON-LD:`, location);
            return location;
          }
        }
      }

      // ============================================
      // STRATEGY 5: Meta tag fallback
      // ============================================
      const metaSelectors = [
        'meta[property="og:location"]',
        'meta[name="location"]',
        'meta[name="geo.placename"]'
      ];

      for (const selector of metaSelectors) {
        const meta = document.querySelector(selector);
        if (meta) {
          const content = meta.getAttribute('content');
          if (content && this.isValidLocation(content)) {
            console.log(`[GenericDetector] Location found via meta:`, content);
            return content;
          }
        }
      }

      console.log('[GenericDetector] No location found');
      return null;

    } catch (error) {
      console.warn('[GenericDetector] Error extracting location:', error);
      return null;
    }
  }

  /**
   * Check if a string is a valid location
   * @param {string} text - Text to validate
   * @returns {boolean} True if valid location
   */
  isValidLocation(text) {
    if (!text || typeof text !== 'string') return false;

    const trimmed = text.trim();

    // Too short or too long
    if (trimmed.length < 2 || trimmed.length > 100) return false;

    // Contains only special characters
    if (!/[a-zA-Z]/.test(trimmed)) return false;

    // Looks like a URL
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return false;

    // Looks like a phone number
    if (/^\+?\d[\d\s\-()]{7,}$/.test(trimmed)) return false;

    // Looks like an email
    if (/@/.test(trimmed)) return false;

    // Contains "Apply" or "Job" as primary text (likely wrong element)
    const lowerText = trimmed.toLowerCase();
    if (lowerText === 'apply' || lowerText === 'apply now') return false;
    if (lowerText === 'job' || lowerText === 'jobs') return false;

    // Looks like a date
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed)) return false;

    return true;
  }

  async extractJobId() {
    const element = document.querySelector('[data-job-id], [data-id]');
    if (element) {
      return element.getAttribute('data-job-id') || element.getAttribute('data-id');
    }
    return null;
  }

  async extractExtraFields() {
    const extra = {};
    const description = this.findElement(this.selectors.description);
    if (description) extra.description = description;
    return extra;
  }
}