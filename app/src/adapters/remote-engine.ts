import type { AnswerProvider, SearchEngine } from '../core/ports';
import { SearchOriginEnum, type RetrievalResult, isFrenchLocale } from '../core/types';
import { detectQueryLanguage } from '../core/language-detector';
import { BibleitApiClient } from './api-client';
import { HttpAnswerProvider } from './http-answer-provider';

export class RemoteEngine implements SearchEngine {
  readonly ready: Promise<void> = Promise.resolve();
  readonly answerProvider: AnswerProvider;
  private readonly apiClient: BibleitApiClient;
  private readonly getLocale?: () => string;
  private readonly getTranslate?: () => boolean;

  constructor(
    baseUrl: string,
    answerProvider?: AnswerProvider,
    getLocale?: () => string,
    getTranslate?: () => boolean,
  ) {
    const cleanUrl = baseUrl.trim().replace(/\/+$/, '');
    this.apiClient = new BibleitApiClient(cleanUrl);
    this.answerProvider = answerProvider ?? new HttpAnswerProvider(cleanUrl);
    this.getLocale = getLocale;
    this.getTranslate = getTranslate;
  }

  async retrieve(query: string, k = 10, signal?: AbortSignal): Promise<RetrievalResult> {
    const locale = this.getLocale?.();
    let shouldTranslate: boolean | undefined = undefined;

    if (isFrenchLocale(locale)) {
      shouldTranslate = this.getTranslate?.() !== false;
      if (shouldTranslate) {
        const detected = await detectQueryLanguage(query);
        if (detected === 'en') {
          shouldTranslate = false;
        }
      }
    }

    const result = await this.apiClient.search(query, k, signal, locale, shouldTranslate);
    if (!result || !Array.isArray(result.passages)) {
      throw new Error('Invalid remote search response: missing passages');
    }
    return {
      ...result,
      origin: SearchOriginEnum.REMOTE,
    };
  }
}
