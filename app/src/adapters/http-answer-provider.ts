import type { AnswerProvider } from '../core/ports';
import type { RetrievalResult } from '../core/types';
import { BibleitApiClient } from './api-client';

export class HttpAnswerProvider implements AnswerProvider {
  private client: BibleitApiClient | null = null;

  constructor(
    private remoteUrl: string | null,
    private isDeviceOnly?: () => boolean,
  ) {
    if (this.remoteUrl) {
      this.client = new BibleitApiClient(this.remoteUrl);
    }
  }

  get available(): boolean {
    if (!this.remoteUrl || this.isDeviceOnly?.()) return false;
    return typeof navigator === 'undefined' || navigator.onLine;
  }

  async *answer(query: string, context: RetrievalResult): AsyncIterable<string> {
    if (!this.available || !this.client) return;

    try {
      const res = await this.client.generate(query, context.passages);

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
