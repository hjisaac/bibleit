import { DEFAULT_POSTHOG_HOST, DEFAULT_TELEMETRY_BATCH_SIZE } from './constants';

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

export function resolvePosthogKey(
  rawKey: string | undefined,
  isDev: boolean,
  devFlag: string | undefined,
): string {
  // Never log in dev unless explicitly enabled via VITE_TELEMETRY_DEV=true.
  if (isDev && devFlag !== 'true') return '';
  return rawKey?.trim() || '';
}

export function resolvePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw?.trim() || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const env = {
  feedbackEmail: requireEnv('VITE_FEEDBACK_EMAIL', import.meta.env.VITE_FEEDBACK_EMAIL),
  r2Url: requireEnv('VITE_CLOUDFLARE_R2_URL', import.meta.env.VITE_CLOUDFLARE_R2_URL).replace(/\/+$/, ''),
  backendApiUrl: (import.meta.env.VITE_BACKEND_API_URL?.trim() || '').replace(/\/+$/, ''),
  posthogKey: resolvePosthogKey(
    import.meta.env.VITE_POSTHOG_KEY,
    Boolean(import.meta.env.DEV),
    import.meta.env.VITE_TELEMETRY_DEV,
  ),
  posthogHost: (import.meta.env.VITE_POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST).replace(/\/+$/, ''),
  telemetryBatchSize: resolvePositiveInt(
    import.meta.env.VITE_TELEMETRY_BATCH_SIZE,
    DEFAULT_TELEMETRY_BATCH_SIZE,
  ),
  telemetryEnv: import.meta.env.DEV ? ('dev' as const) : ('prod' as const),
  isMultilingualEnabled:
    import.meta.env.VITE_MULTILINGUAL_ENABLED !== undefined
      ? import.meta.env.VITE_MULTILINGUAL_ENABLED === 'true'
      : Boolean(import.meta.env.DEV),
  numThreads: resolveLocalNumThreads(),
} as const;
