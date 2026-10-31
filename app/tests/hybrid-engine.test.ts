import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HybridEngine } from '../src/adapters/hybrid-engine';
import type { RetrievalResult, SearchEngine } from '@bibleit/engine';

describe('HybridEngine', () => {
  const mockLocalResult: RetrievalResult = {
    passages: [
      {
        chunk: { book: 'JHN', start: [3, 16], end: [3, 16], text: 'For God so loved the world' },
        score: 1.0,
        source: 'reference',
      },
    ],
    parsedRefs: [],
  };

  const mockRemoteResult: RetrievalResult = {
    passages: [
      {
        chunk: { book: 'JHN', start: [3, 16], end: [3, 16], text: 'Remote API: For God so loved the world' },
        score: 0.95,
        source: 'semantic',
      },
    ],
    parsedRefs: [],
  };

  let mockLocalEngine: SearchEngine;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockLocalEngine = {
      ready: Promise.resolve(),
      answers: { available: false, answer: async function* () {} },
      retrieve: vi.fn().mockResolvedValue(mockLocalResult),
    };
  });

  it('delegates to remote API when online and healthy', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockRemoteResult,
    } as Response);

    const engine = new HybridEngine(mockLocalEngine, 'https://api.bibleit.test');
    const result = await engine.retrieve('love');

    expect(result.passages[0]?.chunk.text).toContain('Remote API');
    expect(mockLocalEngine.retrieve).not.toHaveBeenCalled();
  });

  it('falls back to localEngine when remote fetch rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const engine = new HybridEngine(mockLocalEngine, 'https://api.bibleit.test');
    const result = await engine.retrieve('love');

    expect(result.passages[0]?.chunk.text).toContain('For God so loved the world');
    expect(mockLocalEngine.retrieve).toHaveBeenCalledWith('love', 10);
  });

  it('falls back to localEngine when remote API returns HTTP 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const engine = new HybridEngine(mockLocalEngine, 'https://api.bibleit.test');
    const result = await engine.retrieve('love');

    expect(mockLocalEngine.retrieve).toHaveBeenCalledWith('love', 10);
    expect(result.passages[0]?.chunk.text).toContain('For God so loved the world');
  });

  it('calls localEngine directly without network call when remoteUrl is omitted', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const engine = new HybridEngine(mockLocalEngine, null);
    const result = await engine.retrieve('love');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockLocalEngine.retrieve).toHaveBeenCalledWith('love', 10);
    expect(result).toEqual(mockLocalResult);
  });

  it('bypasses remote fetch when isDeviceOnly callback returns true', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const engine = new HybridEngine(mockLocalEngine, 'https://api.bibleit.test', () => true);
    const result = await engine.retrieve('love');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockLocalEngine.retrieve).toHaveBeenCalledWith('love', 10);
    expect(result.passages[0]?.chunk.text).toContain('For God so loved the world');
  });

  it('falls back to localEngine when remote API times out after 3000ms', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce((_url, init) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The user aborted a request.', 'AbortError'));
        });
      });
    });

    const engine = new HybridEngine(mockLocalEngine, 'https://api.bibleit.test');
    const retrievePromise = engine.retrieve('love');
    await vi.advanceTimersByTimeAsync(3100);
    const result = await retrievePromise;

    expect(mockLocalEngine.retrieve).toHaveBeenCalledWith('love', 10);
    expect(result.passages[0]?.chunk.text).toContain('For God so loved the world');
    vi.useRealTimers();
  });

  it('falls back to localEngine when remote response has no passages array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: 'Service Unavailable' }),
    } as Response);

    const engine = new HybridEngine(mockLocalEngine, 'https://api.bibleit.test');
    const result = await engine.retrieve('love');

    expect(mockLocalEngine.retrieve).toHaveBeenCalledWith('love', 10);
    expect(result.passages[0]?.chunk.text).toContain('For God so loved the world');
  });

  it('bypasses remote fetch when navigator is offline', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const onLineSpy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    const engine = new HybridEngine(mockLocalEngine, 'https://api.bibleit.test');
    const result = await engine.retrieve('love');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockLocalEngine.retrieve).toHaveBeenCalledWith('love', 10);
    expect(result.passages[0]?.chunk.text).toContain('For God so loved the world');
    onLineSpy.mockRestore();
  });

  it('calls localEngine directly without network call when remoteUrl is empty string', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const engine = new HybridEngine(mockLocalEngine, '   ');
    const result = await engine.retrieve('love');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockLocalEngine.retrieve).toHaveBeenCalledWith('love', 10);
    expect(result).toEqual(mockLocalResult);
  });
});
