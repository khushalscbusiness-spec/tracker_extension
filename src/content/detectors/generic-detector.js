// src/content/detectors/generic-detector.js

import { BaseDetector } from './base-detector.js';

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
        if (data.jobLocation.address.addressLocality) {
          const parts = [];
          if (data.jobLocation.address.addressLocality) parts.push(data.jobLocation.address.addressLocality);
          if (data.jobLocation.address.addressRegion) parts.push(data.jobLocation.address.addressRegion);
          if (data.jobLocation.address.addressCountry) parts.push(data.jobLocation.address.addressCountry);
          return parts.join(', ');
        }
      }
    }
    if (data.location) return data.location;
    return null;
  }

  async extractTitle() { return this.findElement(this.selectors.title); }
  async extractCompany() { return this.findElement(this.selectors.company); }
  async extractLocation() { return this.findElement(this.selectors.location); }

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