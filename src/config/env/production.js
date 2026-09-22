// src/config/env/production.js
export default {
  API_URL: 'https://api.jobpulse.io/api/v1',
  RECEIVER_URL: 'https://receiver.jobpulse.io',
  WEBSITE_URL: 'https://jobpulse.io',
  DASHBOARD_URL: 'https://jobpulse.io/dashboard',
  DEBUG: false,
  LOG_LEVEL: 'error',
  BACKEND_TIMEOUT: 30000,
  RETRY_ATTEMPTS: 2,
  RETRY_DELAY: 1000
};