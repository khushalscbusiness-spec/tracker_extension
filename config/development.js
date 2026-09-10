// config/development.js - Development Environment
export default {
  API_URL: 'http://localhost:8000/api/v1',
  WEBSITE_URL: 'http://localhost:3000',
  DASHBOARD_URL: 'http://localhost:3000/dashboard',

  // Backend configuration
  BACKEND_CONFIG: {
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000
  },

  // Extension configuration
  EXTENSION_CONFIG: {
    debug: true,
    logLevel: 'debug',
    enableAnalytics: false,
    autoDetect: true,
    detectionDelay: 300
  },

  // Supported platforms
  PLATFORMS: {
    linkedin: {
      enabled: true,
      baseUrl: 'https://www.linkedin.com',
      jobPattern: '/jobs/view/'
    },
    naukri: {
      enabled: true,
      baseUrl: 'https://www.naukri.com',
      jobPattern: '/job-listings/'
    },
    greenhouse: {
      enabled: true,
      baseUrl: 'https://boards.greenhouse.io'
    },
    lever: {
      enabled: true,
      baseUrl: 'https://lever.co'
    },
    workday: {
      enabled: true,
      baseUrl: 'https://myworkdayjobs.com'
    }
  },

  // Feature flags
  FEATURES: {
    spaNavigation: true,
    autoDeduplicate: true,
    trackApplications: true,
    jobIntelligence: false,
    aiAssistance: false
  }
};