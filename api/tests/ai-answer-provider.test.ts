import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseCooldownMs, AiAnswerProvider } from '../src/adapters/ai-answer-provider';

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
  it('rotates healthy providers round-robin across calls', () => {
    process.env.GROQ_API_KEY = 'mock_groq';
    process.env.GEMINI_API_KEY = 'mock_gemini';
    process.env.OPENROUTER_API_KEY = 'mock_openrouter';

    const provider = new AiAnswerProvider();

    // Call 1: Starts at index 0 (groq)
    const list1 = provider.getCandidateList();
    assert.strictEqual(list1[0]?.name, 'groq');
    assert.strictEqual(list1[1]?.name, 'gemini');
    assert.strictEqual(list1[2]?.name, 'openrouter');

    // Call 2: Rotates to index 1 (gemini)
    const list2 = provider.getCandidateList();
    assert.strictEqual(list2[0]?.name, 'gemini');
    assert.strictEqual(list2[1]?.name, 'openrouter');
    assert.strictEqual(list2[2]?.name, 'groq');

    // Call 3: Rotates to index 2 (openrouter)
    const list3 = provider.getCandidateList();
    assert.strictEqual(list3[0]?.name, 'openrouter');
    assert.strictEqual(list3[1]?.name, 'groq');
    assert.strictEqual(list3[2]?.name, 'gemini');
  });

  it('bypasses provider on cooldown and recovers seamlessly', () => {
    process.env.GROQ_API_KEY = 'mock_groq';
    process.env.GEMINI_API_KEY = 'mock_gemini';

    const provider = new AiAnswerProvider();

    // Mark Groq on cooldown
    provider.markCooldown('groq', { responseHeaders: { 'retry-after': '60' } });

    // Groq is skipped; Gemini is selected first
    const list = provider.getCandidateList();
    assert.strictEqual(list[0]?.name, 'gemini');
  });
});
