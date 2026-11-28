import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHybridEngine } from '../src/adapters/hybrid-engine';
import { RemoteEngine } from '../src/adapters/remote-engine';
import { HttpAnswerProvider } from '../src/adapters/http-answer-provider';
import type { AnswerProvider, SearchEngine } from '../src/core/ports';
import { SearchOriginEnum, type RetrievalResult } from '../src/core/types';
import { API_ROUTES } from '@bibleit/engine';

describe('createHybridEngine & RemoteEngine', () => {
  const mockLocalResult: RetrievalResult = {
    passages: [
      {
        chunk: { book: 'JHN', start: [3, 16], end: [3, 16], text: 'For God so loved the world' },
        score: 1.0,
        source: 'reference',
      },
    ],
    parsedRefs: [],
    origin: SearchOriginEnum.LOCAL,
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
      answerProvider: { available: false, answer: async function* () {} },
      retrieve: vi.fn().mockResolvedValue(mockLocalResult),
    };
  });

  const createManager = (
    remoteUrl: string | null,
    isDeviceOnly?: () => boolean,
    getLocale?: () => string,
  ) => {
    const cleanUrl = remoteUrl?.trim().replace(/\/+$/, '');
    const remote = cleanUrl
      ? new RemoteEngine(cleanUrl, new HttpAnswerProvider(cleanUrl, isDeviceOnly), getLocale)
      : null;
    return createHybridEngine(remote, mockLocalEngine, isDeviceOnly, getLocale);
  };

  it('delegates to RemoteEngine when online and healthy', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockRemoteResult,
    } as Response);

    const engine = createManager('https://api.bibleit.test');
    const result = await engine.retrieve('love');

    expect(result.passages[0]?.chunk.text).toContain('Remote API');
    expect(result.origin).toBe(SearchOriginEnum.REMOTE);
    expect(mockLocalEngine.retrieve).not.toHaveBeenCalled();
  });

  it('falls back to localEngine when remote fetch rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const engine = createManager('https://api.bibleit.test');
    const result = await engine.retrieve('love');

    expect(result.passages[0]?.chunk.text).toContain('For God so loved the world');
    expect(result.origin).toBe(SearchOriginEnum.LOCAL);
    expect(result.fallbackReason).toBe('error');
    expect(mockLocalEngine.retrieve).toHaveBeenCalledWith('love', 10);
  });

  it('falls back to localEngine when remote API returns HTTP 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const engine = createManager('https://api.bibleit.test');
    const result = await engine.retrieve('love');

    expect(mockLocalEngine.retrieve).toHaveBeenCalledWith('love', 10);
    expect(result.passages[0]?.chunk.text).toContain('For God so loved the world');
  });

  it('returns localEngine directly without network call when remoteEngine is null', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const engine = createManager(null);
    expect(engine).toBe(mockLocalEngine);
    const result = await engine.retrieve('love');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockLocalEngine.retrieve).toHaveBeenCalledWith('love');
    expect(result).toEqual(mockLocalResult);
  });

  it('bypasses remote fetch when isDeviceOnly callback returns true', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const engine = createManager('https://api.bibleit.test', () => true);
    const result = await engine.retrieve('love');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockLocalEngine.retrieve).toHaveBeenCalledWith('love', 10);
    expect(result.passages[0]?.chunk.text).toContain('For God so loved the world');
  });

  it('falls back to localEngine when remote API times out after 4000ms', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce((_url, init) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The user aborted a request.', 'AbortError'));
        });
      });
    });

    const engine = createManager('https://api.bibleit.test');
    const retrievePromise = engine.retrieve('love');
    await vi.advanceTimersByTimeAsync(4100);
    const result = await retrievePromise;

    expect(mockLocalEngine.retrieve).toHaveBeenCalledWith('love', 10);
    expect(result.passages[0]?.chunk.text).toContain('For God so loved the world');
    expect(result.fallbackReason).toBe('timeout');
    vi.useRealTimers();
  });

  it('falls back to localEngine when remote response has no passages array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: 'Service Unavailable' }),
    } as Response);

    const engine = createManager('https://api.bibleit.test');
    const result = await engine.retrieve('love');

    expect(mockLocalEngine.retrieve).toHaveBeenCalledWith('love', 10);
    expect(result.passages[0]?.chunk.text).toContain('For God so loved the world');
  });

  it('bypasses remote fetch when navigator is offline', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const onLineSpy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    const engine = createManager('https://api.bibleit.test');
    const result = await engine.retrieve('love');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockLocalEngine.retrieve).toHaveBeenCalledWith('love', 10);
    expect(result.passages[0]?.chunk.text).toContain('For God so loved the world');
    onLineSpy.mockRestore();
  });

  it('returns localEngine directly without network call when remoteUrl is whitespace', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const engine = createManager('   ');
    expect(engine).toBe(mockLocalEngine);
    const result = await engine.retrieve('love');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockLocalEngine.retrieve).toHaveBeenCalledWith('love');
    expect(result).toEqual(mockLocalResult);
  });

  it('wires remote answerProvider when RemoteEngine is present', () => {
    const engine = createManager('https://api.bibleit.test');
    expect(engine.answerProvider.available).toBe(true);
  });

  it('delegates answers to localEngine when RemoteEngine is not configured', () => {
    const engine = createManager(null);
    expect(engine.answerProvider.available).toBe(mockLocalEngine.answerProvider.available);
  });

  it('falls back to localEngine answerProvider when remote fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));
    const localAnswerMock: AnswerProvider = {
      available: true,
      answer: async function* () {
        yield 'Local fallback answer';
      },
    };
    mockLocalEngine.answerProvider = localAnswerMock;
    const engine = createManager('https://api.bibleit.test');
    const chunks: string[] = [];
    for await (const chunk of engine.answerProvider.answer('love', mockLocalResult)) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(['Local fallback answer']);
  });

  it('HttpAnswerProvider fetches /api/v1/generate with query and passages', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => {
          let readCount = 0;
          return {
            read: async () => {
              if (readCount++ === 0) {
                return { done: false, value: new TextEncoder().encode('God is love') };
              }
              return { done: true, value: undefined };
            },
            releaseLock: () => {},
          };
        },
      },
    } as unknown as Response);

    const engine = createManager('https://api.bibleit.test');
    const chunks: string[] = [];
    for await (const chunk of engine.answerProvider.answer('who is God?', mockLocalResult)) {
      chunks.push(chunk);
    }

    expect(fetchSpy).toHaveBeenCalledWith(
      `https://api.bibleit.test${API_ROUTES.GENERATE}`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ query: 'who is God?', passages: mockLocalResult.passages }),
      }),
    );
    expect(chunks.join('')).toBe('God is love');
    fetchSpy.mockRestore();
  });

  it('does not fall back to localEngine when French locale and remote fetch rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const engine = createManager('https://api.bibleit.test', undefined, () => 'fr');
    const result = await engine.retrieve('paix');

    expect(mockLocalEngine.retrieve).not.toHaveBeenCalled();
    expect(result.passages).toEqual([]);
    expect(result.fallbackReason).toBe('error');
    expect(result.origin).toBe(SearchOriginEnum.LOCAL);
  });

  it('does not fall back to localEngine when French locale and remote times out', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce((_url, init) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The user aborted a request.', 'AbortError'));
        });
      });
    });

    const engine = createManager('https://api.bibleit.test', undefined, () => 'fr');
    const retrievePromise = engine.retrieve('paix');
    await vi.advanceTimersByTimeAsync(4100);
    const result = await retrievePromise;

    expect(mockLocalEngine.retrieve).not.toHaveBeenCalled();
    expect(result.passages).toEqual([]);
    expect(result.fallbackReason).toBe('timeout');
    expect(result.origin).toBe(SearchOriginEnum.LOCAL);
    vi.useRealTimers();
  });

  it('bypasses localEngine when French locale and isDeviceOnly callback returns true', async () => {
    const engine = createManager('https://api.bibleit.test', () => true, () => 'fr');
    const result = await engine.retrieve('paix');

    expect(mockLocalEngine.retrieve).not.toHaveBeenCalled();
    expect(result.passages).toEqual([]);
    expect(result.origin).toBe(SearchOriginEnum.LOCAL);
  });

  it('cleans up timeout timer and abort listener in finally block upon remote error', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const callerController = new AbortController();
    const removeListenerSpy = vi.spyOn(callerController.signal, 'removeEventListener');

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network failure'));

    const engine = createManager('https://api.bibleit.test');
    await engine.retrieve('love', 10, callerController.signal);

    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(removeListenerSpy).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('passes detectionMethod from injected languageDetector to retrieval result', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockRemoteResult), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const mockDetector = {
      detect: vi.fn().mockResolvedValue({ language: 'en', detectionMethod: 'browser_ai' as const }),
    };
    const remote = new RemoteEngine(
      'https://api.bibleit.test',
      undefined,
      () => 'fr',
      undefined,
      mockDetector,
    );
    const result = await remote.retrieve('peace in anxiety');
    expect(result.detectionMethod).toBe('browser_ai');
    expect(result.detectedLanguage).toBe('en');
    expect(result.translationBypassReason).toBe('client_detected_english');
  });
});

