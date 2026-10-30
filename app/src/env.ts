function requireEnv(key: string, value: string | undefined): string {
  const clean = value?.trim();
  if (!clean) {
    throw new Error(`[Configuration Error] Missing required environment variable: ${key}`);
  }
  return clean;
}

export const env = {
  feedbackEmail: requireEnv('VITE_FEEDBACK_EMAIL', import.meta.env.VITE_FEEDBACK_EMAIL),
  r2Url: requireEnv('VITE_CLOUDFLARE_R2_URL', import.meta.env.VITE_CLOUDFLARE_R2_URL).replace(/\/+$/, ''),
  backendApiUrl: requireEnv('VITE_BACKEND_API_URL', import.meta.env.VITE_BACKEND_API_URL).replace(/\/+$/, ''),
} as const;
