// config/staging.js - Staging Environment
export default {
  API_URL: 'https://staging-api.jobpulse.io/api/v1',
  WEBSITE_URL: 'https://staging.jobpulse.io',
  DASHBOARD_URL: 'https://staging.jobpulse.io/dashboard',

  BACKEND_CONFIG: {
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000
  },

  EXTENSION_CONFIG: {
    debug: true,
    logLevel: 'info',
    enableAnalytics: true,
    autoDetect: true,
    detectionDelay: 300
  },

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

  FEATURES: {
    spaNavigation: true,
    autoDeduplicate: true,
    trackApplications: true,
    jobIntelligence: false,
    aiAssistance: false
  }
};