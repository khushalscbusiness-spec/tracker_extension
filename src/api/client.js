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

  /**
   * Extract a human-readable error message from an API response body.
   *
   * Handles three shapes Layer 3 can return:
   *   - Pydantic validation:  { detail: [ { loc: [...], msg: "...", type: "..." } ] }
   *   - Custom HTTPException: { detail: { error: "...", message: "..." } }
   *   - Fallback:             { detail: "plain string" }
   */
  _extractErrorMessage(body, response) {
    if (body && typeof body === 'object') {
      const detail = body.detail;

      // Plain string detail
      if (typeof detail === 'string') {
        return detail;
      }

      // Object detail
      if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
        if (detail.message) return detail.message;
        if (detail.error) return detail.error;
      }

      // Array detail (Pydantic validation errors)
      if (Array.isArray(detail)) {
        return detail
          .map(item => {
            const loc = Array.isArray(item.loc) ? item.loc.join('.') : '';
            return loc ? `${loc}: ${item.msg}` : item.msg;
          })
          .join('; ');
      }

      if (body.error) return body.error;
      if (body.message) return body.message;
    }

    return response.statusText || 'Unknown error';
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
          const errorBody = await response.json().catch(() => ({}));
          const message = this._extractErrorMessage(errorBody, response);
          throw new Error(message);
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
      // Layer 3 uses OAuth2 password flow, which expects
      // application/x-www-form-urlencoded with fields:
      //   username (not email)
      //   password
      const response = await this.request('/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          username: email,
          password: password
        }).toString()
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