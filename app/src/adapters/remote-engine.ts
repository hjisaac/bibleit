import type { AnswerProvider, LanguageDetectorPort, SearchEngine } from '../core/ports';
import { SearchOriginEnum, type DetectionMethod, type RetrievalResult, LocaleEnum, resolveLocale } from '../core/types';
import { BrowserLanguageDetector } from '../core/language-detector';
import { BibleitApiClient } from './api-client';
import { HttpAnswerProvider } from './http-answer-provider';

export class RemoteEngine implements SearchEngine {
  readonly ready: Promise<void> = Promise.resolve();
  readonly answerProvider: AnswerProvider;
  private readonly apiClient: BibleitApiClient;
  private readonly getLocale?: () => string;
  private readonly getTranslate?: () => boolean;
  private readonly languageDetector: LanguageDetectorPort;

  constructor(
    baseUrl: string,
    answerProvider?: AnswerProvider,
    getLocale?: () => string,
    getTranslate?: () => boolean,
    languageDetector?: LanguageDetectorPort,
  ) {
    const cleanUrl = baseUrl.trim().replace(/\/+$/, '');
    this.apiClient = new BibleitApiClient(cleanUrl);
    this.answerProvider = answerProvider ?? new HttpAnswerProvider(cleanUrl);
    this.getLocale = getLocale;
    this.getTranslate = getTranslate;
    this.languageDetector = languageDetector ?? new BrowserLanguageDetector();
  }

  async retrieve(query: string, k = 10, signal?: AbortSignal): Promise<RetrievalResult> {
    const locale = this.getLocale?.();
    let shouldTranslate: boolean | undefined = undefined;
    let detectedLanguage: 'en' | 'fr' | null = null;
    let detectionMethod: DetectionMethod | undefined = undefined;
    let clientBypassReason: string | undefined = undefined;

    if (resolveLocale(locale) === LocaleEnum.FR) {
      if (this.getTranslate?.() === false) {
        shouldTranslate = false;
        clientBypassReason = 'user_opt_out';
      } else {
        shouldTranslate = true;
        const detection = await this.languageDetector.detect(query);
        detectedLanguage = detection.language;
        detectionMethod = detection.detectionMethod;
        if (detectedLanguage === 'en') {
          shouldTranslate = false;
          clientBypassReason = 'client_detected_english';
        }
      }
    }

    const result = await this.apiClient.search(
      query,
      k,
      signal,
      locale,
      shouldTranslate,
      clientBypassReason,
    );
    if (!result || !Array.isArray(result.passages)) {
      throw new Error('Invalid remote search response: missing passages');
    }
    return {
      ...result,
      detectedLanguage: detectedLanguage ?? result.detectedLanguage,
      detectionMethod,
      translationBypassReason: clientBypassReason ?? result.translationBypassReason,
      origin: SearchOriginEnum.REMOTE,
    };
  }
}
