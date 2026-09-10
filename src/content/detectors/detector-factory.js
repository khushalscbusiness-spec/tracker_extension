// src/content/detectors/detector-factory.js

import { LinkedInDetector } from './linkedin-detector.js';
import { NaukriDetector } from './naukri-detector.js';
import { GenericDetector } from './generic-detector.js';

export class DetectorFactory {
  constructor() {
    this.detectors = {
      linkedin: LinkedInDetector,
      naukri: NaukriDetector,
      greenhouse: null,
      lever: null,
      workday: null,
      generic: GenericDetector
    };
    this.instances = {};
  }

  getDetector(platform) {
    if (this.instances[platform]) {
      return this.instances[platform];
    }
    const DetectorClass = this.detectors[platform] || this.detectors.generic;
    if (!DetectorClass) {
      console.warn(`[DetectorFactory] No detector for platform: ${platform}`);
      return null;
    }
    const instance = new DetectorClass();
    this.instances[platform] = instance;
    return instance;
  }

  detectPlatform(url) {
    if (!url) return 'unknown';
    if (/linkedin\.com/.test(url) && (url.includes('/jobs/') || url.includes('/job/'))) return 'linkedin';
    if (/naukri\.com/.test(url) && (url.includes('/job') || url.includes('/jobs'))) return 'naukri';
    if (/boards\.greenhouse\.io/.test(url)) return 'greenhouse';
    if (/lever\.co/.test(url)) return 'lever';
    if (/myworkdayjobs\.com/.test(url)) return 'workday';
    if (url.includes('career') || url.includes('jobs') || url.includes('employment')) return 'generic';
    return 'unknown';
  }

  getDetectorForUrl(url) {
    const platform = this.detectPlatform(url);
    return this.getDetector(platform);
  }
}

export const detectorFactory = new DetectorFactory();