import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { translateToEnglish, llmTranslationLimiter } from '../src/translator';

describe('translateToEnglish', () => {
  const originalFetch = globalThis.fetch;
  const originalDeeplEnv = process.env.DEEPL_API_KEY;
  const originalGeminiEnv = process.env.GEMINI_API_KEY;
  const originalGroqEnv = process.env.GROQ_API_KEY;

  beforeEach(() => {
    delete process.env.DEEPL_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    llmTranslationLimiter.reset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalDeeplEnv !== undefined) process.env.DEEPL_API_KEY = originalDeeplEnv;
    else delete process.env.DEEPL_API_KEY;

    if (originalGeminiEnv !== undefined) process.env.GEMINI_API_KEY = originalGeminiEnv;
    else delete process.env.GEMINI_API_KEY;

    if (originalGroqEnv !== undefined) process.env.GROQ_API_KEY = originalGroqEnv;
    else delete process.env.GROQ_API_KEY;
  });

  it('translates and refines via Gemini when GEMINI_API_KEY is configured', async () => {
    process.env.GEMINI_API_KEY = 'test_gemini_key';
    let calledUrl = '';

    globalThis.fetch = async (input: RequestInfo | URL) => {
      calledUrl = String(input);
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-test',
          created: 12345678,
          model: 'gemini-3.5-flash-lite',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'peace anxiety fear comfort' },
              finish_reason: 'stop',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const result = await translateToEnglish("paix dans l'anxiété");
    assert.strictEqual(result.text, 'peace anxiety fear comfort');
    assert.strictEqual(result.provider, 'gemini');
    assert.ok(calledUrl.includes('generativelanguage.googleapis.com'));
  });

  it('degrades to DeepL when LLM rate limit is reached', async () => {
    process.env.GEMINI_API_KEY = 'test_gemini_key';
    process.env.DEEPL_API_KEY = 'mock_key:fx';
    process.env.RATE_LIMIT_LLM_TRANSLATION = '1';

    let geminiCalls = 0;
    let deeplCalls = 0;

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('generativelanguage.googleapis.com')) {
        geminiCalls++;
        return new Response(
          JSON.stringify({
            id: 'chatcmpl-test',
            created: 12345678,
            model: 'gemini-3.5-flash-lite',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'peace anxiety' },
                finish_reason: 'stop',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('deepl.com')) {
        deeplCalls++;
        return new Response(
          JSON.stringify({ translations: [{ text: 'peace in anxiety' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected url: ${url}`);
    };

    // First call: allowed by LLM limiter
    const res1 = await translateToEnglish("paix dans l'anxiété");
    assert.strictEqual(res1.provider, 'gemini');
    assert.strictEqual(geminiCalls, 1);

    // Second call: exceeds limit of 1 per min, falls back to DeepL
    const res2 = await translateToEnglish("paix dans l'anxiété");
    assert.strictEqual(res2.provider, 'deepl');
    assert.strictEqual(res2.text, 'peace in anxiety');
    assert.strictEqual(deeplCalls, 1);

    delete process.env.RATE_LIMIT_LLM_TRANSLATION;
  });

  it('translates via DeepL when no LLM key is configured', async () => {
    process.env.DEEPL_API_KEY = 'mock_key:fx';
    let calledUrl = '';
    let calledHeaders: Record<string, string> = {};

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      calledUrl = String(input);
      calledHeaders = (init?.headers as Record<string, string>) || {};
      return new Response(
        JSON.stringify({ translations: [{ text: 'peace in anxiety' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const result = await translateToEnglish("paix dans l'anxiété");
    assert.strictEqual(result.text, 'peace in anxiety');
    assert.strictEqual(result.provider, 'deepl');
    assert.ok(calledUrl.includes('api-free.deepl.com'));
    assert.strictEqual(calledHeaders['Authorization'], 'DeepL-Auth-Key mock_key:fx');
  });

  it('returns text as-is when DeepL detects identical source and target language (HTTP 400)', async () => {
    process.env.DEEPL_API_KEY = 'mock_key:fx';

    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({ message: 'Source and target language are equal.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const result = await translateToEnglish('peace in anxiety');
    assert.strictEqual(result.text, 'peace in anxiety');
    assert.strictEqual(result.provider, undefined);
  });

  it('falls back to MyMemory API when neither LLM nor DeepL is configured', async () => {
    let calledUrl = '';

    globalThis.fetch = async (input: RequestInfo | URL) => {
      calledUrl = String(input);
      return new Response(
        JSON.stringify({ responseData: { translatedText: 'peace in anxiety' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const result = await translateToEnglish("paix dans l'anxiété");
    assert.strictEqual(result.text, 'peace in anxiety');
    assert.strictEqual(result.provider, 'mymemory');
    assert.ok(calledUrl.includes('api.mymemory.translated.net'));
  });

  it('gracefully returns the original query if translation fails', async () => {
    globalThis.fetch = async () => {
      throw new Error('Network error');
    };

    const result = await translateToEnglish("paix dans l'anxiété");
    assert.strictEqual(result.text, "paix dans l'anxiété");
    assert.strictEqual(result.provider, undefined);
  });
});
