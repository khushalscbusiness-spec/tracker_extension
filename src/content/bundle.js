// src/content/bundle.js
// Entry point for the content script

import { detectorFactory } from './detectors/detector-factory.js';

// ============================================
// MAIN JOBPULSE CLASS
// ============================================

class JobPulse {
  constructor() {
    this.currentJob = null;
    this.detector = null;
    this.debounceTimer = null;
    this.isDetecting = false;
    this.lastUrl = window.location.href;
    this.applyButtonListenerAttached = false;
    this.init();
  }

  init() {
    console.log('[JobPulse] Initializing...');
    this.setupSPADetection();
    this.detect();
    this.addIndicator();
    this.setupConsoleHelper();
  }

  async detect() {
    if (this.isDetecting) {
      console.log('[JobPulse] Already detecting, skipping...');
      return;
    }

    this.isDetecting = true;
    console.log('[JobPulse] Detecting job...');

    try {
      const url = window.location.href;
      this.detector = detectorFactory.getDetectorForUrl(url);

      if (!this.detector) {
        console.log('[JobPulse] No detector available for this page');
        return;
      }

      const job = await this.detector.detect();

      if (job) {
        this.currentJob = job;
        console.log('[JobPulse] ✅ Job detected:', job);
        this.storeJob(job);
        this.exposeJobToPage(job);

        // ✅ Apply Button Detection & Click Tracking
        this.setupApplyButtonDetection();
        this.setupApplyClickTracking();

      } else {
        console.log('[JobPulse] No job detected on this page');
      }
    } catch (error) {
      console.error('[JobPulse] Detection error:', error);
    } finally {
      this.isDetecting = false;
    }
  }

  storeJob(job) {
    // Store in meta tag for debugging
    let meta = document.querySelector('meta[name="jobpulse-job"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'jobpulse-job';
      document.head.appendChild(meta);
    }
    meta.content = JSON.stringify(job);

    // Store in data attribute on indicator
    const indicator = document.getElementById('jobpulse-indicator');
    if (indicator) {
      indicator.dataset.job = JSON.stringify(job);
    }

    // Send to background
    try {
      chrome.runtime.sendMessage({
        type: 'JOB_DETECTED',
        payload: job
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[JobPulse] Send message error:', chrome.runtime.lastError);
        } else {
          console.log('[JobPulse] Job sent to background');
        }
      });
    } catch (e) {
      console.warn('[JobPulse] Could not send to background:', e);
    }
  }

  exposeJobToPage(job) {
    if (!job) return;

    console.log('[JobPulse] Exposing job to page via data attribute...');

    document.body.dataset.jobpulseJob = JSON.stringify(job);

    const event = new CustomEvent('jobpulse-job-update', {
      detail: { job: job }
    });
    window.dispatchEvent(event);

    console.log('[JobPulse] ✅ Job exposed via data attribute and custom event');
  }

  // ============================================
  // ✅ APPLY BUTTON DETECTION & CLICK TRACKING
  // ============================================

  setupApplyButtonDetection() {
    const currentUrl = window.location.href;
    if (currentUrl !== this.lastUrl) {
      this.lastUrl = currentUrl;
      this.applyButtonListenerAttached = false;
    }

    if (this.applyButtonListenerAttached) return;

    const job = this.currentJob;
    if (!job) {
      console.log('[JobPulse] No job detected yet, cannot setup apply button detection');
      return;
    }

    const jobId = job.externalJobId;
    if (!jobId) {
      console.log('[JobPulse] No job ID found in detected job');
      return;
    }

    console.log('[JobPulse] Setting up apply button detection for job:', jobId);

    let result = null;

    if (this.detector && typeof this.detector.detectApplyType === 'function') {
      const applyType = this.detector.detectApplyType();
      if (applyType && applyType.type !== 'unknown') {
        const button = this.findApplyButtonElement();
        if (button) {
          result = {
            type: applyType.isEasyApply ? 'Easy Apply' : 'External Redirect',
            element: button,
            url: applyType.url || null,
            source: applyType.source || null
          };
        }
      }
    }

    if (!result) {
      const button = this.findApplyButtonElement();
      if (button) {
        const buttonText = button.textContent?.toLowerCase() || '';
        const isEasyApply = buttonText.includes('easy') ||
                           button.className?.includes('easy') ||
                           button.closest('[data-test-easy-apply-button]');

        result = {
          type: isEasyApply ? 'Easy Apply' : 'External Redirect',
          element: button
        };
      }
    }

    if (result) {
      this.applyButtonListenerAttached = true;
      console.log(`[JobPulse] Found Button Type: ${result.type}`);

      result.element.addEventListener('click', (event) => {

        console.log(`[JobPulse] USER CLICKED on: ${result.type}`);

        try {
          chrome.runtime.sendMessage({
            type: 'APPLY_BUTTON_CLICKED',
            payload: {
              applyType: result.type,
              timestamp: Date.now(),
              job: this.currentJob,
              applyUrl: result.url || null,
              applySource: result.source || null
            }
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.warn('[JobPulse] Send apply click error:', chrome.runtime.lastError);
            }
          });
        } catch (e) {
          console.warn('[JobPulse] Could not send apply click to background:', e);
        }

        if (result.type === 'Easy Apply') {
          console.log('[JobPulse] Waiting for Easy Apply modal...');

          const modalObserver = new MutationObserver((mutations, obs) => {
            const modal = document.querySelector('div[role="dialog"], div[data-test-modal], iframe[title*="Apply"]');
            if (modal) {
              console.log('[JobPulse] ✅ Easy Apply Modal Detected');
              obs.disconnect();
            }
          });

          modalObserver.observe(document.body, { childList: true, subtree: true });
          setTimeout(() => modalObserver.disconnect(), 10000);
        } else if (result.type === 'External Redirect') {
          console.log('[JobPulse] External redirect initiated by user.');
        }

      }, { once: false });
    } else {
      console.log('[JobPulse] No apply button found on this page');
    }
  }

  findApplyButtonElement() {
    const selectors = [
      '.jobs-apply-button',
      '[data-test-apply-button]',
      '.apply-button',
      'a[data-test-apply-button]',
      'button[class*="apply"]',
      'a[class*="apply"]',
      '.jobs-apply-button--easy-apply',
      '[data-test-easy-apply-button]',
      '.easy-apply-button'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        console.log('[JobPulse] Found apply button with selector:', selector);
        return element;
      }
    }

    const allElements = document.querySelectorAll('button, a');
    for (const el of allElements) {
      const text = el.textContent?.toLowerCase() || '';
      if (text.includes('apply') && !text.includes('easy')) {
        const href = el.href || '';
        if (href.includes('apply') || href.includes('jobs') || el.closest('[class*="job"]')) {
          console.log('[JobPulse] Found apply button by text search');
          return el;
        }
      }
    }

    return null;
  }

  detectApplyButton() {
    const easyApplyBtn = document.querySelector('button[aria-label="LinkedIn Apply to this job"]');
    if (easyApplyBtn) {
      return { type: 'Easy Apply', element: easyApplyBtn };
    }

    const externalApplyBtn = document.querySelector(
      'button[aria-label*="Apply externally"], ' +
      'button[aria-label*="Apply on"], ' +
      'a[href*="apply"] svg[id="link-external-medium"], ' +
      'a[href*="job-apply-resources"] svg[id="link-external-medium"], ' +
      'a[href*="greenhouse"], ' +
      'a[href*="lever"], ' +
      'a[href*="workday"], ' +
      'a[href*="ashby"], ' +
      'span[class*="apply"], ' +
      'div[class*="job-card-container__apply"]'
    );

    if (externalApplyBtn) {
      const anchor = externalApplyBtn.closest('a') || externalApplyBtn;
      return { type: 'External Redirect', element: anchor };
    }

    const jobId = this.getJobIdFromUrl();
    if (jobId) {
      const jobLink = document.querySelector(`a[href*="/jobs/view/${jobId}/"]`);
      if (jobLink) {
        let card = jobLink.closest('li, div[class*="search-result"], div[class*="job-card"]');
        if (card) {
          const allElements = card.querySelectorAll('button, span, a, div');
          for (const el of allElements) {
            const text = el.innerText ? el.innerText.trim().toLowerCase() : '';
            if (text === 'apply' || text === 'apply now' || text === 'view job') {
              const href = el.href || el.closest('a')?.href;
              if (href && !href.includes('linkedin.com/jobs')) {
                return { type: 'External Redirect', element: el.closest('a') || el };
              }
            }
          }
        }
      }
    }

    const allButtons = document.querySelectorAll('button, a');
    for (const btn of allButtons) {
      const text = btn.innerText ? btn.innerText.trim().toLowerCase() : '';
      if (text === 'apply' || text === 'apply now' || text.includes('apply on')) {
        const type = btn.tagName.toLowerCase() === 'a' ? 'External Redirect' : 'Easy Apply';
        return { type: type, element: btn };
      }
    }

    return null;
  }

  // ============================================
  // ✅ APPLY CLICK TRACKING (Sends to Background)
  // ============================================

  setupApplyClickTracking() {
    console.log('[JobPulse] Setting up apply click tracking...');

    // Find the apply button using the specific selector that works
    const applyButton = document.querySelector('a[aria-label*="Apply on company website"]');

    if (applyButton) {
      // Prevent duplicate listeners
      if (applyButton.dataset.jobpulseTracked === 'true') {
        console.log('[JobPulse] Apply tracking already set up');
        return;
      }

      applyButton.dataset.jobpulseTracked = 'true';
      console.log('[JobPulse] ✅ Apply button found, adding listener');

      applyButton.addEventListener('click', (event) => {
        console.log('========================================');
        console.log('🔘 [JobPulse] APPLY BUTTON CLICKED!');
        console.log('========================================');
        console.log('  Href:', applyButton.href);
        console.log('  Text:', applyButton.textContent.trim());
        console.log('  Aria-label:', applyButton.getAttribute('aria-label'));

        // Extract actual redirect URL from LinkedIn's safety redirect
        const href = applyButton.href || '';
        let redirectUrl = null;
        if (href.includes('safety/go?url=')) {
          const urlParams = new URLSearchParams(href.split('?')[1]);
          const encodedUrl = urlParams.get('url');
          if (encodedUrl) {
            redirectUrl = decodeURIComponent(encodedUrl);
            console.log('  🔗 Redirecting to:', redirectUrl);
          }
        }

        console.log('  Job ID:', this.currentJob?.externalJobId || 'unknown');
        console.log('  Job Title:', this.currentJob?.title || 'unknown');
        console.log('  Company:', this.currentJob?.company || 'unknown');
        console.log('========================================');

        // Store in data attribute
        document.body.dataset.jobpulseApply = JSON.stringify({
          jobId: this.currentJob?.externalJobId || 'unknown',
          jobTitle: this.currentJob?.title || 'unknown',
          company: this.currentJob?.company || 'unknown',
          redirectUrl: redirectUrl,
          applyUrl: applyButton.href,
          timestamp: new Date().toISOString()
        });

        // ✅ Send to background for full tracking
        try {
          chrome.runtime.sendMessage({
            type: 'APPLY_CLICKED',
            payload: {
              job: this.currentJob,
              jobId: this.currentJob?.externalJobId || 'unknown',
              jobTitle: this.currentJob?.title || 'unknown',
              company: this.currentJob?.company || 'unknown',
              redirectUrl: redirectUrl,
              applyUrl: applyButton.href,
              timestamp: Date.now(),
              applyType: 'external'
            }
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.warn('[JobPulse] Send apply click error:', chrome.runtime.lastError);
            } else {
              console.log('[JobPulse] ✅ Apply click sent to background:', response);
            }
          });
        } catch (e) {
          console.warn('[JobPulse] Could not send apply click to background:', e);
        }

      }, true);
    } else {
      console.log('[JobPulse] ⚠️ No apply button found');
    }
  }

  // ============================================
  // CONSOLE HELPERS
  // ============================================

  setupConsoleHelper() {
    console.log('[JobPulse] Console helper available:');
    console.log('[JobPulse]   📌 Get job: JSON.parse(document.body.dataset.jobpulseJob || "null")');
    console.log('[JobPulse]   📌 Get apply data: JSON.parse(document.body.dataset.jobpulseApply || "null")');
  }

  setupSPADetection() {
    window.addEventListener('jobpulse-refresh', () => {
      console.log('[JobPulse] Refresh triggered from page');
      this.detect();
    });

    const observer = new MutationObserver(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== this.lastUrl) {
        this.lastUrl = currentUrl;
        this.debouncedDetect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false
    });

    window.addEventListener('popstate', () => this.debouncedDetect());

    const originalPushState = history.pushState;
    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      setTimeout(() => this.debouncedDetect(), 100);
    }.bind(this);

    const originalReplaceState = history.replaceState;
    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      setTimeout(() => this.debouncedDetect(), 100);
    }.bind(this);

    setInterval(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== this.lastUrl) {
        this.lastUrl = currentUrl;
        this.debouncedDetect();
      }
    }, 3000);
  }

  debouncedDetect() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.detect();
    }, 500);
  }

  addIndicator() {
    try {
      if (document.getElementById('jobpulse-indicator')) return;
      const indicator = document.createElement('div');
      indicator.id = 'jobpulse-indicator';
      indicator.style.cssText = `
        position: fixed; bottom: 10px; right: 10px;
        background: #2563eb; color: white;
        padding: 4px 8px; border-radius: 4px;
        font-size: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: 999999; opacity: 0.6; pointer-events: none;
        user-select: none; box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      `;
      indicator.textContent = '⚡ JobPulse';
      document.body.appendChild(indicator);
      console.log('[JobPulse] ✅ Indicator added');
    } catch (error) {
      console.warn('[JobPulse] Could not add indicator:', error);
    }
  }

  getCurrentJob() { return this.currentJob; }
  refresh() { this.detect(); }
}

// ============================================
// INITIALIZE
// ============================================

console.log('[JobPulse] Initializing content script...');

const marker = document.createElement('meta');
marker.name = 'jobpulse-injected';
marker.content = 'true';
document.head.appendChild(marker);

const jobpulse = new JobPulse();

// ============================================
// EXPOSE TO PAGE CONTEXT
// ============================================

const originalDetect = jobpulse.detect.bind(jobpulse);
jobpulse.detect = async function() {
  console.log('[JobPulse] Detecting (with page exposure)...');
  await originalDetect();
  if (this.currentJob) {
    document.body.dataset.jobpulseJob = JSON.stringify(this.currentJob);
    const indicator = document.getElementById('jobpulse-indicator');
    if (indicator) {
      indicator.dataset.job = JSON.stringify(this.currentJob);
    }
  }
};

const originalStoreJob = jobpulse.storeJob.bind(jobpulse);
jobpulse.storeJob = function(job) {
  originalStoreJob(job);
  document.body.dataset.jobpulseJob = JSON.stringify(job);
  const indicator = document.getElementById('jobpulse-indicator');
  if (indicator) {
    indicator.dataset.job = JSON.stringify(job);
  }
};

if (jobpulse.currentJob) {
  document.body.dataset.jobpulseJob = JSON.stringify(jobpulse.currentJob);
}

window.addEventListener('jobpulse-job-update', (event) => {
  if (event.detail && event.detail.job) {
    console.log('[JobPulse] Job update from page event:', event.detail.job);
    jobpulse.currentJob = event.detail.job;
    jobpulse.storeJob(event.detail.job);
  }
});

console.log('[JobPulse] ✅ Ready!');
console.log('[JobPulse] 📌 Commands:');
console.log('[JobPulse]   📍 Get job: JSON.parse(document.body.dataset.jobpulseJob || "null")');
console.log('[JobPulse]   📍 Get apply data: JSON.parse(document.body.dataset.jobpulseApply || "null")');
console.log('[JobPulse]   📍 Force refresh: window.dispatchEvent(new CustomEvent("jobpulse-refresh"))');