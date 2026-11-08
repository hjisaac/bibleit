import type { AnswerMetadata, AnswerProvider } from '../core/ports';
import type { RetrievalResult } from '../core/types';

/**
 * HybridAnswerProvider: Composes remote cloud API with local on-device SLM fallback.
 * Follows the same fallback pattern as HybridEngine.
 */
export class HybridAnswerProvider implements AnswerProvider {
  constructor(
    private remote: AnswerProvider | null,
    private local: AnswerProvider,
    private isDeviceOnly?: () => boolean,
  ) {}

  get available(): boolean {
    if (this.isDeviceOnly?.()) {
      return this.local.available;
    }
    return (this.remote?.available ?? false) || this.local.available;
  }

  async *answer(
    query: string,
    context: RetrievalResult,
    onMeta?: (meta: AnswerMetadata) => void,
  ): AsyncIterable<string> {
    const canAttemptRemote = !this.isDeviceOnly?.() && (this.remote?.available ?? false);

    if (canAttemptRemote && this.remote) {
      try {
        let yielded = false;
        for await (const chunk of this.remote.answer(query, context, onMeta)) {
          yielded = true;
          yield chunk;
        }
        if (yielded) return;
      } catch {
        // Remote failed mid-stream or errored; fall back to local on-device generation
      }
    }

    if (this.local.available) {
      yield* this.local.answer(query, context, onMeta);
    }
  }
}
