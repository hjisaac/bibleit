import fs from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { app } from '../src/index';
import { API_ROUTES, TELEMETRY_HEADERS } from '@bibleit/engine';
import { StatusCodes } from 'http-status-codes';

describe('POST /api/v1/generate route end-to-end', () => {
  it('returns 400 when query parameter is missing', async () => {
    const res = await app.request(API_ROUTES.GENERATE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passages: [{ chunk: { id: 'c1', text: 'Text', book: 'JHN' } }] }),
    });

    assert.strictEqual(res.status, StatusCodes.BAD_REQUEST);
    const data = await res.json();
    assert.strictEqual(data.error, 'Missing "query" parameter');
  });

  it('returns 400 when passages array is empty and retrieval yields no passages', async () => {
    const res = await app.request(API_ROUTES.GENERATE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'unfindablexyz123nonsense', passages: [] }),
    });

    assert.strictEqual(res.status, StatusCodes.BAD_REQUEST);
    const data = await res.json();
    assert.strictEqual(data.error, 'No scripture passages available to answer question');
  });

  it('streams answer and attaches hyphenated PascalCase telemetry headers', async () => {
    process.env.GEMINI_API_KEY = 'mock_gemini';
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    const originalFetch = globalThis.fetch;
    const cassette = fs.readFileSync(new URL('./fixtures/gemini-stream-cassette.sse', import.meta.url), 'utf-8');

    globalThis.fetch = async () => {
      return new Response(cassette, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    };

    try {
      const res = await app.request(API_ROUTES.GENERATE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'What is love?',
          passages: [
            {
              chunk: {
                id: 'c1',
                book: '1JN',
                start: [4, 8],
                end: [4, 8],
                text: 'He who doesn’t love doesn’t know God, for God is love.',
              },
              score: 1.0,
              source: 'reference',
            },
          ],
        }),
      });

      assert.strictEqual(res.status, StatusCodes.OK);
      assert.strictEqual(res.headers.get(TELEMETRY_HEADERS.PROVIDER), 'gemini');
      assert.strictEqual(res.headers.get(TELEMETRY_HEADERS.MODEL), 'gemini-3.5-flash-lite');
      assert.strictEqual(res.headers.get(TELEMETRY_HEADERS.ATTEMPTS), '1');

      const bodyText = await res.text();
      assert.ok(bodyText.includes('God is love'), `Expected text to include 'God is love', got: ${bodyText}`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
