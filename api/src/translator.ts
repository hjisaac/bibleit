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

export interface TranslationResult {
  text: string;
  provider?: string;
  model?: string;
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

const LLM_TRANSLATE_SYSTEM =
  'Translate this French Bible search query into concise English keywords for Bible passage retrieval. Output ONLY the English keywords, without explanation or punctuation.';

async function translateViaLlm(text: string): Promise<TranslationResult | null> {
  if (!llmTranslationLimiter.allow()) return null;

  const candidates: Array<{ name: string; baseURL: string; apiKey: string; model: string }> = [];
  if (process.env.GEMINI_API_KEY) {
    candidates.push({
      name: 'gemini',
      baseURL: GEMINI_BASE_URL,
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL,
    });
  }
  if (process.env.GROQ_API_KEY) {
    candidates.push({
      name: 'groq',
      baseURL: GROQ_BASE_URL,
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL,
    });
  }

  for (const candidate of candidates) {
    try {
      const client = createOpenAI({ baseURL: candidate.baseURL, apiKey: candidate.apiKey });
      const { text: result } = await generateText({
        model: client.chat(candidate.model),
        system: LLM_TRANSLATE_SYSTEM,
        prompt: text,
        maxOutputTokens: 30,
        abortSignal: AbortSignal.timeout(TRANSLATION_TIMEOUT_MS),
      });
      const cleaned = result?.trim().replace(/^["']|["']$/g, '');
      if (cleaned) {
        return { text: cleaned, provider: candidate.name, model: candidate.model };
      }
    } catch {
      // Degrade to next candidate.
    }
  }

  return null;
}

async function translateViaDeepL(text: string): Promise<TranslationResult | null> {
  const deeplKey = process.env.DEEPL_API_KEY?.trim();
  if (!deeplKey) return null;

  try {
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
      signal: AbortSignal.timeout(TRANSLATION_TIMEOUT_MS),
    });

    if (res.ok) {
      const data = (await res.json()) as { translations?: Array<{ text: string }> };
      const translated = data.translations?.[0]?.text?.trim();
      if (translated) return { text: translated, provider: 'deepl' };
    }
  } catch {
    // Degrade to free fallback.
  }

  return null;
}

async function translateViaMyMemory(text: string): Promise<TranslationResult | null> {
  try {
    const url = `${MYMEMORY_API_URL}?q=${encodeURIComponent(text)}&langpair=fr|en`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TRANSLATION_TIMEOUT_MS) });
    if (res.ok) {
      const data = (await res.json()) as { responseData?: { translatedText?: string } };
      const translated = data.responseData?.translatedText?.trim();
      if (translated) return { text: translated, provider: 'mymemory' };
    }
  } catch {
    // Degrade to original query.
  }

  return null;
}

export async function translateToEnglish(text: string): Promise<TranslationResult> {
  const llmResult = await translateViaLlm(text);
  if (llmResult) return llmResult;

  const deeplResult = await translateViaDeepL(text);
  if (deeplResult) return deeplResult;

  const myMemoryResult = await translateViaMyMemory(text);
  if (myMemoryResult) return myMemoryResult;

  return { text };
}
