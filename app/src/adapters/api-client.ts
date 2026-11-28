import { hc } from 'hono/client';
import type { AppType } from '@bibleit/api';
import type { RetrievalResult, ScoredPassage } from '../core/types';

export class BibleitApiClient {
  private client: ReturnType<typeof hc<AppType>>;

  constructor(baseUrl: string) {
    this.client = hc<AppType>(baseUrl);
  }

  async search(
    query: string,
    k = 10,
    signal?: AbortSignal,
    locale?: string,
    translate?: boolean,
    clientBypassReason?: string,
  ): Promise<RetrievalResult | null> {
    const jsonBody: {
      query: string;
      k: number;
      locale?: string;
      translate?: boolean;
      clientBypassReason?: string;
    } = {
      query,
      k,
    };
    if (locale && locale !== 'en') jsonBody.locale = locale;
    if (translate === false) jsonBody.translate = false;
    if (clientBypassReason) jsonBody.clientBypassReason = clientBypassReason;

    const res = await this.client.api.v1.search.$post(
      { json: jsonBody },
      { init: { signal } },
    );
    if (!res.ok) return null;
    return (await res.json()) as RetrievalResult;
  }

  async generate(query: string, passages: ScoredPassage[], locale?: string): Promise<Response> {
    return await this.client.api.v1.generate.$post({
      json: { query, passages, locale },
    });
  }
}
