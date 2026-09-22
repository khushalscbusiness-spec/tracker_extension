// src/config/config.js
// Pure ESM config loader — Chrome MV3 safe (no require, no process.env)
//
// The active env file is chosen at BUILD TIME by build.js via an esbuild plugin.
// In source, we always import './env/active.js' — the plugin rewrites this
// import to point at the correct env file for the target build.

import envConfig from './env/active.js';
import { STORAGE } from '../utils/storage.js';

// ============================================
// STATIC CONFIG (does not change per env)
// ============================================

const PLATFORMS = {
  linkedin:    { enabled: true, baseUrl: 'https://www.linkedin.com', jobPattern: '/jobs/view/' },
  naukri:      { enabled: true, baseUrl: 'https://www.naukri.com',   jobPattern: '/job-listings/' },
  greenhouse:  { enabled: true, baseUrl: 'https://boards.greenhouse.io' },
  lever:       { enabled: true, baseUrl: 'https://lever.co' },
  workday:     { enabled: true, baseUrl: 'https://myworkdayjobs.com' }
};

const FEATURES = {
  spaNavigation: true,
  autoDeduplicate: true,
  trackApplications: true,
  jobIntelligence: false,
  aiAssistance: false
};

// ============================================
// RUNTIME STATE
// ============================================

let currentConfig = null;
let configLoaded = false;

// ============================================
// PUBLIC API
// ============================================

export async function loadConfig() {
  if (configLoaded && currentConfig) return currentConfig;

  const baseConfig = {
    ...envConfig,
    ENVIRONMENT: envConfig.ENVIRONMENT || 'unknown',
    IS_DEVELOPMENT: envConfig.API_URL?.includes('localhost') || false,
    IS_STAGING:     envConfig.API_URL?.includes('staging') || false,
    IS_PRODUCTION:  envConfig.API_URL?.includes('api.jobpulse.io') || false,
    PLATFORMS,
    FEATURES
  };

  // Try to load user overrides from chrome.storage
  let userConfig = null;
  try {
    userConfig = await STORAGE.get('user_config');
  } catch (e) {
    console.warn('[Config] Could not load user config from storage:', e);
  }

  currentConfig = userConfig
    ? { ...baseConfig, ...userConfig }
    : { ...baseConfig };

  configLoaded = true;
  console.log('[Config] Loaded:', currentConfig.API_URL);
  return currentConfig;
}

export function getConfig() {
  if (!currentConfig) {
    currentConfig = {
      ...envConfig,
      PLATFORMS,
      FEATURES
    };
  }
  return currentConfig;
}

export function getApiUrl() {
  return getConfig().API_URL || envConfig.API_URL;
}

export function getReceiverUrl() {
  return getConfig().RECEIVER_URL || envConfig.RECEIVER_URL;
}

export function getWebsiteUrl() {
  return getConfig().WEBSITE_URL || envConfig.WEBSITE_URL;
}

export function getDashboardUrl() {
  return getConfig().DASHBOARD_URL || envConfig.DASHBOARD_URL;
}

export function isDebug() {
  return getConfig().DEBUG === true;
}

export function getLogLevel() {
  return getConfig().LOG_LEVEL || 'info';
}

export function isPlatformEnabled(platform) {
  const cfg = getConfig();
  return cfg.PLATFORMS?.[platform]?.enabled !== false;
}

export function isFeatureEnabled(feature) {
  const cfg = getConfig();
  return cfg.FEATURES?.[feature] === true;
}

export async function updateConfig(newConfig) {
  const current = getConfig();
  const updated = { ...current, ...newConfig };
  currentConfig = updated;
  await STORAGE.set('user_config', updated);
  console.log('[Config] Updated user config');
  return updated;
}

export default {
  loadConfig,
  getConfig,
  getApiUrl,
  getReceiverUrl,
  getWebsiteUrl,
  getDashboardUrl,
  isDebug,
  getLogLevel,
  isPlatformEnabled,
  isFeatureEnabled,
  updateConfig
};