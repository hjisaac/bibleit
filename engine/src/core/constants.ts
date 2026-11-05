export const API_ROUTES = {
  SEARCH: '/api/v1/search',
  GENERATE: '/api/v1/generate',
  HEALTH: '/health',
} as const;

export const TELEMETRY_HEADERS = {
  PROVIDER: 'bibleit-provider',
  MODEL: 'bibleit-model',
  ATTEMPTS: 'bibleit-attempts',
} as const;
