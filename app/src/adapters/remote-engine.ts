import type { AnswerProvider, SearchEngine } from '../core/ports';
import { SearchOriginEnum, type RetrievalResult } from '../core/types';
import { BibleitApiClient } from './api-client';
import { HttpAnswerProvider } from './http-answer-provider';

export class RemoteEngine implements SearchEngine {
  readonly ready: Promise<void> = Promise.resolve();
  readonly answerProvider: AnswerProvider;
  private readonly apiClient: BibleitApiClient;
  private readonly getLocale?: () => string;

  constructor(baseUrl: string, answerProvider?: AnswerProvider, getLocale?: () => string) {
    const cleanUrl = baseUrl.trim().replace(/\/+$/, '');
    this.apiClient = new BibleitApiClient(cleanUrl);
    this.answerProvider = answerProvider ?? new HttpAnswerProvider(cleanUrl);
    this.getLocale = getLocale;
  }

  async retrieve(query: string, k = 10, signal?: AbortSignal): Promise<RetrievalResult> {
    const locale = this.getLocale?.();
    const result = await this.apiClient.search(query, k, signal, locale);
    if (!result || !Array.isArray(result.passages)) {
      throw new Error('Invalid remote search response: missing passages');
    }
    return {
      ...result,
      origin: SearchOriginEnum.REMOTE,
    };
  }
}
