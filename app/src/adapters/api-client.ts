import { hc } from 'hono/client';
import type { AppType } from '@bibleit/api';
import type { RetrievalResult, ScoredPassage } from '../core/types';

export class BibleitApiClient {
  private client: ReturnType<typeof hc<AppType>>;

  constructor(baseUrl: string) {
    this.client = hc<AppType>(baseUrl);
  }

  async search(query: string, k = 10, signal?: AbortSignal): Promise<RetrievalResult | null> {
    const res = await this.client.api.v1.search.$get(
      { query: { q: query, k: String(k) } },
      { init: { signal } },
    );
    if (!res.ok) return null;
    return (await res.json()) as RetrievalResult;
  }

  async generate(query: string, passages: ScoredPassage[]): Promise<Response> {
    return await this.client.api.v1.generate.$post({
      json: { query, passages },
    });
  }
}
