import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { app } from '../src/index';
import { API_ROUTES } from '@bibleit/engine';
import { StatusCodes } from 'http-status-codes';

describe('GET /api/v1/search route', () => {
  const originalFetch = globalThis.fetch;
  const originalGeminiKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.DEEPL_API_KEY;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalGeminiKey !== undefined) process.env.GEMINI_API_KEY = originalGeminiKey;
    else delete process.env.GEMINI_API_KEY;
  });

  it('attaches query, translatedQuery, and translatedBy for French topical query', async () => {
    process.env.GEMINI_API_KEY = 'test_key';

    globalThis.fetch = async () => {
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

    const res = await app.request(`${API_ROUTES.SEARCH}?q=paix%20dans%20l'anxi%C3%A9t%C3%A9&locale=fr`);
    assert.strictEqual(res.status, StatusCodes.OK);

    const data = await res.json();
    assert.strictEqual(data.query, "paix dans l'anxiété");
    assert.strictEqual(data.translatedQuery, 'peace anxiety fear comfort');
    assert.strictEqual(data.translatedBy, 'gemini');
    assert.strictEqual(data.origin, 'remote');
  });

  it('does not translate scripture reference in French queries', async () => {
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error('Should not fetch translation for reference');
    };

    const res = await app.request(`${API_ROUTES.SEARCH}?q=Jean%203:16&locale=fr`);
    assert.strictEqual(res.status, StatusCodes.OK);

    const data = await res.json();
    assert.strictEqual(data.query, 'Jean 3:16');
    assert.strictEqual(data.translatedQuery, undefined);
    assert.strictEqual(data.translatedBy, undefined);
    assert.strictEqual(fetchCalled, false);
  });

  it('skips translation when translate=false parameter is passed', async () => {
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error('Should not fetch translation when translate=false');
    };

    const res = await app.request(`${API_ROUTES.SEARCH}?q=paix&locale=fr&translate=false`);
    assert.strictEqual(res.status, StatusCodes.OK);

    const data = await res.json();
    assert.strictEqual(data.query, 'paix');
    assert.strictEqual(data.translatedQuery, undefined);
    assert.strictEqual(data.translatedBy, undefined);
    assert.strictEqual(fetchCalled, false);
  });
});
