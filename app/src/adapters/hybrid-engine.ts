import type { AnswerProvider, SearchEngine } from '../core/ports';
import { SearchOriginEnum, type RetrievalResult } from '../core/types';
import { HttpAnswerProvider } from './http-answer-provider';
import { HybridAnswerProvider } from './hybrid-answer-provider';
import { BibleitApiClient } from './api-client';

/**
 * HybridEngine: Tiered search engine delegating to remote API when online,
 * with seamless zero-latency fallback to LocalEngine when offline or on network failure.
 */
const REMOTE_TIMEOUT_MS = 4000;
const REMOTE_COOLDOWN_MS = 20_000;

export class HybridEngine implements SearchEngine {
  readonly ready: Promise<void>;
  readonly answerProvider: AnswerProvider;
  private localEngine: SearchEngine;
  private remoteUrl: string | null;
  private isDeviceOnly?: () => boolean;
  private apiClient: BibleitApiClient | null = null;

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
    const remoteAnswer = this.remoteUrl
      ? new HttpAnswerProvider(this.remoteUrl, isDeviceOnly)
      : null;
    this.answerProvider = new HybridAnswerProvider(
      remoteAnswer,
      localEngine.answerProvider,
      isDeviceOnly,
    );
    if (this.remoteUrl) {
      this.apiClient = new BibleitApiClient(this.remoteUrl);
    }
  }

  async sync(): Promise<void> {
    await this.localEngine.sync?.();
  }

  async retrieve(query: string, k = 10): Promise<RetrievalResult> {
    if (!this.remoteUrl || this.isDeviceOnly?.()) {
      return this.localEngine.retrieve(query, k);
    }
    const canAttemptRemote =
      Date.now() >= this.remoteDownUntil &&
      typeof navigator !== 'undefined' &&
      navigator.onLine;

    let fallbackReason: 'timeout' | 'error' | undefined;

    if (canAttemptRemote && this.apiClient) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
        const result = await this.apiClient.search(query, k, controller.signal);
        clearTimeout(timeout);

        if (result && Array.isArray(result.passages)) {
          this.remoteDownUntil = 0;
          return {
            ...result,
            origin: SearchOriginEnum.REMOTE,
          };
        }
      } catch (err) {
        this.remoteDownUntil = Date.now() + REMOTE_COOLDOWN_MS;
        const isTimeout =
          (err instanceof DOMException && err.name === 'AbortError') ||
          (err instanceof Error && err.name === 'AbortError');
        fallbackReason = isTimeout ? 'timeout' : 'error';
        console.warn('[HybridEngine] Remote search unavailable; falling back to local engine:', err);
      }
    }

    const localResult = await this.localEngine.retrieve(query, k);
    if (fallbackReason) {
      return {
        ...localResult,
        fallbackReason,
      };
    }
    return localResult;
  }
}
