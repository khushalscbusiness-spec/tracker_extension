// src/config/env/development.js
export default {
  API_URL: 'http://localhost:8000/api/v1',
  WEBSITE_URL: 'http://localhost:3000',
  DASHBOARD_URL: 'http://localhost:3000/dashboard',
  DEBUG: true,
  LOG_LEVEL: 'debug',
  BACKEND_TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000
};