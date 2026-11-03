import type { AnswerProvider, RetrievalResult, SearchEngine } from '@bibleit/engine';

/**
 * HybridEngine: Tiered search engine delegating to remote API when online,
 * with seamless zero-latency fallback to LocalEngine when offline or on network failure.
 */
const REMOTE_TIMEOUT_MS = 2000;
const REMOTE_COOLDOWN_MS = 20_000;

export class HybridEngine implements SearchEngine {
  readonly ready: Promise<void>;
  readonly answers: AnswerProvider;
  private localEngine: SearchEngine;
  private remoteUrl: string | null;
  private isDeviceOnly?: () => boolean;

  // Timestamp until which remote requests are bypassed after a failure.
  private remoteDownUntil = 0;

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

  async sync(): Promise<void> {
    await this.localEngine.sync?.();
  }

  async retrieve(query: string, k = 10): Promise<RetrievalResult> {
    if (this.isDeviceOnly?.()) {
      return this.localEngine.retrieve(query, k);
    }
    const canAttemptRemote =
      this.remoteUrl &&
      Date.now() >= this.remoteDownUntil &&
      typeof navigator !== 'undefined' &&
      navigator.onLine;

    if (canAttemptRemote) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
        const res = await fetch(
          `${this.remoteUrl}/api/v1/search?q=${encodeURIComponent(query)}&k=${k}`,
          { signal: controller.signal },
        );
        clearTimeout(timeout);

        if (res.ok) {
          const result = (await res.json()) as RetrievalResult;
          if (Array.isArray(result?.passages)) {
            this.remoteDownUntil = 0;
            return result;
          }
        }
      } catch (err) {
        this.remoteDownUntil = Date.now() + REMOTE_COOLDOWN_MS;
        console.warn('[HybridEngine] Remote search unavailable; falling back to local engine:', err);
      }
    }

    return this.localEngine.retrieve(query, k);
  }
}
