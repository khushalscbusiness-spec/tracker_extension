// src/popup/popup.js
import { API_CLIENT } from '../api/client.js';

class Popup {
  constructor() {
    this.port = null;
    this.state = {
      job: null,
      status: null,
      session: null,
      authenticated: false,
      user: null
    };
    this.elements = {};

    // Interval that re-renders the elapsed time every second while a
    // session is active. Cleared when no session is present.
    this.elapsedTimer = null;

    this.initialize();
  }

  async initialize() {
    this.cacheElements();
    this.assertRequiredElements();
    this.setupEventListeners();
    await this.connectToBackground();
    await this.checkAuth();
    await this.getCurrentState();
    await this.refreshSessionStatus();
  }

  cacheElements() {
    this.elements = {
      loadingState: document.getElementById('loadingState'),
      noJobState: document.getElementById('noJobState'),
      jobDetectedState: document.getElementById('jobDetectedState'),
      loginState: document.getElementById('loginState'),

      jobTitle: document.getElementById('jobTitle'),
      jobCompany: document.getElementById('jobCompany'),
      jobLocation: document.getElementById('jobLocation'),
      jobPlatform: document.getElementById('jobPlatform'),

      sessionStatus: document.getElementById('sessionStatus'),
      sessionStateBadge: document.getElementById('sessionStateBadge'),
      sessionStep: document.getElementById('sessionStep'),
      sessionUrlCount: document.getElementById('sessionUrlCount'),
      sessionElapsed: document.getElementById('sessionElapsed'),

      logoutBtn: document.getElementById('logoutBtn'),
      errorMessage: document.getElementById('errorMessage'),

      loginForm: document.getElementById('loginForm'),
      emailInput: document.getElementById('emailInput'),
      passwordInput: document.getElementById('passwordInput'),
      loginBtn: document.getElementById('loginBtn'),
      loginError: document.getElementById('loginError'),

      dashboardLink: document.getElementById('dashboardLink'),
      signupLink: document.getElementById('signupLink')
    };
  }

  /**
   * Fail loudly if any element expected by the popup is missing.
   * Catches HTML/JS drift early in development.
   */
  assertRequiredElements() {
    const required = [
      'loginForm',
      'emailInput',
      'passwordInput',
      'loginBtn',
      'loginError'
    ];
    const missing = required.filter(key => !this.elements[key]);
    if (missing.length > 0) {
      console.error('[Popup] Missing required elements:', missing);
      throw new Error(`Popup HTML is missing: ${missing.join(', ')}`);
    }
  }

  setupEventListeners() {
    // Logout button
    this.elements.logoutBtn.addEventListener('click', () => {
      this.handleLogout();
    });

    // Login form
    this.elements.loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleLogin();
    });

    // Dashboard link
    this.elements.dashboardLink.addEventListener('click', (e) => {
      e.preventDefault();
      this.openDashboard();
    });

    // Signup link
    this.elements.signupLink.addEventListener('click', (e) => {
      e.preventDefault();
      this.openSignup();
    });
  }

  async connectToBackground() {
    try {
      this.port = chrome.runtime.connect({ name: 'popup' });

      this.port.onMessage.addListener((message) => {
        this.handlePortMessage(message);
      });

      this.port.onDisconnect.addListener(() => {
        console.log('[Popup] Disconnected from background');
        this.port = null;
      });
    } catch (error) {
      console.warn('[Popup] Could not connect to background:', error.message);
      this.port = null;
    }
  }

  handlePortMessage(message) {
    switch (message.type) {
      case 'STATE_UPDATE':
        this.updateState(message.state);
        break;

      case 'SESSION_UPDATE':
        this.updateSession(message.session);
        break;

      case 'LOGIN_SUCCESS':
        this.handleLoginSuccess();
        break;

      case 'LOGIN_ERROR':
        this.handleLoginError(message.error);
        break;

      case 'LOGOUT_SUCCESS':
        this.handleLogoutSuccess();
        break;
    }
  }

  /**
   * Check auth state.
   *
   * This method trusts chrome.storage.local, NOT the service worker.
   * The SW can be asleep or cold-starting, in which case the
   * chrome.runtime.sendMessage round-trip silently fails. The popup
   * should still show the correct auth state in that case.
   *
   * A token in storage that is not expired locally is treated as
   * authenticated. The SW is asked for user info as a best-effort
   * enrichment; failures are ignored.
   */
  async checkAuth() {
    const result = await chrome.storage.local.get('access_token');
    const token = result.access_token;

    if (!token) {
      this.state.authenticated = false;
      return;
    }

    if (!this.isTokenValid(token)) {
      console.log('[Popup] Token expired locally, clearing');
      await chrome.storage.local.remove('access_token');
      this.state.authenticated = false;
      return;
    }

    // Trust the token — we're authenticated.
    this.state.authenticated = true;
    this.elements.logoutBtn.style.display = 'block';

    // Best-effort: ask the SW for user info. Ignore failures.
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH' });
      if (response?.user) {
        this.state.user = response.user;
      }
    } catch (error) {
      console.log('[Popup] SW user fetch skipped:', error.message);
    }
  }

  /**
   * Decode a JWT's exp claim and check it against the current time.
   * Returns true if the token is present, has no exp, or has not yet
   * expired. Returns false if it's expired or unparseable.
   *
   * This is used only as a UX hint — the server is still authoritative
   * via 401 responses.
   */
  isTokenValid(token) {
    if (!token) return false;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return false;
      const payload = JSON.parse(atob(parts[1]));
      if (!payload.exp) return true;
      return Date.now() < payload.exp * 1000;
    } catch (e) {
      console.warn('[Popup] Could not decode token:', e.message);
      return false;
    }
  }

  async getCurrentState() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
      if (response?.state) {
        this.updateState(response.state);
      }
    } catch (error) {
      console.error('[Popup] Get state error:', error);
    }
  }

  /**
   * Ask the service worker for the session associated with the
   * currently-active tab. The SW falls back to the most recent
   * active session if the tab isn't mapped to one.
   */
  async refreshSessionStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        this.updateSession(null);
        return;
      }

      const response = await chrome.runtime.sendMessage({
        type: 'GET_SESSION_FOR_TAB',
        tabId: tab.id
      });

      this.updateSession(response?.session || null);
    } catch (error) {
      console.error('[Popup] Refresh session error:', error);
      this.updateSession(null);
    }
  }

  updateState(state) {
    if (state) {
      this.state.job = state.job || null;
      this.state.status = state.status || null;
    }
    this.render();
  }

  updateSession(session) {
    this.state.session = session || null;
    this.renderSessionStatus();
  }

  render() {
    // Check authentication first
    if (!this.state.authenticated) {
      this.showLogin();
      return;
    }

    // Show appropriate state
    if (this.state.job) {
      this.showJobDetected();
    } else {
      this.showNoJob();
    }
  }

  showLogin() {
    this.hideAllStates();
    this.elements.loginState.style.display = 'flex';
    this.elements.logoutBtn.style.display = 'none';

    // Reset login button to a clean state
    if (this.elements.loginBtn) {
      this.elements.loginBtn.disabled = false;
      this.elements.loginBtn.textContent = 'Sign In';
    }
    if (this.elements.loginError) {
      this.elements.loginError.style.display = 'none';
    }
  }

  showLoading() {
    this.hideAllStates();
    this.elements.loadingState.style.display = 'flex';
  }

  showNoJob() {
    this.hideAllStates();
    this.elements.noJobState.style.display = 'flex';
  }

  showJobDetected() {
    this.hideAllStates();
    this.elements.jobDetectedState.style.display = 'flex';

    // Populate job details
    const job = this.state.job;
    this.elements.jobTitle.textContent = job.title || 'Untitled';
    this.elements.jobCompany.textContent = job.company || 'Unknown Company';
    this.elements.jobLocation.textContent = job.location || 'Location not specified';
    this.elements.jobPlatform.textContent = job.platform?.toUpperCase() || 'UNKNOWN';

    this.elements.errorMessage.style.display = 'none';
    this.elements.logoutBtn.style.display = 'block';

    // Session status (read-only)
    this.renderSessionStatus();
  }

  hideAllStates() {
    this.elements.loadingState.style.display = 'none';
    this.elements.noJobState.style.display = 'none';
    this.elements.jobDetectedState.style.display = 'none';
    this.elements.loginState.style.display = 'none';
  }

  /**
   * Render the read-only session block.
   *
   * Shows:
   *   - State badge ("Tracking", "Redirecting", "Submitted", ...)
   *   - Last detected step
   *   - Number of URLs in the visit chain
   *   - Elapsed time since the session started
   *
   * If there's no active session, hides the block.
   */
  renderSessionStatus() {
    const session = this.state.session;

    if (!session || !this.elements.sessionStatus) {
      if (this.elements.sessionStatus) {
        this.elements.sessionStatus.style.display = 'none';
      }
      this.stopElapsedTimer();
      return;
    }

    this.elements.sessionStatus.style.display = 'block';

    // Map internal status → display label
    const labels = {
      initiated: 'Initiated',
      redirecting: 'Redirecting',
      in_progress: 'In progress',
      submitted: 'Submitted',
      abandoned: 'Abandoned'
    };
    this.elements.sessionStateBadge.textContent =
      labels[session.status] || session.status || 'Unknown';

    // Step
    this.elements.sessionStep.textContent = session.stepLabel || '—';

    // URL count
    this.elements.sessionUrlCount.textContent = String(session.urlCount || 0);

    // Elapsed time
    this.renderElapsed(session);

    // Keep the elapsed label ticking while the session is active
    if (session.status !== 'submitted' && session.status !== 'abandoned') {
      this.startElapsedTimer();
    } else {
      this.stopElapsedTimer();
    }
  }

  renderElapsed(session) {
    if (!session || typeof session.elapsedMs !== 'number') {
      this.elements.sessionElapsed.textContent = '0s';
      return;
    }

    // Recompute locally so the timer can tick without re-querying
    const startedAt = Date.now() - session.elapsedMs;
    const diffMs = Date.now() - startedAt;
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) {
      this.elements.sessionElapsed.textContent = `${diffSec}s`;
    } else {
      const mins = Math.floor(diffSec / 60);
      const secs = diffSec % 60;
      this.elements.sessionElapsed.textContent = `${mins}m ${secs}s`;
    }
  }

  startElapsedTimer() {
    if (this.elapsedTimer) return;

    this.elapsedTimer = setInterval(() => {
      const session = this.state.session;
      if (!session || session.status === 'submitted' || session.status === 'abandoned') {
        this.stopElapsedTimer();
        return;
      }

      // Bump elapsedMs locally so renderElapsed keeps counting
      session.elapsedMs = (session.elapsedMs || 0) + 1000;
      this.renderElapsed(session);
    }, 1000);
  }

  stopElapsedTimer() {
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
  }

  async handleLogin() {
    const email = this.elements.emailInput.value.trim();
    const password = this.elements.passwordInput.value.trim();

    // Clear the DOM immediately after reading. The password lives only
    // in the local variable and the port message from here on.
    this.elements.passwordInput.value = '';

    if (!email || !password) {
      this.showLoginError('Please enter both email and password');
      return;
    }

    this.elements.loginBtn.disabled = true;
    this.elements.loginBtn.textContent = 'Signing in...';
    this.elements.loginError.style.display = 'none';

    if (!this.port) {
      this.showLoginError('Not connected to background. Please reload.');
      this.elements.loginBtn.disabled = false;
      this.elements.loginBtn.textContent = 'Sign In';
      return;
    }

    this.port.postMessage({
      type: 'LOGIN',
      email,
      password
    });
  }

  handleLoginSuccess() {
    this.state.authenticated = true;
    this.elements.loginBtn.disabled = false;
    this.elements.loginBtn.textContent = 'Sign In';
    this.elements.loginError.style.display = 'none';
    this.elements.logoutBtn.style.display = 'block';
    this.getCurrentState();
    this.refreshSessionStatus();
  }

  handleLoginError(error) {
    this.elements.loginBtn.disabled = false;
    this.elements.loginBtn.textContent = 'Sign In';
    this.showLoginError(error || 'Invalid credentials');
  }

  showLoginError(message) {
    this.elements.loginError.textContent = message;
    this.elements.loginError.style.display = 'block';
  }

  /**
   * Log out.
   *
   * Clears storage directly — do not depend on the SW being alive.
   * Also notifies the SW (best-effort) so it can clean up in-memory
   * state if it's running.
   */
  async handleLogout() {
    // 1. Clear storage — authoritative source of auth state
    try {
      await chrome.storage.local.remove(['access_token', 'access_token_expires_at']);
    } catch (e) {
      console.warn('[Popup] Could not clear token from storage:', e);
    }

    // 2. Best-effort: tell the SW (its port message handler will also
    //    clear apiClient's in-memory token).
    try {
      if (this.port) {
        this.port.postMessage({ type: 'LOGOUT' });
      }
    } catch (e) {
      console.warn('[Popup] Could not notify SW of logout:', e);
    }

    // 3. Update UI immediately, don't wait for the SW
    this.handleLogoutSuccess();
  }

  handleLogoutSuccess() {
    this.state.authenticated = false;
    this.state.user = null;
    this.state.job = null;
    this.state.status = null;
    this.state.session = null;
    this.elements.logoutBtn.style.display = 'none';
    this.stopElapsedTimer();
    this.showLogin();
  }

  showError(message) {
    this.elements.errorMessage.textContent = message;
    this.elements.errorMessage.style.display = 'block';
  }

  openDashboard() {
    // Open the Layer 3 frontend dashboard
    chrome.tabs.create({ url: 'http://localhost:3000/applications' });
  }

  openSignup() {
    // Open the Layer 3 frontend signup page
    chrome.tabs.create({ url: 'http://localhost:3000/signup' });
  }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  const popup = new Popup();
});