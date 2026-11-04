import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseCooldownMs, AiAnswerProvider } from '../src/adapters/ai-answer-provider';
import { TELEMETRY_HEADERS } from '@bibleit/engine';

describe('parseCooldownMs', () => {
  it('parses standard RFC retry-after header (Groq, Mistral)', () => {
    const err = { responseHeaders: { 'retry-after': '15' } };
    assert.strictEqual(parseCooldownMs(err), 15000);
  });

  it('parses OpenRouter x-ratelimit-reset unix timestamp header', () => {
    const futureUnix = Math.floor(Date.now() / 1000) + 20;
    const err = { responseHeaders: { 'x-ratelimit-reset': String(futureUnix) } };
    const cooldown = parseCooldownMs(err);
    assert.ok(cooldown >= 18000 && cooldown <= 21000, `Expected ~20s, got ${cooldown}`);
  });

  it('parses Gemini JSON error message containing "retry in Xs"', () => {
    const err = { message: 'Quota exceeded. Please retry in 34.07s.' };
    assert.strictEqual(parseCooldownMs(err), 35000);
  });

  it('applies safe default cooldown (30-35s) when no header or message exists', () => {
    const err = new Error('Unknown error');
    const cooldown = parseCooldownMs(err);
    assert.ok(cooldown >= 30000 && cooldown <= 35000);
  });
});

describe('AiAnswerProvider candidate list and rotation', () => {
  it('rotates Tier 1 providers round-robin and reserves Tier 2 providers', () => {
    process.env.GROQ_API_KEY = 'mock_groq';
    process.env.GEMINI_API_KEY = 'mock_gemini';
    process.env.OPENROUTER_API_KEY = 'mock_openrouter';

    const provider = new AiAnswerProvider();

    // Call 1: Starts at index 0 of Tier 1 (groq), Tier 2 (openrouter) placed at end
    const list1 = provider.getCandidateList();
    assert.strictEqual(list1[0]?.name, 'groq');
    assert.strictEqual(list1[1]?.name, 'gemini');
    assert.strictEqual(list1[2]?.name, 'openrouter');

    // Call 2: Rotates to index 1 of Tier 1 (gemini), Tier 2 (openrouter) remains reserve
    const list2 = provider.getCandidateList();
    assert.strictEqual(list2[0]?.name, 'gemini');
    assert.strictEqual(list2[1]?.name, 'groq');
    assert.strictEqual(list2[2]?.name, 'openrouter');
  });

  it('bypasses provider on cooldown and promotes Tier 2 when Tier 1 is exhausted', () => {
    process.env.GROQ_API_KEY = 'mock_groq';
    process.env.GEMINI_API_KEY = 'mock_gemini';
    process.env.OPENROUTER_API_KEY = 'mock_openrouter';

    const provider = new AiAnswerProvider();

    // Cool down both Tier 1 providers
    provider.markCooldown('groq', { responseHeaders: { 'retry-after': '60' } });
    provider.markCooldown('gemini', { responseHeaders: { 'retry-after': '60' } });

    // Tier 2 (openrouter) is selected first
    const list = provider.getCandidateList();
    assert.strictEqual(list[0]?.name, 'openrouter');
  });

  it('reports live provider statuses and cooldown countdowns', () => {
    process.env.GROQ_API_KEY = 'mock_groq';
    process.env.GEMINI_API_KEY = 'mock_gemini';
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    delete process.env.COHERE_API_KEY;

    const provider = new AiAnswerProvider();
    provider.markCooldown('groq', { responseHeaders: { 'retry-after': '30' } });

    const statuses = provider.getProviderStatuses();
    const groqStatus = statuses.find((s) => s.name === 'groq');
    const geminiStatus = statuses.find((s) => s.name === 'gemini');

    assert.strictEqual(groqStatus?.status, 'cooldown');
    assert.ok(
      groqStatus?.cooldownRemainingSec && groqStatus.cooldownRemainingSec >= 25,
      `Expected ~30s, got ${groqStatus?.cooldownRemainingSec}`,
    );
    assert.strictEqual(geminiStatus?.status, 'healthy');
  });

  it('does not cool down provider on client AbortError', () => {
    const provider = new AiAnswerProvider();
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    provider.markCooldown('groq', abortErr);

    const statuses = provider.getProviderStatuses();
    const groq = statuses.find((s) => s.name === 'groq');
    assert.strictEqual(groq?.status, 'healthy');
  });

  it('fails over to next provider in streamResponse when first provider fails', async () => {
    process.env.GROQ_API_KEY = 'mock_groq';
    process.env.GEMINI_API_KEY = 'mock_gemini';
    delete process.env.OPENROUTER_API_KEY;

    const originalFetch = globalThis.fetch;
    const fetchCalls: string[] = [];

    globalThis.fetch = async (url: string | URL | Request) => {
      const urlStr = url.toString();
      fetchCalls.push(urlStr);

      // Groq endpoint fails with 429
      if (urlStr.includes('api.groq.com')) {
        return new Response(JSON.stringify({ error: { message: 'rate limit exceeded' } }), {
          status: 429,
          headers: { 'retry-after': '60', 'content-type': 'application/json' },
        });
      }

      // Gemini endpoint succeeds with SSE stream
      return new Response(
        'data: {"choices":[{"index":0,"delta":{"content":"God is love"}}]}\n\ndata: [DONE]\n\n',
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );
    };

    try {
      const provider = new AiAnswerProvider();
      const mockPassage = {
        chunk: { id: 'c1', book: 'JHN', start: [3, 16] as [number, number], end: [3, 16] as [number, number], text: 'For God so loved the world' },
        score: 1,
        source: 'reference' as const,
      };

      const res = await provider.streamResponse('Who is God?', [mockPassage]);

      // Headers reflect successful fallback to gemini on attempt 2
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get(TELEMETRY_HEADERS.PROVIDER), 'gemini');
      assert.strictEqual(res.headers.get(TELEMETRY_HEADERS.ATTEMPTS), '2');

      // Body contains streamed chunk
      const text = await res.text();
      assert.ok(text.includes('God is love'), `Expected text to include 'God is love', got ${text}`);

      // Groq is marked on cooldown
      const groqStatus = provider.getProviderStatuses().find((s) => s.name === 'groq');
      assert.strictEqual(groqStatus?.status, 'cooldown');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
