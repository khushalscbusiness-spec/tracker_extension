// src/config/runtime-config.js
import { STORAGE } from '../utils/storage.js';

const DEFAULT_CONFIG = {
  API_URL: 'http://localhost:8000/api/v1',
  WEBSITE_URL: 'http://localhost:3000',
  DASHBOARD_URL: 'http://localhost:3000/dashboard',
  BACKEND_CONFIG: {
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000
  },
  EXTENSION_CONFIG: {
    debug: true,
    logLevel: 'debug',
    enableAnalytics: false,
    autoDetect: true,
    detectionDelay: 300
  },
  PLATFORMS: {
    linkedin: { enabled: true, baseUrl: 'https://www.linkedin.com', jobPattern: '/jobs/view/' },
    naukri: { enabled: true, baseUrl: 'https://www.naukri.com', jobPattern: '/job-listings/' },
    greenhouse: { enabled: true, baseUrl: 'https://boards.greenhouse.io' },
    lever: { enabled: true, baseUrl: 'https://lever.co' },
    workday: { enabled: true, baseUrl: 'https://myworkdayjobs.com' }
  },
  FEATURES: {
    spaNavigation: true,
    autoDeduplicate: true,
    trackApplications: true,
    jobIntelligence: false,
    aiAssistance: false
  }
};

let runtimeConfig = { ...DEFAULT_CONFIG };
let configLoaded = false;

export async function loadConfig() {
  if (configLoaded) return runtimeConfig;

  try {
    // Try to load from storage first (user settings)
    try {
      const storedConfig = await STORAGE.get('user_config');
      if (storedConfig) {
        runtimeConfig = { ...DEFAULT_CONFIG, ...storedConfig };
        configLoaded = true;
        console.log('[Config] Loaded from storage');
        return runtimeConfig;
      }
    } catch (storageError) {
      console.warn('[Config] Could not load from storage:', storageError);
    }

    // Try to load from config.json file
    try {
      // Check if we're in a Chrome extension context
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        const configUrl = chrome.runtime.getURL('config/config.json');
        console.log('[Config] Loading from:', configUrl);

        const response = await fetch(configUrl);
        if (response.ok) {
          const fileConfig = await response.json();
          runtimeConfig = { ...DEFAULT_CONFIG, ...fileConfig };
          configLoaded = true;
          console.log('[Config] Loaded from config.json');
          return runtimeConfig;
        } else {
          console.warn('[Config] config.json not found, status:', response.status);
        }
      } else {
        console.log('[Config] Not in extension context, using defaults');
      }
    } catch (fileError) {
      console.warn('[Config] Could not load config.json:', fileError.message);
    }
  } catch (error) {
    console.warn('[Config] Failed to load runtime config, using defaults:', error);
  }

  configLoaded = true;
  console.log('[Config] Using default config');
  return runtimeConfig;
}

export function getConfig() {
  return runtimeConfig || DEFAULT_CONFIG;
}

export function getApiUrl() {
  const config = getConfig();
  return config.API_URL || DEFAULT_CONFIG.API_URL;
}

export function getWebsiteUrl() {
  const config = getConfig();
  return config.WEBSITE_URL || DEFAULT_CONFIG.WEBSITE_URL;
}

export function getDashboardUrl() {
  const config = getConfig();
  return config.DASHBOARD_URL || DEFAULT_CONFIG.DASHBOARD_URL;
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
  const currentConfig = getConfig();
  const updatedConfig = { ...currentConfig, ...newConfig };
  runtimeConfig = updatedConfig;
  await STORAGE.set('user_config', updatedConfig);
  console.log('[Config] Updated config');
  return updatedConfig;
}

export default {
  loadConfig,
  getConfig,
  getApiUrl,
  getWebsiteUrl,
  getDashboardUrl,
  isPlatformEnabled,
  isFeatureEnabled,
  updateConfig
};