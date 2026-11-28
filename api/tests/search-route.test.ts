import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { app } from '../src/index';
import { API_ROUTES } from '@bibleit/engine';
import { StatusCodes } from 'http-status-codes';

describe('POST /api/v1/search route', () => {
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

  it('POST: attaches query, translatedQuery, and translatedBy for French topical query', async () => {
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

    const res = await app.request(API_ROUTES.SEARCH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: "paix dans l'anxiété", locale: 'fr' }),
    });
    assert.strictEqual(res.status, StatusCodes.OK);

    const data = await res.json();
    assert.strictEqual(data.query, "paix dans l'anxiété");
    assert.strictEqual(data.translatedQuery, 'peace anxiety fear comfort');
    assert.strictEqual(data.translatedBy, 'gemini');
    assert.strictEqual(data.origin, 'remote');
  });

  it('POST: does not translate scripture reference in French queries', async () => {
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error('Should not fetch translation for reference');
    };

    const res = await app.request(API_ROUTES.SEARCH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'Jean 3:16', locale: 'fr' }),
    });
    assert.strictEqual(res.status, StatusCodes.OK);

    const data = await res.json();
    assert.strictEqual(data.query, 'Jean 3:16');
    assert.strictEqual(data.translatedQuery, undefined);
    assert.strictEqual(data.translatedBy, undefined);
    assert.strictEqual(data.translationBypassReason, 'scripture_reference');
    assert.strictEqual(fetchCalled, false);
  });

  it('POST: skips translation when translate=false is passed in body', async () => {
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error('Should not fetch translation when translate=false');
    };

    const res = await app.request(API_ROUTES.SEARCH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'paix', locale: 'fr', translate: false }),
    });
    assert.strictEqual(res.status, StatusCodes.OK);

    const data = await res.json();
    assert.strictEqual(data.query, 'paix');
    assert.strictEqual(data.translatedQuery, undefined);
    assert.strictEqual(data.translatedBy, undefined);
    assert.strictEqual(data.translationBypassReason, 'client_opt_out');
    assert.strictEqual(fetchCalled, false);
  });

  it('POST: scripture_reference takes precedence over translate=false', async () => {
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error('Should not fetch translation');
    };

    const res = await app.request(API_ROUTES.SEARCH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'Jean 3:16', locale: 'fr', translate: false }),
    });
    assert.strictEqual(res.status, StatusCodes.OK);

    const data = await res.json();
    assert.strictEqual(data.translationBypassReason, 'scripture_reference');
    assert.strictEqual(fetchCalled, false);
  });

  it('POST: preserves clientBypassReason sent in body', async () => {
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error('Should not fetch translation when client bypassed');
    };

    const res = await app.request(API_ROUTES.SEARCH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'peace in anxiety',
        locale: 'fr',
        translate: false,
        clientBypassReason: 'client_detected_english',
      }),
    });
    assert.strictEqual(res.status, StatusCodes.OK);

    const data = await res.json();
    assert.strictEqual(data.query, 'peace in anxiety');
    assert.strictEqual(data.translatedQuery, undefined);
    assert.strictEqual(data.translationBypassReason, 'client_detected_english');
    assert.strictEqual(fetchCalled, false);
  });

  it('POST: returns empty array for blank query', async () => {
    const res = await app.request(API_ROUTES.SEARCH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '   ' }),
    });
    assert.strictEqual(res.status, StatusCodes.OK);

    const data = await res.json();
    assert.deepStrictEqual(data.passages, []);
  });

  it('records english_identity bypass reason when DeepL returns 400 identical language', async () => {
    process.env.DEEPL_API_KEY = 'mock_key:fx';

    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({ message: 'Source and target language are equal.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const res = await app.request(API_ROUTES.SEARCH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'peace in anxiety', locale: 'fr' }),
    });
    assert.strictEqual(res.status, StatusCodes.OK);

    const data = await res.json();
    assert.strictEqual(data.query, 'peace in anxiety');
    assert.strictEqual(data.translatedQuery, undefined);
    assert.strictEqual(data.translationBypassReason, 'english_identity');
  });

  it('rejects GET requests with 404 Not Found', async () => {
    const res = await app.request(`${API_ROUTES.SEARCH}?query=love`);
    assert.strictEqual(res.status, StatusCodes.NOT_FOUND);
  });

  it('clamps k to MAX_SEARCH_K (15) when exceeded', async () => {
    const res = await app.request(API_ROUTES.SEARCH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'grace', k: 50 }),
    });
    assert.strictEqual(res.status, StatusCodes.OK);

    const data = await res.json();
    assert.ok(data.passages.length <= 15);
  });
});
