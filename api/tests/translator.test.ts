import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { QueryTranslator, MinuteRateLimiter } from '../src/translator';

describe('QueryTranslator', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('translates and refines via Gemini when geminiApiKey is configured', async () => {
    let calledUrl = '';
    let calledBody = '';

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      calledUrl = String(input);
      calledBody = String(init?.body || '');
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-test',
          created: 12345678,
          model: 'gemini-3.5-flash-lite',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'peace in anxiety' },
              finish_reason: 'stop',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const translator = new QueryTranslator({ geminiApiKey: 'test_gemini_key' });
    const result = await translator.translate("paix dans l'anxiété");
    assert.strictEqual(result.text, 'peace in anxiety');
    assert.strictEqual(result.provider, 'gemini');
    assert.ok(calledUrl.includes('generativelanguage.googleapis.com'));
    assert.ok(calledBody.includes('natural English search query'));
    assert.ok(!calledBody.includes('concise English keywords'));
  });

  it('degrades to DeepL when LLM rate limit is reached', async () => {
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

    const limiter = new MinuteRateLimiter(() => 1);
    const translator = new QueryTranslator({
      geminiApiKey: 'test_gemini_key',
      deeplApiKey: 'mock_key:fx',
      rateLimiter: limiter,
    });

    // First call: allowed by LLM limiter
    const res1 = await translator.translate("paix dans l'anxiété");
    assert.strictEqual(res1.provider, 'gemini');
    assert.strictEqual(geminiCalls, 1);

    // Second call: exceeds limit of 1 per min, falls back to DeepL
    const res2 = await translator.translate("paix dans l'anxiété");
    assert.strictEqual(res2.provider, 'deepl');
    assert.strictEqual(res2.text, 'peace in anxiety');
    assert.strictEqual(deeplCalls, 1);
  });

  it('translates via DeepL when no LLM key is configured', async () => {
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

    const translator = new QueryTranslator({ deeplApiKey: 'mock_key:fx' });
    const result = await translator.translate("paix dans l'anxiété");
    assert.strictEqual(result.text, 'peace in anxiety');
    assert.strictEqual(result.provider, 'deepl');
    assert.ok(calledUrl.includes('api-free.deepl.com'));
    assert.strictEqual(calledHeaders['Authorization'], 'DeepL-Auth-Key mock_key:fx');
  });

  it('returns text as-is when DeepL detects identical source and target language (HTTP 400)', async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({ message: 'Source and target language are equal.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const translator = new QueryTranslator({ deeplApiKey: 'mock_key:fx' });
    const result = await translator.translate('peace in anxiety');
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

    const translator = new QueryTranslator({});
    const result = await translator.translate("paix dans l'anxiété");
    assert.strictEqual(result.text, 'peace in anxiety');
    assert.strictEqual(result.provider, 'mymemory');
    assert.ok(calledUrl.includes('api.mymemory.translated.net'));
  });

  it('gracefully returns the original query if translation fails', async () => {
    globalThis.fetch = async () => {
      throw new Error('Network error');
    };

    const translator = new QueryTranslator({});
    const result = await translator.translate("paix dans l'anxiété");
    assert.strictEqual(result.text, "paix dans l'anxiété");
    assert.strictEqual(result.provider, undefined);
  });

  it('returns original query immediately if incoming signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response('{}', { status: 200 });
    };

    const translator = new QueryTranslator({});
    const result = await translator.translate("paix dans l'anxiété", controller.signal);
    assert.strictEqual(result.text, "paix dans l'anxiété");
    assert.strictEqual(result.provider, undefined);
    assert.strictEqual(fetchCalled, false);
  });

  it('skips subsequent providers if signal is aborted during first provider attempt', async () => {
    const controller = new AbortController();
    let deeplCalled = false;

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('generativelanguage.googleapis.com')) {
        controller.abort();
        throw new Error('Aborted');
      }
      if (url.includes('deepl.com')) {
        deeplCalled = true;
        return new Response(JSON.stringify({ translations: [{ text: 'peace' }] }), { status: 200 });
      }
      throw new Error(`Unexpected url: ${url}`);
    };

    const translator = new QueryTranslator({
      geminiApiKey: 'test_gemini_key',
      deeplApiKey: 'mock_key:fx',
    });
    const result = await translator.translate("paix dans l'anxiété", controller.signal);
    assert.strictEqual(result.text, "paix dans l'anxiété");
    assert.strictEqual(deeplCalled, false);
  });
});
