// src/background/api/receiver-api.js
//
// HTTP client for Layer 2's receiver.
//
// The receiver is a separate service from Layer 3. This module is
// the ONLY place in the extension that knows the receiver's URLs
// and HTTP contract.
//
// Endpoints:
//   POST /receive/v1/events    Submit one event
//   GET  /health               Health check
//
// This module does NOT know what a "session" or an "application" is.
// It only knows how to POST a JSON payload to the receiver and
// how to interpret the response.

import { getReceiverUrl } from '../../config/config.js';

const ENDPOINTS = {
  events: '/receive/v1/events',
  health: '/health',
};

/**
 * Resolve the base URL of the receiver.
 *
 * Priority:
 *   1. chrome.storage.local.user_config.RECEIVER_URL (runtime override)
 *   2. Build-time config from the active env file
 *
 * @returns {Promise<string>}
 */
async function resolveBaseUrl() {
  // 1. Runtime override from storage
  try {
    const result = await chrome.storage.local.get('user_config');
    const userConfig = result.user_config;
    if (userConfig && userConfig.RECEIVER_URL) {
      return userConfig.RECEIVER_URL;
    }
  } catch (e) {
    console.warn('[ReceiverAPI] Could not read user_config from storage:', e);
  }

  // 2. Build-time config
  const baseUrl = getReceiverUrl();
  if (!baseUrl) {
    throw new Error('[ReceiverAPI] No receiver URL configured');
  }
  return baseUrl;
}

/**
 * Read the current auth token, if any.
 *
 * The receiver accepts anonymous events in development
 * (REQUIRE_AUTH=false) and requires a token in production.
 *
 * @returns {Promise<string|null>}
 */
async function getAuthToken() {
  try {
    const result = await chrome.storage.local.get('access_token');
    return result.access_token || null;
  } catch (e) {
    console.warn('[ReceiverAPI] Could not read auth token:', e);
    return null;
  }
}

/**
 * Clear the auth token from storage.
 *
 * Called when the receiver rejects the token with 401. Clearing
 * the token here ensures the popup and the service worker see the
 * session as logged out on their next check.
 *
 * @returns {Promise<void>}
 */
async function clearAuthToken() {
  try {
    await chrome.storage.local.remove(['access_token', 'access_token_expires_at']);
  } catch (e) {
    console.warn('[ReceiverAPI] Could not clear auth token:', e);
  }
}

/**
 * Extract a human-readable error message from a failed response body.
 *
 * The receiver returns errors in different shapes depending on
 * where the failure occurred:
 *   - Pydantic validation:  { detail: [ { loc: [...], msg: "...", type: "..." } ] }
 *   - Custom HTTPException: { detail: { error: "...", message: "..." } }
 *   - Fallback:             { detail: "plain string" }
 *
 * This function tries each shape and returns the best string.
 *
 * @param {Object} data - Parsed response body
 * @param {Response} response - The fetch Response object
 * @returns {string}
 */
function extractErrorMessage(data, response) {
  if (data && typeof data === 'object') {
    if (data.detail) {
      // Plain string detail
      if (typeof data.detail === 'string') {
        return data.detail;
      }

      // Object detail (custom HTTPException)
      if (data.detail.message) return data.detail.message;
      if (data.detail.error) return data.detail.error;

      // Array detail (Pydantic validation)
      if (Array.isArray(data.detail)) {
        return data.detail
          .map((item) => {
            const loc = Array.isArray(item.loc) ? item.loc.join('.') : '';
            return loc ? `${loc}: ${item.msg}` : item.msg;
          })
          .join('; ');
      }
    }

    if (data.error) return data.error;
    if (data.message) return data.message;
  }

  return response.statusText || 'Unknown error';
}

/**
 * Generic request helper.
 *
 * Handles:
 *   - Resolving the base URL
 *   - Attaching auth header
 *   - Serializing the body
 *   - Parsing the response
 *   - Extracting error messages on failure
 *
 * @param {string} method - HTTP method
 * @param {string} path   - Path (e.g. '/receive/v1/events')
 * @param {Object} [body] - Optional JSON body
 * @returns {Promise<Object>} Parsed response body
 */
async function request(method, path, body = null) {
  const baseUrl = await resolveBaseUrl();
  const url = `${baseUrl}${path}`;
  const token = await getAuthToken();

  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = {
    method,
    headers,
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  console.log(`[ReceiverAPI] ${method} ${url}`);

  let response;
  try {
    response = await fetch(url, options);
  } catch (networkError) {
    // fetch() rejects for network-level errors (DNS, refused, etc.)
    console.error(`[ReceiverAPI] Network error for ${method} ${url}:`, networkError);
    throw new Error(`Network error: ${networkError.message}`);
  }

  // Try to parse JSON. Some errors (502, 504) return HTML or empty bodies.
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = extractErrorMessage(data, response);

    // 401 means the token is expired or invalid. Clear it so the
    // popup shows the login form on its next open. The event itself
    // goes to failedSubmissions, where a future drain can retry it
    // after re-login.
    if (response.status === 401) {
      await clearAuthToken();
    }

    throw new Error(`HTTP ${response.status}: ${message}`);
  }

  return data;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Submit one event to the receiver.
 *
 * @param {Object} payload - Wire-ready payload from the adapter
 * @returns {Promise<Object>} Receiver response:
 *                            { success, event_id, received_at }
 */
export async function submitEvent(payload) {
  return request('POST', ENDPOINTS.events, payload);
}

/**
 * Check whether the receiver is reachable.
 *
 * @returns {Promise<boolean>}
 */
export async function pingReceiver() {
  try {
    const response = await request('GET', ENDPOINTS.health);
    return response && response.status === 'ok';
  } catch (e) {
    console.warn('[ReceiverAPI] Ping failed:', e.message);
    return false;
  }
}

// Export endpoints for tests and debugging
export { ENDPOINTS };