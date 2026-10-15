// src/content/bundle.js
// Entry point for the content script

import { detectorFactory } from './detectors/detector-factory.js';


// ============================================
// JOB PAGE GUARD
// ============================================

function isJobPage() {
  try {
    const url = window.location.href.toLowerCase();
    const text = (document.body?.innerText || '').toLowerCase();

    // 1. URL SIGNALS
    const urlPatterns = [
      'gh_jid=', 'gh_src=',
      '/careers/', '/careers',
      '/jobs/', '/jobs',
      '/job/', '/job-apply',
      '/positions/', '/position/',
      '/apply',
      'greenhouse.io', 'lever.co', 'myworkdayjobs.com', 'workday.com',
      'ashbyhq.com', 'smartrecruiters.com', 'icims.com', 'bamboohr.com',
      'taleo.net', 'deel.com', 'comeet.com',
      'linkedin.com/jobs', 'naukri.com/job'
    ];

    if (urlPatterns.some(p => url.includes(p))) {
      return true;
    }

    // 2. DOM SIGNALS
    const titleSelectors = [
      'h1', '[class*="job-title"]', '[class*="position-title"]',
      '[itemprop="title"]', '[data-job-title]'
    ];
    const hasTitle = titleSelectors.some(s => document.querySelector(s));

    const companySelectors = [
      '[class*="company"]', '[class*="employer"]',
      '[itemprop="hiringOrganization"]', '[data-company]'
    ];
    const hasCompany = companySelectors.some(s => document.querySelector(s));

    const applySelectors = [
      'button[class*="apply"]', 'a[class*="apply"]',
      '[data-test-apply-button]', 'a[href*="apply"]',
      'button[aria-label*="Apply"]', 'a[aria-label*="Apply"]'
    ];
    const hasApply = applySelectors.some(s => document.querySelector(s));

    const structuralSignals = [hasTitle, hasCompany, hasApply].filter(Boolean).length;
    if (structuralSignals >= 2) {
      return true;
    }

    // 3. TEXT SIGNALS
    const textSignals = [
      'apply for this job', 'apply now', 'submit application',
      'job description', 'responsibilities', 'qualifications', 'we are looking for'
    ];

    if (textSignals.some(s => text.includes(s))) {
      return true;
    }

    return false;
  } catch (error) {
    return false;
  }
}


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
    this.lastAttachedJobId = null;
    this.applyButtonElement = null;
    this.applyButtonListener = null;
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

        // Apply Button Detection & Click Tracking
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
  // APPLY BUTTON DETECTION & CLICK TRACKING
  // ============================================

  setupApplyButtonDetection() {
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

    // Skip only if we've already attached for THIS job.
    if (this.applyButtonListenerAttached && this.lastAttachedJobId === jobId) {
      console.log('[JobPulse] Apply button listener already attached for job:', jobId);
      return;
    }

    // Remove the previous listener from the previous button, if any.
    // Without this, listeners accumulate across SPA navigations and
    // one click fires N times (once per visited job).
    if (this.applyButtonElement && this.applyButtonListener) {
      this.applyButtonElement.removeEventListener('click', this.applyButtonListener);
      console.log('[JobPulse] Removed previous apply button listener');
    }
    this.applyButtonElement = null;
    this.applyButtonListener = null;

    console.log('[JobPulse] Setting up apply button detection for job:', jobId);

    const button = this.findApplyButtonElement();
    if (!button) {
      console.log('[JobPulse] No apply button found on this page');
      return;
    }

    // ── Classification comes from the detector (single source of truth) ──
    // LinkedIn detector sets job.applyType = 'easy-apply' | 'external'
    const isOnSiteApply = job.applyType === 'easy-apply';
    const hostBoard = job.platform || 'unknown';
    const applyTypeDisplay = isOnSiteApply ? 'On-Site Apply' : 'External Redirect';

    // Attempt to extract an external URL if this is an external apply
    let applyUrl = button.href || null;
    if (applyUrl && applyUrl.includes('safety/go?url=')) {
      // LinkedIn wraps external links — unwrap to the real destination
      try {
        const urlParams = new URLSearchParams(applyUrl.split('?')[1]);
        const encoded = urlParams.get('url');
        if (encoded) applyUrl = decodeURIComponent(encoded);
      } catch (e) {
        // Leave applyUrl as-is
      }
    }

    this.applyButtonListenerAttached = true;
    this.lastAttachedJobId = jobId;
    console.log(`[JobPulse] Found Button Type: ${applyTypeDisplay}`);
    console.log(`[JobPulse]   isOnSiteApply: ${isOnSiteApply}`);
    console.log(`[JobPulse]   hostBoard: ${hostBoard}`);

    // Store the listener so we can remove it next time.
    this.applyButtonListener = (event) => {
      console.log('========================================');
      console.log(`[JobPulse] USER CLICKED on: ${applyTypeDisplay}`);
      console.log(`[JobPulse]   jobId: ${jobId}`);
      console.log(`[JobPulse]   applyUrl: ${applyUrl || '(none)'}`);
      console.log('========================================');

      try {
        chrome.runtime.sendMessage({
          type: 'APPLY_BUTTON_CLICKED',
          payload: {
            applyType: isOnSiteApply ? 'on_site_apply' : 'external_redirect',
            isOnSiteApply,
            hostBoard,
            timestamp: Date.now(),
            job: this.currentJob,
            applyUrl,
            applySource: isOnSiteApply ? hostBoard : null
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[JobPulse] Send apply click error:', chrome.runtime.lastError);
          }
        });
      } catch (e) {
        console.warn('[JobPulse] Could not send apply click to background:', e);
      }

      // ── On-site apply modal watcher ────────────────────────
      if (isOnSiteApply) {
        console.log('[JobPulse] Starting on-site apply modal watcher...');
        this.watchEasyApplyModal();
      }
    };

    this.applyButtonElement = button;
    button.addEventListener('click', this.applyButtonListener);
  }

    /**
   * Watch for LinkedIn's Easy Apply success state.
   *
   * Easy Apply never changes the URL and never opens a new tab —
   * everything happens inside a modal. We detect success by
   * watching the page text for LinkedIn's confirmation phrases.
   *
   * On detection, we send SUCCESS_DETECTED to the service worker
   * (the same message the external ATS flow uses), which routes
   * it to the session → SubmittedState → payload → Layer 2.
   */
  watchEasyApplyModal() {
    if (this.easyApplyObserver) {
      this.easyApplyObserver.disconnect();
    }

    // Phrases LinkedIn shows after an Easy Apply succeeds.
    // Confirmed by DOM inspection: "your application was sent"
    // is the primary phrase. Others are fallbacks.
    const successPhrases = [
      'your application was sent',
      'application sent',
      'application submitted',
      'your application has been submitted',
      'we received your application',
      'successfully applied'
    ];

    let detected = false;

    const checkForSuccess = () => {
      if (detected) return;

      // Prefer the modal if present — success text appears there
      let text = '';
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog) {
        text = (dialog.innerText || '').toLowerCase();
      } else {
        // Fallback to page text
        text = (document.body.innerText || '').toLowerCase();
      }

      if (!text) return;

      // Also filter out obvious job-description text — we don't
      // want to trigger on a JD that happens to mention these words.
      if (text.includes('responsibilities:') ||
          text.includes('qualifications:') ||
          text.includes('we are looking for')) {
        return;
      }

      for (const phrase of successPhrases) {
        if (text.includes(phrase)) {
          detected = true;
          console.log('========================================');
          console.log('[JobPulse] 🎉 Easy Apply SUCCESS detected!');
          console.log('[JobPulse]   phrase:', phrase);
          console.log('[JobPulse]   url:', window.location.href);
          console.log('========================================');

          try {
            chrome.runtime.sendMessage({
              type: 'SUCCESS_DETECTED',
              payload: {
                url: window.location.href,
                phrase: phrase,
                pageTitle: document.title,
                isIframe: false,
                detectionMethod: 'easy_apply_modal',
                detectedAt: Date.now()
              }
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.warn('[JobPulse] Send success error:', chrome.runtime.lastError);
              } else {
                console.log('[JobPulse] ✅ Success sent to background');
              }
            });
          } catch (e) {
            console.warn('[JobPulse] Could not send success to background:', e);
          }

          if (this.easyApplyObserver) {
            this.easyApplyObserver.disconnect();
            this.easyApplyObserver = null;
          }
          if (this.easyApplyInterval) {
            clearInterval(this.easyApplyInterval);
            this.easyApplyInterval = null;
          }
          return;
        }
      }
    };

    // 1. Watch DOM mutations (fast reaction)
    this.easyApplyObserver = new MutationObserver(() => {
      checkForSuccess();
    });
    this.easyApplyObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // 2. Poll every 2 seconds (backup — some modals don't fire mutations)
    this.easyApplyInterval = setInterval(checkForSuccess, 2000);

    // 3. Immediate first check
    checkForSuccess();

    // 4. Safety cleanup after 10 minutes
    setTimeout(() => {
      if (this.easyApplyObserver) {
        this.easyApplyObserver.disconnect();
        this.easyApplyObserver = null;
      }
      if (this.easyApplyInterval) {
        clearInterval(this.easyApplyInterval);
        this.easyApplyInterval = null;
      }
    }, 10 * 60 * 1000);
  }

  findApplyButtonElement() {
      // ── 1. Class-based selectors (fast path, usually dead now) ──
      // LinkedIn has hashed most class names, so these rarely match.
      // Kept as a fast path in case any readable classes come back.
      const classSelectors = [
        '.jobs-apply-button',
        '[data-test-apply-button]',
        '.jobs-apply-button--easy-apply',
        '[data-test-easy-apply-button]',
        '.easy-apply-button'
      ];

      for (const selector of classSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          console.log('[JobPulse] Found apply button with selector:', selector);
          return el;
        }
      }

      // ── 2. Text / aria matching ──────────────────────────────
      // LinkedIn's current UI uses hashed CSS classes, so we match
      // by accessible name instead.
      //
      // IMPORTANT: restrict to actual clickable elements. The
      // search-results page is full of DIVs whose innerText includes
      // "Apply" (each job card), which would otherwise match.
      const clickable = document.querySelectorAll('button, a, [role="button"]');

      // Priority 1: aria-label exactly "Easy Apply to this job"
      for (const el of clickable) {
        const aria = (el.getAttribute('aria-label') || '').trim();
        if (aria === 'Easy Apply to this job') {
          console.log('[JobPulse] Found apply button via aria-label:', aria);
          return el;
        }
      }

      // Priority 2: aria-label starts with "Easy Apply"
      for (const el of clickable) {
        const aria = (el.getAttribute('aria-label') || '').trim();
        if (aria.toLowerCase().startsWith('easy apply')) {
          console.log('[JobPulse] Found apply button via aria-label prefix:', aria);
          return el;
        }
      }

      // Priority 3: exact visible text "Easy Apply"
      for (const el of clickable) {
        const text = (el.textContent || '').trim();
        if (text === 'Easy Apply') {
          console.log('[JobPulse] Found apply button via exact text:', text);
          return el;
        }
      }

      // Priority 4: aria/text for external apply
      for (const el of clickable) {
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        const text = (el.textContent || '').trim().toLowerCase();
        if (aria.includes('apply on company website') ||
            aria.includes('apply externally') ||
            text === 'apply') {
          console.log('[JobPulse] Found external apply button via:', aria || text);
          return el;
        }
      }

      // Priority 5: text contains "Easy Apply" (not "Applied")
      for (const el of clickable) {
        const text = (el.textContent || '').trim().toLowerCase();
        if (text.includes('easy apply') && !text.includes('applied')) {
          console.log('[JobPulse] Found apply button via text contains:', text);
          return el;
        }
      }

      console.warn('[JobPulse] No apply button found via any strategy');
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
  // APPLY CLICK TRACKING (Sends to Background)
  // ============================================

  setupApplyClickTracking() {
    console.log('[JobPulse] Setting up apply click tracking...');

    const applyButton = document.querySelector('a[aria-label*="Apply on company website"]');

    if (applyButton) {
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

        document.body.dataset.jobpulseApply = JSON.stringify({
          jobId: this.currentJob?.externalJobId || 'unknown',
          jobTitle: this.currentJob?.title || 'unknown',
          company: this.currentJob?.company || 'unknown',
          redirectUrl: redirectUrl,
          applyUrl: applyButton.href,
          timestamp: new Date().toISOString()
        });

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
// SUCCESS DETECTOR (Content + Iframe)
// ============================================

/**
 * Success Detector
 *
 * Detects application success by:
 * 1. Reading page text for success phrases (works in modals, iframes)
 * 2. Checking iframe URL for confirmation paths
 * 3. Keyword-based detection (combines words like thank + apply)
 *
 * Runs in both main frame and ATS iframes (via manifest all_frames: true),
 * but bails out early in non-ATS iframes (ads, embeds, etc.) for performance.
 */
class SuccessDetector {
  constructor() {
    this.detected = false;
    this.observer = null;
    this.intervalId = null;
    this.isIframe = window !== window.top;

    // Performance guard: skip non-ATS iframes entirely.
    // Prevents 2-second polling loops running inside ads, embeds, tracking
    // pixels, videos, etc. on every page the user visits.
    if (this.isIframe && !this.isLikelyAtsFrame()) {
      console.log('[JobPulse] SuccessDetector: skipping non-ATS iframe');
      return;
    }

    this.startWatching();
  }

  /**
   * Check if this iframe is likely an ATS confirmation frame.
   * Uses the iframe's own URL. Cross-origin iframe hrefs are readable
   * from inside the frame itself.
   *
   * @returns {boolean}
   */
  isLikelyAtsFrame() {
    try {
      const href = (window.location.href || '').toLowerCase();

      const atsPatterns = [
        'greenhouse.io',
        'grnh.se',
        'lever.co',
        'myworkdayjobs.com',
        'workday.com',
        'ashbyhq.com',
        'ashby.com',
        'smartrecruiters.com',
        'icims.com',
        'bamboohr.com',
        'taleo.net',
        'deel.com',
        'ripplehire.com'
      ];

      return atsPatterns.some(p => href.includes(p));
    } catch (e) {
      // Sandboxed iframe without allow-same-origin — cannot read href
      return false;
    }
  }

  startWatching() {
    console.log(`[JobPulse] SuccessDetector starting (${this.isIframe ? 'iframe' : 'main frame'})`);
    console.log(`[JobPulse]   URL: ${window.location.href}`);

    // Watch for DOM changes
    this.observer = new MutationObserver(() => {
      if (this.detected) return;
      this.checkForSuccess();
    });

    if (document.body) {
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    // Check immediately
    this.checkForSuccess();

    // Check periodically (in case DOM is slow)
    this.intervalId = setInterval(() => {
      if (this.detected) {
        clearInterval(this.intervalId);
        return;
      }
      this.checkForSuccess();
    }, 2000);

    // Stop after 10 minutes (safety)
    setTimeout(() => {
      if (this.intervalId) clearInterval(this.intervalId);
      if (this.observer) this.observer.disconnect();
    }, 600000);
  }

  checkForSuccess() {
    if (this.detected) return;

    // ============================================
    // METHOD 1: Check iframe URL first (fastest)
    // ============================================
    if (this.isIframe) {
      const iframeUrl = window.location.href.toLowerCase();
      if (iframeUrl.includes('/confirmation') ||
          iframeUrl.includes('/thank-you') ||
          iframeUrl.includes('/success') ||
          iframeUrl.includes('/submitted')) {
        console.log(`[JobPulse] 🎉 Success detected via iframe URL: ${window.location.href}`);
        this.markAsDetected('iframe_url', 'Application confirmation page');
        return;
      }
    }

    // ============================================
    // METHOD 2: Keyword-based detection
    // ============================================
    const pageText = (document.body?.innerText || '').toLowerCase();
    const result = this.detectSuccessByKeywords(pageText);

    if (result.detected) {
      console.log(`[JobPulse] 🎉 Success detected via keywords: ${result.reason} (${this.isIframe ? 'iframe' : 'main frame'})`);
      this.markAsDetected('keywords', result.reason);
      return;
    }

    // ============================================
    // METHOD 3: Exact phrases (backup)
    // ============================================
    const successPhrases = [
      'thank you for applying',
      'thanks for applying',
      'your application has been received',
      'your application was successfully submitted',
      'application submitted successfully',
      'we have received your application',
      'you have successfully applied',
      'application received',
      'successfully applied',
      'application complete',
      'application has been submitted',
      'we will review your application'
    ];

    for (const phrase of successPhrases) {
      if (pageText.includes(phrase)) {
        console.log(`[JobPulse] 🎉 Success detected in text: "${phrase}" (${this.isIframe ? 'iframe' : 'main frame'})`);
        this.markAsDetected('content', phrase);
        return;
      }
    }
  }

  /**
   * Detect success by keyword combinations
   * @param {string} text - Page text (lowercase)
   * @returns {Object} { detected: boolean, reason: string }
   */
  detectSuccessByKeywords(text) {
    if (!text || text.length < 10) return { detected: false };
    if (text.length > 5000) return { detected: false };

    const jobDescSignals = [
      'responsibilities:',
      'requirements:',
      'qualifications:',
      'about the role',
      'what you\'ll do',
      'we are looking for',
      'job description'
    ];
    if (jobDescSignals.some(s => text.includes(s))) {
      return { detected: false };
    }

    // Rule 1: Thank + Action
    const thankWords = ['thank you', 'thanks for', 'thanks!', 'we appreciate'];
    const actionWords = [
      'applying', 'apply', 'application', 'submission',
      'submitting', 'submitted', 'cv', 'resume'
    ];

    const hasThank = thankWords.some(w => text.includes(w));
    const hasAction = actionWords.some(w => text.includes(w));

    if (hasThank && hasAction) {
      return { detected: true, reason: 'thank_you_apply' };
    }

    // Rule 2: Received + Application
    const receiveWords = ['received', 'recieved'];
    const appWords = ['application', 'submission', 'cv', 'resume'];

    const hasReceive = receiveWords.some(w => text.includes(w));
    const hasApp = appWords.some(w => text.includes(w));

    if (hasReceive && hasApp) {
      return { detected: true, reason: 'received_application' };
    }

    // Rule 3: Submitted + Success
    const submitWords = ['submitted', 'submission complete'];
    const successWords = ['successfully', 'complete', 'confirmed', 'confirmation'];

    const hasSubmit = submitWords.some(w => text.includes(w));
    const hasSuccess = successWords.some(w => text.includes(w));

    if (hasSubmit && hasSuccess) {
      return { detected: true, reason: 'submitted_successfully' };
    }

    // Rule 4: Strong single phrases (fallback)
    const strongPhrases = [
      'application submitted',
      'application received',
      'application complete',
      'successfully applied',
      'we have your application',
      'cv submitted',
      'resume submitted'
    ];

    for (const phrase of strongPhrases) {
      if (text.includes(phrase)) {
        return { detected: true, reason: phrase };
      }
    }

    return { detected: false };
  }

  markAsDetected(detectionMethod, phrase) {
    if (this.detected) return;
    this.detected = true;

    console.log(`[JobPulse] Success detection: method=${detectionMethod}, phrase="${phrase}"`);

    try {
      chrome.runtime.sendMessage({
        type: 'SUCCESS_DETECTED',
        payload: {
          phrase: phrase,
          url: window.location.href,
          pageTitle: document.title,
          isIframe: this.isIframe,
          detectionMethod: detectionMethod,
          detectedAt: Date.now()
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[JobPulse] Send success error:', chrome.runtime.lastError);
        } else {
          console.log('[JobPulse] ✅ Success sent to background');
        }
      });
    } catch (e) {
      console.warn('[JobPulse] Could not send success to background:', e);
    }

    if (this.observer) this.observer.disconnect();
    if (this.intervalId) clearInterval(this.intervalId);
  }
}

// ============================================
// INITIALIZE (with job page guard)
// ============================================

console.log('[JobPulse] Content script loaded on:', window.location.href);

if (isJobPage()) {
  console.log('[JobPulse] ✅ Job page detected, initializing...');

  const marker = document.createElement('meta');
  marker.name = 'jobpulse-injected';
  marker.content = 'true';
  document.head.appendChild(marker);

  const jobpulse = new JobPulse();

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

  // ============================================
  // INITIALIZE SUCCESS DETECTOR
  // ============================================

  try {
    const successDetector = new SuccessDetector();
    console.log('[JobPulse] SuccessDetector initialized');
  } catch (error) {
    console.error('[JobPulse] Failed to initialize SuccessDetector:', error);
  }

  console.log('[JobPulse] ✅ Ready!');
  console.log('[JobPulse] 📌 Commands:');
  console.log('[JobPulse]   📍 Get job: JSON.parse(document.body.dataset.jobpulseJob || "null")');
  console.log('[JobPulse]   📍 Get apply data: JSON.parse(document.body.dataset.jobpulseApply || "null")');
  console.log('[JobPulse]   📍 Force refresh: window.dispatchEvent(new CustomEvent("jobpulse-refresh"))');

} else {
  console.log('[JobPulse] Not a job page, exiting');
}