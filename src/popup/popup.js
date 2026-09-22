// src/popup/popup.js
import { API_CLIENT } from '../api/client.js';

class Popup {
  constructor() {
    this.port = null;
    this.state = {
      job: null,
      status: null,
      authenticated: false,
      user: null
    };
    this.elements = {};
    this.initialize();
  }

  async initialize() {
    this.cacheElements();
    this.assertRequiredElements();
    this.setupEventListeners();
    await this.connectToBackground();
    await this.checkAuth();
    await this.getCurrentState();
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

      trackBtn: document.getElementById('trackBtn'),
      logoutBtn: document.getElementById('logoutBtn'),

      trackedStatus: document.getElementById('trackedStatus'),
      applicationStatus: document.getElementById('applicationStatus'),
      trackedDate: document.getElementById('trackedDate'),

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
    // Track button
    this.elements.trackBtn.addEventListener('click', () => {
      this.handleTrackJob();
    });

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
    this.port = chrome.runtime.connect({ name: 'popup' });

    this.port.onMessage.addListener((message) => {
      this.handlePortMessage(message);
    });

    this.port.onDisconnect.addListener(() => {
      console.log('[Popup] Disconnected from background');
      this.showError('Connection lost. Please reload the extension.');
    });
  }

  handlePortMessage(message) {
    switch (message.type) {
      case 'STATE_UPDATE':
        this.updateState(message.state);
        break;

      case 'TRACK_RESULT':
        this.handleTrackResult(message);
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

  async checkAuth() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH' });
      this.state.authenticated = response?.authenticated || false;
      if (this.state.authenticated && response.user) {
        this.state.user = response.user;
        this.elements.logoutBtn.style.display = 'block';
      }
    } catch (error) {
      console.error('[Popup] Auth check error:', error);
      this.state.authenticated = false;
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

  updateState(state) {
    if (state) {
      this.state.job = state.job || null;
      this.state.status = state.status || null;
    }
    this.render();
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

    // Show tracked status if already tracked
    if (this.state.status?.tracked) {
      this.elements.trackedStatus.style.display = 'block';
      this.elements.applicationStatus.textContent = this.state.status.status || 'Saved';
      this.elements.trackedDate.textContent = this.formatDate(this.state.status.trackedAt);
      this.elements.trackBtn.textContent = '✓ Already Tracked';
      this.elements.trackBtn.disabled = true;
    } else {
      this.elements.trackedStatus.style.display = 'none';
      this.elements.trackBtn.textContent = '📌 Track Job';
      this.elements.trackBtn.disabled = false;
    }

    this.elements.errorMessage.style.display = 'none';
    this.elements.logoutBtn.style.display = 'block';
  }

  hideAllStates() {
    this.elements.loadingState.style.display = 'none';
    this.elements.noJobState.style.display = 'none';
    this.elements.jobDetectedState.style.display = 'none';
    this.elements.loginState.style.display = 'none';
  }

  handleTrackJob() {
    if (!this.state.job) return;

    this.elements.trackBtn.disabled = true;
    this.elements.trackBtn.textContent = 'Tracking...';
    this.elements.errorMessage.style.display = 'none';

    this.port.postMessage({
      type: 'TRACK_JOB',
      job: this.state.job
    });
  }

  handleTrackResult(result) {
    this.elements.trackBtn.disabled = false;

    if (result.success) {
      this.state.status = {
        tracked: true,
        duplicate: result.duplicate,
        jobId: result.id,
        status: 'Saved',
        trackedAt: new Date().toISOString()
      };

      this.elements.trackedStatus.style.display = 'block';
      this.elements.applicationStatus.textContent = 'Saved';
      this.elements.trackedDate.textContent = 'Just now';
      this.elements.trackBtn.textContent = '✓ Tracked';
      this.elements.trackBtn.disabled = true;
    } else {
      if (result.error === 'NOT_AUTHENTICATED') {
        this.showLogin();
      } else {
        this.showError(result.error || 'Failed to track job');
        this.elements.trackBtn.textContent = '📌 Try Again';
        this.elements.trackBtn.disabled = false;
      }
    }
  }

  async handleLogin() {
    const email = this.elements.emailInput.value.trim();
    const password = this.elements.passwordInput.value.trim();

    if (!email || !password) {
      this.showLoginError('Please enter both email and password');
      return;
    }

    this.elements.loginBtn.disabled = true;
    this.elements.loginBtn.textContent = 'Signing in...';
    this.elements.loginError.style.display = 'none';

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

  async handleLogout() {
    this.port.postMessage({ type: 'LOGOUT' });
  }

  handleLogoutSuccess() {
    this.state.authenticated = false;
    this.state.user = null;
    this.state.job = null;
    this.state.status = null;
    this.elements.logoutBtn.style.display = 'none';
    this.showLogin();
  }

  showError(message) {
    this.elements.errorMessage.textContent = message;
    this.elements.errorMessage.style.display = 'block';
  }

  formatDate(dateStr) {
    if (!dateStr) return 'Today';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} days ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  openDashboard() {
    // Open dashboard in new tab
    // Replace with actual dashboard URL
    chrome.tabs.create({ url: 'https://app.jobpulse.com/dashboard' });
  }

  openSignup() {
    // Open signup in new tab
    // Replace with actual signup URL
    chrome.tabs.create({ url: 'https://app.jobpulse.com/signup' });
  }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  const popup = new Popup();
});