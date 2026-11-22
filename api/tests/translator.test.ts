import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { translateToEnglish } from '../src/translator';

describe('translateToEnglish', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.DEEPL_API_KEY;

  beforeEach(() => {
    delete process.env.DEEPL_API_KEY;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv !== undefined) {
      process.env.DEEPL_API_KEY = originalEnv;
    } else {
      delete process.env.DEEPL_API_KEY;
    }
  });

  it('translates via DeepL when DEEPL_API_KEY is configured', async () => {
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
    assert.strictEqual(result, 'peace in anxiety');
    assert.ok(calledUrl.includes('api-free.deepl.com'));
    assert.strictEqual(calledHeaders['Authorization'], 'DeepL-Auth-Key mock_key:fx');
  });

  it('falls back to MyMemory API when DEEPL_API_KEY is not set', async () => {
    let calledUrl = '';

    globalThis.fetch = async (input: RequestInfo | URL) => {
      calledUrl = String(input);
      return new Response(
        JSON.stringify({ responseData: { translatedText: 'peace in anxiety' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const result = await translateToEnglish("paix dans l'anxiété");
    assert.strictEqual(result, 'peace in anxiety');
    assert.ok(calledUrl.includes('api.mymemory.translated.net'));
  });

  it('gracefully returns the original query if translation fails', async () => {
    globalThis.fetch = async () => {
      throw new Error('Network error');
    };

    const result = await translateToEnglish("paix dans l'anxiété");
    assert.strictEqual(result, "paix dans l'anxiété");
  });
});
