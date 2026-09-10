// src/config/config.js
import { STORAGE } from '../utils/storage.js';

// Default configuration - embedded in code
const DEFAULT_CONFIG = {
  API_URL: 'http://localhost:8000/api/v1',
  WEBSITE_URL: 'http://localhost:3000',
  DASHBOARD_URL: 'http://localhost:3000/dashboard',
  DEBUG: true,
  LOG_LEVEL: 'debug',
  BACKEND_TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  PLATFORMS: {
    linkedin: { enabled: true },
    naukri: { enabled: true },
    greenhouse: { enabled: true },
    lever: { enabled: true },
    workday: { enabled: true }
  },
  FEATURES: {
    spaNavigation: true,
    autoDeduplicate: true,
    trackApplications: true,
    jobIntelligence: false,
    aiAssistance: false
  }
};

let currentConfig = { ...DEFAULT_CONFIG };
let configLoaded = false;

export async function loadConfig() {
  if (configLoaded) return currentConfig;

  try {
    // Try to load user overrides from storage
    const storedConfig = await STORAGE.get('user_config');
    if (storedConfig) {
      currentConfig = { ...DEFAULT_CONFIG, ...storedConfig };
      console.log('[Config] Loaded user config from storage');
    } else {
      console.log('[Config] Using default config');
      // Save default config to storage for future use
      await STORAGE.set('user_config', DEFAULT_CONFIG);
    }
  } catch (error) {
    console.warn('[Config] Error loading config, using defaults:', error);
    currentConfig = { ...DEFAULT_CONFIG };
  }

  configLoaded = true;
  return currentConfig;
}

export function getConfig() {
  return currentConfig || DEFAULT_CONFIG;
}

export function getApiUrl() {
  return getConfig().API_URL || DEFAULT_CONFIG.API_URL;
}

export function getWebsiteUrl() {
  return getConfig().WEBSITE_URL || DEFAULT_CONFIG.WEBSITE_URL;
}

export function getDashboardUrl() {
  return getConfig().DASHBOARD_URL || DEFAULT_CONFIG.DASHBOARD_URL;
}

export function isDebug() {
  return getConfig().DEBUG || false;
}

export function getLogLevel() {
  return getConfig().LOG_LEVEL || 'info';
}

export function isPlatformEnabled(platform) {
  const config = getConfig();
  return config.PLATFORMS?.[platform]?.enabled !== false;
}

export function isFeatureEnabled(feature) {
  const config = getConfig();
  return config.FEATURES?.[feature] === true;
}

export async function updateConfig(newConfig) {
  const current = getConfig();
  const updated = { ...current, ...newConfig };
  currentConfig = updated;
  await STORAGE.set('user_config', updated);
  console.log('[Config] Updated user config');
  return updated;
}

// For backward compatibility
export default {
  loadConfig,
  getConfig,
  getApiUrl,
  getWebsiteUrl,
  getDashboardUrl,
  isDebug,
  getLogLevel,
  isPlatformEnabled,
  isFeatureEnabled,
  updateConfig
};