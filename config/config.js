// config/config.js - Main configuration loader

// Environment detection
const ENV = process.env.NODE_ENV || 'development';
const CONFIG_FILES = {
  development: './development.js',
  staging: './staging.js',
  production: './production.js'
};

// Load environment config
let envConfig = {};
try {
  const configModule = require(CONFIG_FILES[ENV] || CONFIG_FILES.development);
  envConfig = configModule.default || configModule;
} catch (error) {
  console.error(`Failed to load config for environment: ${ENV}`, error);
  envConfig = {
    API_URL: 'http://localhost:8000/api/v1',
    WEBSITE_URL: 'http://localhost:3000',
    ENVIRONMENT: 'development'
  };
}

// Runtime config (can be overridden by user)
let runtimeConfig = {};
try {
  // This will be loaded from a separate file that can be edited
  const runtimeModule = require('./config.json');
  runtimeConfig = runtimeModule;
} catch (error) {
  // Runtime config is optional
  console.log('No runtime config found, using defaults');
}

// Merge configs (runtime overrides environment)
const config = {
  ...envConfig,
  ...runtimeConfig,
  // Environment info
  ENVIRONMENT: ENV,
  IS_DEVELOPMENT: ENV === 'development',
  IS_PRODUCTION: ENV === 'production',
  IS_STAGING: ENV === 'staging',

  // Helper method to get config value
  get: function(key) {
    return this[key];
  },

  // Get API URL with fallback
  getApiUrl: function() {
    return this.API_URL || 'http://localhost:8000/api/v1';
  },

  // Get Website URL with fallback
  getWebsiteUrl: function() {
    return this.WEBSITE_URL || 'http://localhost:3000';
  }
};

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = config;
  module.exports.default = config;
}

// For browser
if (typeof window !== 'undefined') {
  window.__JOBPULSE_CONFIG = config;
}

export default config;