import type { AnswerProvider, SearchEngine } from '../core/ports';
import type { RetrievalResult } from '../core/types';
import { HybridAnswerProvider } from './hybrid-answer-provider';

const REMOTE_TIMEOUT_MS = 4000;
const REMOTE_COOLDOWN_MS = 20_000;

/**
 * Coordinates retrieval across a primary remote engine and local fallback engine
 * with timeout, offline bypass, and cooldown circuit-breaking.
 */
export class EngineManager implements SearchEngine {
  readonly ready: Promise<void>;
  readonly answerProvider: AnswerProvider;
  private readonly remoteEngine: SearchEngine | null;
  private readonly localEngine: SearchEngine;
  private readonly isDeviceOnly?: () => boolean;

  // Timestamp until which remote requests are bypassed after a failure.
  private remoteDownUntil = 0;

  constructor(
    remoteEngine: SearchEngine | null,
    localEngine: SearchEngine,
    isDeviceOnly?: () => boolean,
  ) {
    this.remoteEngine = remoteEngine;
    this.localEngine = localEngine;
    this.isDeviceOnly = isDeviceOnly;
    this.ready = localEngine.ready;
    this.answerProvider = new HybridAnswerProvider(
      remoteEngine?.answerProvider ?? null,
      localEngine.answerProvider,
      isDeviceOnly,
    );
  }

  async sync(): Promise<void> {
    await this.localEngine.sync?.();
  }

  async retrieve(query: string, k = 10): Promise<RetrievalResult> {
    if (!this.remoteEngine || this.isDeviceOnly?.()) {
      return this.localEngine.retrieve(query, k);
    }

    const canAttemptRemote =
      Date.now() >= this.remoteDownUntil &&
      typeof navigator !== 'undefined' &&
      navigator.onLine;

    let fallbackReason: 'timeout' | 'error' | undefined;

    if (canAttemptRemote) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
        const result = await this.remoteEngine.retrieve(query, k, controller.signal);
        clearTimeout(timeout);

        this.remoteDownUntil = 0;
        return result;
      } catch (err) {
        this.remoteDownUntil = Date.now() + REMOTE_COOLDOWN_MS;
        const isTimeout =
          (err instanceof DOMException && err.name === 'AbortError') ||
          (err instanceof Error && err.name === 'AbortError');
        fallbackReason = isTimeout ? 'timeout' : 'error';
        console.warn('[EngineManager] Remote search unavailable; falling back to local engine:', err);
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
