import type { SearchEngine } from '../core/ports';
import type { RetrievalResult } from '../core/types';
import { HybridAnswerProvider } from './hybrid-answer-provider';

const REMOTE_TIMEOUT_MS = 4000;
const REMOTE_COOLDOWN_MS = 20_000;

/**
 * Composes a remote and local SearchEngine into a single hybrid engine with
 * timeout, offline bypass, and cooldown failover.
 */
export function createHybridEngine(
  remote: SearchEngine | null,
  local: SearchEngine,
  isDeviceOnly?: () => boolean,
): SearchEngine {
  if (!remote) return local;

  // Timestamp until which remote requests are bypassed after a failure.
  let remoteDownUntil = 0;

  return {
    ready: local.ready,
    answerProvider: new HybridAnswerProvider(
      remote.answerProvider,
      local.answerProvider,
      isDeviceOnly,
    ),

    async sync(): Promise<void> {
      await local.sync?.();
    },

    async retrieve(query: string, k = 10): Promise<RetrievalResult> {
      if (isDeviceOnly?.()) {
        return local.retrieve(query, k);
      }

      const canAttemptRemote =
        Date.now() >= remoteDownUntil &&
        typeof navigator !== 'undefined' &&
        navigator.onLine;

      let fallbackReason: 'timeout' | 'error' | undefined;

      if (canAttemptRemote) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
          const result = await remote.retrieve(query, k, controller.signal);
          clearTimeout(timeout);

          remoteDownUntil = 0;
          return result;
        } catch (err) {
          remoteDownUntil = Date.now() + REMOTE_COOLDOWN_MS;
          const isTimeout =
            (err instanceof DOMException && err.name === 'AbortError') ||
            (err instanceof Error && err.name === 'AbortError');
          fallbackReason = isTimeout ? 'timeout' : 'error';
          console.warn('[createHybridEngine] Remote search unavailable; falling back to local:', err);
        }
      }

      const localResult = await local.retrieve(query, k);
      return fallbackReason ? { ...localResult, fallbackReason } : localResult;
    },
  };
}
