import type { AnswerProvider, RetrievalResult, SearchEngine } from '@bibleit/engine';

/**
 * HybridEngine: Tiered search engine delegating to remote API when online,
 * with seamless zero-latency fallback to LocalEngine when offline or on network failure.
 */
export class HybridEngine implements SearchEngine {
  readonly ready: Promise<void>;
  readonly answers: AnswerProvider;
  private localEngine: SearchEngine;
  private remoteUrl: string | null;
  private isDeviceOnly?: () => boolean;

  constructor(
    localEngine: SearchEngine,
    remoteUrl?: string | null,
    isDeviceOnly?: () => boolean,
  ) {
    this.localEngine = localEngine;
    this.remoteUrl = remoteUrl?.trim().replace(/\/+$/, '') || null;
    this.isDeviceOnly = isDeviceOnly;
    this.ready = localEngine.ready;
    this.answers = localEngine.answers;
  }

  async retrieve(query: string, k = 10): Promise<RetrievalResult> {
    if (this.isDeviceOnly?.()) {
      return this.localEngine.retrieve(query, k);
    }
    if (this.remoteUrl && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(
          `${this.remoteUrl}/api/v1/search?q=${encodeURIComponent(query)}&k=${k}`,
          { signal: controller.signal },
        );
        clearTimeout(timeout);

        if (res.ok) {
          const result = (await res.json()) as RetrievalResult;
          if (Array.isArray(result?.passages)) {
            return result;
          }
        }
      } catch (err) {
        // Fallback to local engine on network failure, CORS issue, or timeout
        console.warn('[HybridEngine] Remote search call failed; falling back to local engine:', err);
      }
    }

    return this.localEngine.retrieve(query, k);
  }
}
