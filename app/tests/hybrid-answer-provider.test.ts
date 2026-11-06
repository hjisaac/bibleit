import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HybridAnswerProvider } from '../src/adapters/hybrid-answer-provider';
import type { AnswerProvider } from '../src/core/ports';
import type { RetrievalResult } from '../src/core/types';

describe('HybridAnswerProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockContext: RetrievalResult = {
    passages: [
      {
        chunk: { book: 'JHN', start: [3, 16], end: [3, 16], text: 'For God so loved the world' },
        score: 1.0,
        source: 'reference',
      },
    ],
    parsedRefs: [],
  };

  it('reports available if remote is available', () => {
    const remote: AnswerProvider = { available: true, answer: async function* () {} };
    const local: AnswerProvider = { available: false, answer: async function* () {} };
    const hybrid = new HybridAnswerProvider(remote, local);
    expect(hybrid.available).toBe(true);
  });

  it('reports available if local is available even when remote is null or unavailable', () => {
    const local: AnswerProvider = { available: true, answer: async function* () {} };
    const hybrid = new HybridAnswerProvider(null, local);
    expect(hybrid.available).toBe(true);
  });

  it('reports strictly local availability when device-only mode is active', () => {
    const remote: AnswerProvider = { available: true, answer: async function* () {} };
    const local: AnswerProvider = { available: false, answer: async function* () {} };
    const hybrid = new HybridAnswerProvider(remote, local, () => true);
    expect(hybrid.available).toBe(false);
  });

  it('streams from remote when online and healthy', async () => {
    const remote: AnswerProvider = {
      available: true,
      answer: async function* () {
        yield 'Remote ';
        yield 'response';
      },
    };
    const local: AnswerProvider = {
      available: true,
      answer: async function* () {
        yield 'Local response';
      },
    };
    const hybrid = new HybridAnswerProvider(remote, local);
    const chunks: string[] = [];
    for await (const chunk of hybrid.answer('query', mockContext)) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(['Remote ', 'response']);
  });

  it('falls back to local when remote throws mid-stream or rejects', async () => {
    const remote: AnswerProvider = {
      available: true,
      answer: async function* () {
        throw new Error('Remote failed');
      },
    };
    const local: AnswerProvider = {
      available: true,
      answer: async function* () {
        yield 'Local ';
        yield 'fallback';
      },
    };
    const hybrid = new HybridAnswerProvider(remote, local);
    const chunks: string[] = [];
    for await (const chunk of hybrid.answer('query', mockContext)) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(['Local ', 'fallback']);
  });

  it('bypasses remote directly in device-only mode', async () => {
    const remoteAnswer = vi.fn();
    const remote: AnswerProvider = {
      available: true,
      answer: remoteAnswer,
    };
    const local: AnswerProvider = {
      available: true,
      answer: async function* () {
        yield 'Local only';
      },
    };
    const hybrid = new HybridAnswerProvider(remote, local, () => true);
    const chunks: string[] = [];
    for await (const chunk of hybrid.answer('query', mockContext)) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(['Local only']);
    expect(remoteAnswer).not.toHaveBeenCalled();
  });
});
