// src/api/client.js
import { STORAGE } from '../utils/storage.js';
import { getApiUrl, getConfig } from '../config/config.js';

export class APIClient {
  constructor() {
    this.config = getConfig();
    this.baseURL = getApiUrl();
    this.token = null;
    this.initialize();
  }

  setBaseURL(url) {
    this.baseURL = url;
  }

  async initialize() {
    this.token = await STORAGE.get('access_token');
    const userConfig = await STORAGE.get('user_config');
    if (userConfig) {
      this.config = { ...this.config, ...userConfig };
      if (userConfig.API_URL) {
        this.baseURL = userConfig.API_URL;
      }
    }
  }

  setToken(token) {
    this.token = token;
  }

  isAuthenticated() {
    return !!this.token;
  }

  getHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const timeout = this.config.BACKEND_TIMEOUT || 30000;
    const retryAttempts = this.config.RETRY_ATTEMPTS || 3;

    let lastError;
    for (let attempt = 0; attempt < retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...options,
          headers: {
            ...this.getHeaders(),
            ...options.headers
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.detail || `HTTP ${response.status}: ${response.statusText}`);
        }

        return response.json();
      } catch (error) {
        lastError = error;
        if (attempt < retryAttempts - 1) {
          const delay = this.config.RETRY_DELAY || 1000;
          await new Promise(resolve => setTimeout(resolve, delay * (attempt + 1)));
        }
      }
    }

    throw lastError;
  }

  // ============================================
  // AUTHENTICATION
  // ============================================

  async login(email, password) {
    try {
      const response = await this.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      if (response.access_token) {
        this.setToken(response.access_token);
        await STORAGE.set('access_token', response.access_token);
        return response.access_token;
      }
      return null;
    } catch (error) {
      console.error('[API] Login error:', error);
      throw error;
    }
  }

  async logout() {
    await STORAGE.remove('access_token');
    this.setToken(null);
  }

  async getCurrentUser() {
    try {
      return await this.request('/auth/me');
    } catch (error) {
      console.error('[API] Get user error:', error);
      throw error;
    }
  }

  // ============================================
  // JOB TRACKING
  // ============================================

  async trackJob(job) {
    try {
      return await this.request('/jobs/track', {
        method: 'POST',
        body: JSON.stringify(job)
      });
    } catch (error) {
      console.error('[API] Track job error:', error);
      throw error;
    }
  }

  async checkJobStatus(job) {
    try {
      return await this.request('/jobs/status', {
        method: 'POST',
        body: JSON.stringify({
          url: job.url,
          fingerprint: job.fingerprint
        })
      });
    } catch (error) {
      console.error('[API] Check job status error:', error);
      throw error;
    }
  }

  async getTrackedJobs(page = 1, limit = 20) {
    try {
      return await this.request(`/jobs/tracked?page=${page}&limit=${limit}`);
    } catch (error) {
      console.error('[API] Get tracked jobs error:', error);
      throw error;
    }
  }

  // ============================================
  // ✅ APPLICATION TRACKING (NEW)
  // ============================================

  /**
   * Track a job application submission
   * @param {Object} payload - Application tracking payload
   * @returns {Promise<Object>} API response
   */
  async trackApplication(payload) {
    try {
      console.log('[API] Tracking application submission');
      return await this.request('/applications/track', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.error('[API] Track application error:', error);
      throw error;
    }
  }

  /**
   * Track apply button click
   * @param {Object} data - Apply click data
   * @returns {Promise<Object>} API response
   */
  async trackApplyClick(data) {
    try {
      return await this.request('/applications/apply-click', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    } catch (error) {
      console.error('[API] Track apply click error:', error);
      throw error;
    }
  }

  /**
   * Track external tab opened (redirect to ATS)
   * @param {string} url - External URL
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} API response
   */
  async trackExternalTabOpened(url, metadata = {}) {
    try {
      return await this.request('/applications/external-tab', {
        method: 'POST',
        body: JSON.stringify({ url, ...metadata })
      });
    } catch (error) {
      console.error('[API] Track external tab error:', error);
      throw error;
    }
  }

  /**
   * Get application history for a job
   * @param {string} jobId - Job ID
   * @returns {Promise<Object>} API response
   */
  async getApplicationHistory(jobId) {
    try {
      return await this.request(`/applications/${jobId}/history`);
    } catch (error) {
      console.error('[API] Get application history error:', error);
      throw error;
    }
  }

  /**
   * Update application status
   * @param {string} jobId - Job ID
   * @param {string} status - New status
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} API response
   */
  async updateApplicationStatus(jobId, status, metadata = {}) {
    try {
      return await this.request(`/applications/${jobId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, ...metadata })
      });
    } catch (error) {
      console.error('[API] Update application status error:', error);
      throw error;
    }
  }

  // ============================================
  // CONFIGURATION
  // ============================================

  async updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.API_URL) {
      this.baseURL = newConfig.API_URL;
    }
    await STORAGE.set('user_config', this.config);
    return this.config;
  }

  /**
   * Get current API configuration
   * @returns {Object} API configuration
   */
  getApiConfig() {
    return {
      baseURL: this.baseURL,
      isAuthenticated: this.isAuthenticated(),
      token: this.token ? 'present' : 'missing'
    };
  }
}

export const API_CLIENT = new APIClient();