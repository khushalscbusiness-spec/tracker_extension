// src/content/detectors/naukri-detector.js

import { BaseDetector } from './base-detector.js';

export class NaukriDetector extends BaseDetector {
  constructor() {
    super();
    this.platform = 'naukri';
    this.platformName = 'Naukri';
    this.selectors = {
      title: ['.job-title', '.job-heading', '[data-job-title]', 'h1.job-title'],
      company: ['.company-name', '.job-company', '[data-company-name]', '.recruiter-name'],
      location: ['.location', '.job-location', '[data-job-location]', '.workplace-type'],
      description: ['.job-description', '.job-detail__description'],
      postedDate: ['.posted-date', '.job-detail__posted-date'],
      employmentType: ['.employment-type', '.job-type'],
      experience: ['.experience', '.job-detail__experience'],
      salary: ['.salary', '.job-detail__salary'],
      companyUrl: ['.company-website', '.company-url']
    };
  }

  async waitForPageReady() {
    await this.waitForElement(this.selectors.title, 5000);
    await this.sleep(300);
  }

  async extractTitle() { return this.findElement(this.selectors.title); }
  async extractCompany() { return this.findElement(this.selectors.company); }
  async extractLocation() { return this.findElement(this.selectors.location); }

  async extractJobId() {
    const urlMatch = window.location.href.match(/\/job-listings\/([^\/?]+)/);
    if (urlMatch) return urlMatch[1];
    const element = document.querySelector('[data-job-id]');
    if (element) {
      const id = element.getAttribute('data-job-id');
      if (id) return id;
    }
    return null;
  }

  async extractExtraFields() {
    const extra = {};
    const description = this.findElement(this.selectors.description);
    if (description) extra.description = description;
    const postedDate = this.findElement(this.selectors.postedDate);
    if (postedDate) extra.postedDate = postedDate;
    const employmentType = this.findElement(this.selectors.employmentType);
    if (employmentType) extra.employmentType = employmentType;
    const experience = this.findElement(this.selectors.experience);
    if (experience) extra.experienceLevel = experience;
    const salaryText = this.findElement(this.selectors.salary);
    if (salaryText) {
      const salaryMatch = salaryText.match(/([\d,.]+)\s*[-–]\s*([\d,.]+)/);
      if (salaryMatch) {
        extra.salaryMin = salaryMatch[1].replace(/,/g, '');
        extra.salaryMax = salaryMatch[2].replace(/,/g, '');
        extra.salaryCurrency = 'INR';
      }
    }
    const companyUrl = this.findElement(this.selectors.companyUrl);
    if (companyUrl) extra.companyUrl = companyUrl;
    return extra;
  }
}