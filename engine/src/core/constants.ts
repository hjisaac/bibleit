export const API_ROUTES = {
  SEARCH: '/api/v1/search',
  GENERATE: '/api/v1/generate',
  HEALTH: '/health',
  STATUS: '/status',
} as const;

export const TELEMETRY_HEADERS = {
  PROVIDER: 'Bibleit-Provider',
  MODEL: 'Bibleit-Model',
  ATTEMPTS: 'Bibleit-Attempts',
} as const;
