import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpAnswerProvider } from '../src/adapters/http-answer-provider';
import type { RetrievalResult } from '../src/core/types';
import { API_ROUTES, TELEMETRY_HEADERS } from '@bibleit/engine';

describe('HttpAnswerProvider', () => {
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

  it('reports unavailable when remoteUrl is not configured', () => {
    const provider = new HttpAnswerProvider(null);
    expect(provider.available).toBe(false);
  });

  it('reports unavailable when device-only mode is active', () => {
    const provider = new HttpAnswerProvider('https://api.bibleit.test', () => true);
    expect(provider.available).toBe(false);
  });

  it('reports available when remoteUrl is present and device is online', () => {
    const provider = new HttpAnswerProvider('https://api.bibleit.test', () => false);
    expect(provider.available).toBe(true);
  });

  it('does nothing when answer() is called while unavailable', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const provider = new HttpAnswerProvider(null);

    const chunks: string[] = [];
    for await (const chunk of provider.answer('What is love?', mockContext)) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('streams text chunks from /api/v1/answer', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('God '));
        controller.enqueue(new TextEncoder().encode('is '));
        controller.enqueue(new TextEncoder().encode('love.'));
        controller.close();
      },
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      body: stream,
    } as unknown as Response);

    const provider = new HttpAnswerProvider('https://api.bibleit.test');
    const chunks: string[] = [];
    for await (const chunk of provider.answer('What is love?', mockContext)) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['God ', 'is ', 'love.']);
    expect(fetchSpy).toHaveBeenCalledWith(
      `https://api.bibleit.test${API_ROUTES.GENERATE}`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ query: 'What is love?', passages: mockContext.passages }),
      }),
    );
  });

  it('terminates gracefully when fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const provider = new HttpAnswerProvider('https://api.bibleit.test');
    const chunks: string[] = [];
    for await (const chunk of provider.answer('What is love?', mockContext)) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([]);
  });

  it('notifies onMeta callback with provider telemetry headers', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('Love is patient.'));
        controller.close();
      },
    });

    const headers = new Headers();
    headers.set(TELEMETRY_HEADERS.PROVIDER, 'gemini');
    headers.set(TELEMETRY_HEADERS.MODEL, 'gemini-3.5-flash-lite');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      body: stream,
      headers,
    } as unknown as Response);

    const provider = new HttpAnswerProvider('https://api.bibleit.test');
    let capturedMeta: { provider?: string; model?: string } | undefined;
    const chunks: string[] = [];
    for await (const chunk of provider.answer('What is love?', mockContext, (meta) => {
      capturedMeta = meta;
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['Love is patient.']);
    expect(capturedMeta).toEqual({ provider: 'gemini', model: 'gemini-3.5-flash-lite' });
  });
});
