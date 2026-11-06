import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerSlmAnswerProvider } from '../src/adapters/worker-slm-answer-provider';
import type { RetrievalResult } from '../src/core/types';

describe('WorkerSlmAnswerProvider', () => {
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

  it('reports available when Web Workers are supported', () => {
    vi.stubGlobal('Worker', class {});
    const provider = new WorkerSlmAnswerProvider();
    expect(provider.available).toBe(true);
  });

  it('reports unavailable when Web Workers are not supported', () => {
    vi.stubGlobal('Worker', undefined);
    const provider = new WorkerSlmAnswerProvider();
    expect(provider.available).toBe(false);
  });

  it('yields nothing if context passages are empty', async () => {
    const provider = new WorkerSlmAnswerProvider();
    const emptyContext: RetrievalResult = { passages: [], parsedRefs: [] };

    const chunks: string[] = [];
    for await (const chunk of provider.answer('query', emptyContext)) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual([]);
  });

  it('streams tokens from worker and invokes onMeta', async () => {
    const postMessageSpy = vi.fn();
    class MockWorker {
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: ((e: any) => void) | null = null;
      postMessage(msg: any) {
        postMessageSpy(msg);
        if (msg.type === 'generate') {
          setTimeout(() => {
            this.onmessage?.({ data: { type: 'token', id: msg.id, token: 'Faith ' } } as MessageEvent);
            this.onmessage?.({ data: { type: 'token', id: msg.id, token: 'and love.' } } as MessageEvent);
            this.onmessage?.({ data: { type: 'done', id: msg.id } } as MessageEvent);
          }, 0);
        }
      }
      terminate() {}
    }

    vi.stubGlobal('Worker', MockWorker);

    const provider = new WorkerSlmAnswerProvider();
    const metaSpy = vi.fn();

    const chunks: string[] = [];
    for await (const chunk of provider.answer('What is faith?', mockContext, metaSpy)) {
      chunks.push(chunk);
    }

    expect(metaSpy).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'local', model: 'SmolLM2-360M' }),
    );
    expect(chunks).toEqual(['Faith ', 'and love.']);
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'generate', query: 'What is faith?' }),
    );
  });
});
