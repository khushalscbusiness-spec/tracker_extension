// src/content/detectors/base-detector.js

/**
 * Abstract Base Detector
 * Defines the contract for all platform-specific detectors
 */
export class BaseDetector {
  constructor() {
    this.platform = null;
    this.platformName = null;
    this.currentJob = null;
    this.isDetecting = false;
  }

  async detect() {
    if (this.isDetecting) {
      console.log(`[${this.platform}] Already detecting, skipping...`);
      return null;
    }

    this.isDetecting = true;

    try {
      await this.waitForPageReady();
      const job = await this.extractJob();

      if (!this.validateJob(job)) {
        console.log(`[${this.platform}] Job validation failed`);
        return null;
      }

      const normalizedJob = this.normalizeJob(job);
      this.currentJob = normalizedJob;
      return normalizedJob;

    } catch (error) {
      console.error(`[${this.platform}] Detection error:`, error);
      return null;
    } finally {
      this.isDetecting = false;
    }
  }

  async extractJob() {
    const job = {
      title: await this.extractTitle(),
      company: await this.extractCompany(),
      location: await this.extractLocation(),
      url: this.getCurrentUrl(),
      platform: this.platform,
      externalJobId: await this.extractJobId(),
    };

    const extra = await this.extractExtraFields();
    if (extra) {
      Object.assign(job, extra);
    }

    return job;
  }

  // Abstract methods - must be implemented by subclasses
  async extractTitle() { throw new Error('extractTitle() must be implemented'); }
  async extractCompany() { throw new Error('extractCompany() must be implemented'); }
  async extractLocation() { throw new Error('extractLocation() must be implemented'); }
  async extractJobId() { throw new Error('extractJobId() must be implemented'); }
  async extractExtraFields() { return null; }

  // Helper methods - can be overridden
  async waitForPageReady() {
    if (document.readyState !== 'complete') {
      await new Promise((resolve) => {
        window.addEventListener('load', resolve, { once: true });
      });
    }
    await this.sleep(500);
  }

  getCurrentUrl() { return window.location.href; }

  validateJob(job) {
    if (!job) return false;
    if (!job.title || job.title.length < 2) return false;
    if (!job.company || job.company.length < 1) return false;
    if (!job.url || !job.url.startsWith('http')) return false;
    if (!job.platform) return false;
    return true;
  }

  normalizeJob(job) {
    return {
      title: this.normalizeTitle(job.title),
      company: this.normalizeCompany(job.company),
      location: this.normalizeLocation(job.location),
      url: this.normalizeUrl(job.url),
      platform: job.platform,
      externalJobId: job.externalJobId || null,
      description: job.description || null,
      employmentType: job.employmentType || null,
      experienceLevel: job.experienceLevel || null,
      remoteType: job.remoteType || null,
      postedDate: job.postedDate || null,
      salaryMin: job.salaryMin || null,
      salaryMax: job.salaryMax || null,
      salaryCurrency: job.salaryCurrency || null,
      companyUrl: job.companyUrl || null,
      applyUrl: job.applyUrl || null,
    };
  }

  normalizeTitle(title) {
    if (!title) return '';
    return title.trim()
      .replace(/\s*[-|:]\s*(Junior|Senior|Lead|Principal|Staff|Engineer|Developer|Manager)\s*$/i, '')
      .replace(/\s*\([^)]*\)\s*$/, '')
      .replace(/\s*[$£€][\d,.]+\s*[-–]\s*[$£€][\d,.]+/, '')
      .replace(/\s*[$£€][\d,.]+[kK]\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  normalizeCompany(company) {
    if (!company) return '';
    return company.trim()
      .replace(/\b(Inc|LLC|Ltd|Limited|Corp|Corporation|Technologies|Tech|Systems|Solutions|Group|Holdings|International)\b\.?$/i, '')
      .replace(/[.,]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  normalizeLocation(location) {
    if (!location) return '';
    return location.trim()
      .replace(/\b(Remote|On-site|Hybrid|Work from Home|WFH)\b/gi, '')
      .replace(/\b(USA|US|UK|IND|India|USA)\b/gi, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*,\s*/g, ', ')
      .trim();
  }

  normalizeUrl(url) {
    if (!url) return '';
    try {
      const urlObj = new URL(url);
      const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'source', 'si', 'tracking', 'eBP', 'trackingId'];
      trackingParams.forEach(param => urlObj.searchParams.delete(param));
      let normalized = urlObj.toString();
      normalized = normalized.replace(/\/$/, '');
      return normalized;
    } catch (e) {
      return url;
    }
  }

  sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  findElement(selectors, context = document) {
    for (const selector of selectors) {
      const element = context.querySelector(selector);
      if (element) {
        const text = element.textContent.trim();
        if (text) return text;
      }
    }
    return null;
  }

  async waitForElement(selectors, timeout = 5000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) return element;
      }
      await this.sleep(100);
    }
    return null;
  }

  cleanText(text) {
    if (!text) return '';
    return text.replace(/[\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
  }
}