import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import {
  DEEPL_FREE_API_URL,
  DEEPL_PRO_API_URL,
  DEFAULT_LLM_TRANSLATION_LIMIT_PER_MIN,
  GEMINI_BASE_URL,
  GEMINI_DEFAULT_MODEL,
  GROQ_BASE_URL,
  GROQ_DEFAULT_MODEL,
  MYMEMORY_API_URL,
  RATE_LIMIT_WINDOW_MS,
  TRANSLATION_TIMEOUT_MS,
} from './constants';
import { logger } from './logger';
import { TRANSLATE_TO_ENGLISH_SYSTEM_PROMPT } from './prompts';

export interface TranslationResult {
  text: string;
  provider?: string;
  model?: string;
  isIdentical?: boolean;
}

export interface TranslatorConfig {
  geminiApiKey?: string;
  geminiModel?: string;
  groqApiKey?: string;
  groqModel?: string;
  deeplApiKey?: string;
  rateLimiter?: MinuteRateLimiter;
  timeoutMs?: number;
}

export class MinuteRateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly getLimit: () => number,
    private readonly windowMs: number = RATE_LIMIT_WINDOW_MS,
  ) {}

  allow(now = Date.now()): boolean {
    const limit = this.getLimit();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= limit) return false;
    this.timestamps.push(now);
    return true;
  }

  reset(): void {
    this.timestamps = [];
  }
}

export const llmTranslationLimiter = new MinuteRateLimiter(
  () => Number(process.env.RATE_LIMIT_LLM_TRANSLATION) || DEFAULT_LLM_TRANSLATION_LIMIT_PER_MIN,
);

export class QueryTranslator {
  constructor(private readonly config: TranslatorConfig = {}) {}

  private async translateViaLlm(text: string, signal: AbortSignal): Promise<TranslationResult | null> {
    const limiter = this.config.rateLimiter ?? llmTranslationLimiter;
    if (signal.aborted || !limiter.allow()) return null;

    const candidates: Array<{ name: string; baseURL: string; apiKey: string; model: string }> = [];
    const geminiKey = this.config.geminiApiKey ?? process.env.GEMINI_API_KEY;
    if (geminiKey) {
      candidates.push({
        name: 'gemini',
        baseURL: GEMINI_BASE_URL,
        apiKey: geminiKey,
        model: this.config.geminiModel ?? process.env.GEMINI_MODEL ?? GEMINI_DEFAULT_MODEL,
      });
    }

    const groqKey = this.config.groqApiKey ?? process.env.GROQ_API_KEY;
    if (groqKey) {
      candidates.push({
        name: 'groq',
        baseURL: GROQ_BASE_URL,
        apiKey: groqKey,
        model: this.config.groqModel ?? process.env.GROQ_MODEL ?? GROQ_DEFAULT_MODEL,
      });
    }

    for (const candidate of candidates) {
      if (signal.aborted) break;
      try {
        logger.debug({ provider: candidate.name, model: candidate.model }, 'Attempting LLM translation');
        const client = createOpenAI({ baseURL: candidate.baseURL, apiKey: candidate.apiKey });
        const { text: result } = await generateText({
          model: client.chat(candidate.model),
          system: TRANSLATE_TO_ENGLISH_SYSTEM_PROMPT,
          prompt: text,
          maxOutputTokens: 30,
          abortSignal: signal,
        });
        const cleaned = result?.trim().replace(/^["']|["']$/g, '');
        if (cleaned) {
          return { text: cleaned, provider: candidate.name, model: candidate.model };
        }
      } catch (err) {
        logger.warn({ provider: candidate.name, err }, 'LLM translation attempt failed');
      }
    }

    return null;
  }

  private async translateViaDeepL(text: string, signal: AbortSignal): Promise<TranslationResult | null> {
    const deeplKey = (this.config.deeplApiKey ?? process.env.DEEPL_API_KEY)?.trim();
    if (!deeplKey || signal.aborted) return null;

    try {
      logger.debug({ provider: 'deepl' }, 'Attempting DeepL translation');
      const endpoint = deeplKey.endsWith(':fx') ? DEEPL_FREE_API_URL : DEEPL_PRO_API_URL;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `DeepL-Auth-Key ${deeplKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: [text],
          target_lang: 'EN',
        }),
        signal,
      });

      if (res.ok) {
        const data = (await res.json()) as { translations?: Array<{ text: string }> };
        const translated = data.translations?.[0]?.text?.trim();
        if (translated) return { text: translated, provider: 'deepl' };
      }

      if (res.status === 400) {
        const errData = (await res.json().catch(() => null)) as { message?: string } | null;
        if (errData?.message?.toLowerCase().includes('equal')) {
          // Query is already in English; return original text directly without fallback.
          return { text, isIdentical: true };
        }
        logger.warn({ provider: 'deepl', status: res.status, err: errData }, 'DeepL translation rejected request');
      } else {
        logger.warn({ provider: 'deepl', status: res.status }, 'DeepL translation returned non-ok status');
      }
    } catch (err) {
      logger.warn({ provider: 'deepl', err }, 'DeepL translation attempt failed');
    }

    return null;
  }

  private async translateViaMyMemory(text: string, signal: AbortSignal): Promise<TranslationResult | null> {
    if (signal.aborted) return null;

    try {
      logger.debug({ provider: 'mymemory' }, 'Attempting MyMemory translation');
      const url = `${MYMEMORY_API_URL}?q=${encodeURIComponent(text)}&langpair=fr|en`;
      const res = await fetch(url, { signal });
      if (res.ok) {
        const data = (await res.json()) as { responseData?: { translatedText?: string } };
        const translated = data.responseData?.translatedText?.trim();
        if (translated) return { text: translated, provider: 'mymemory' };
      }
      logger.warn({ provider: 'mymemory', status: res.status }, 'MyMemory translation returned non-ok status');
    } catch (err) {
      logger.warn({ provider: 'mymemory', err }, 'MyMemory translation attempt failed');
    }

    return null;
  }

  async translate(text: string, signal?: AbortSignal): Promise<TranslationResult> {
    if (signal?.aborted) return { text };

    // Bound total translation budget to under 2.5s across all cascading providers.
    const timeoutMs = this.config.timeoutMs ?? TRANSLATION_TIMEOUT_MS;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    const llmResult = await this.translateViaLlm(text, combinedSignal);
    if (llmResult) return llmResult;
    if (combinedSignal.aborted) return { text };

    const deeplResult = await this.translateViaDeepL(text, combinedSignal);
    if (deeplResult) return deeplResult;
    if (combinedSignal.aborted) return { text };

    const myMemoryResult = await this.translateViaMyMemory(text, combinedSignal);
    if (myMemoryResult) return myMemoryResult;

    return { text };
  }
}
