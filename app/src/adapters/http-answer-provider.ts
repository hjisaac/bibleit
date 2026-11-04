import type { AnswerProvider } from '../core/ports';
import type { RetrievalResult } from '../core/types';

export class HttpAnswerProvider implements AnswerProvider {
  constructor(
    private remoteUrl: string | null,
    private isDeviceOnly?: () => boolean,
  ) {}

  get available(): boolean {
    if (!this.remoteUrl || this.isDeviceOnly?.()) return false;
    return typeof navigator === 'undefined' || navigator.onLine;
  }

  async *answer(query: string, context: RetrievalResult): AsyncIterable<string> {
    if (!this.available || !this.remoteUrl) return;

    try {
      const res = await fetch(`${this.remoteUrl}/api/v1/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, passages: context.passages }),
      });

      if (!res.ok || !res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          yield decoder.decode(value, { stream: true });
        }
      } finally {
        reader.releaseLock();
      }
    } catch {
      // Stream terminates gracefully on network disruption
    }
  }
}
