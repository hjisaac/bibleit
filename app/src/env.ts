function requireEnv(key: string, value: string | undefined): string {
  const clean = value?.trim();
  if (!clean) {
    if (import.meta.env.MODE === 'test') {
      return '';
    }
    throw new Error(`[Configuration Error] Missing required environment variable: ${key}`);
  }
  return clean;
}

const MAX_RECOMMENDED_LOCAL_THREADS = 4;

function resolveLocalNumThreads(): number {
  const isIsolated = typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : false;
  const isMultiThreadSupported = typeof SharedArrayBuffer !== 'undefined' && isIsolated;
  if (!isMultiThreadSupported) return 1;
  const total = typeof navigator !== 'undefined' && navigator.hardwareConcurrency
    ? navigator.hardwareConcurrency
    : 1;
  return Math.min(MAX_RECOMMENDED_LOCAL_THREADS, total);
}

export const env = {
  feedbackEmail: requireEnv('VITE_FEEDBACK_EMAIL', import.meta.env.VITE_FEEDBACK_EMAIL),
  r2Url: (import.meta.env.VITE_CLOUDFLARE_R2_URL || '').trim().replace(/\/+$/, ''),
  backendApiUrl: (import.meta.env.VITE_BACKEND_API_URL?.trim() || '').replace(/\/+$/, ''),
  isMultilingualEnabled:
    import.meta.env.VITE_MULTILINGUAL_ENABLED !== undefined
      ? import.meta.env.VITE_MULTILINGUAL_ENABLED === 'true'
      : Boolean(import.meta.env.DEV),
  numThreads: resolveLocalNumThreads(),
} as const;
