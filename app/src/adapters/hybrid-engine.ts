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

  // Rewrite localhost to host IP when accessing app from mobile on LAN.
  private getResolvedRemoteUrl(): string | null {
    if (!this.remoteUrl) return null;
    if (typeof window !== 'undefined' && window.location?.hostname) {
      const host = window.location.hostname;
      if (host !== 'localhost' && host !== '127.0.0.1') {
        return this.remoteUrl.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?/, `$1${host}$3`);
      }
    }
    return this.remoteUrl;
  }

  async retrieve(query: string, k = 10): Promise<RetrievalResult> {
    if (this.isDeviceOnly?.()) {
      return this.localEngine.retrieve(query, k);
    }
    const resolvedUrl = this.getResolvedRemoteUrl();
    const canAttemptRemote =
      resolvedUrl &&
      Date.now() >= this.remoteDownUntil &&
      typeof navigator !== 'undefined' &&
      navigator.onLine;

    if (canAttemptRemote) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(
          `${resolvedUrl}/api/v1/search?q=${encodeURIComponent(query)}&k=${k}`,
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
        // Cooldown remote calls for 20s on connection failure or timeout
        this.remoteDownUntil = Date.now() + 20000;
        console.warn('[HybridEngine] Remote search unavailable; falling back to local engine:', err);
      }
    }

    return this.localEngine.retrieve(query, k);
  }
}
