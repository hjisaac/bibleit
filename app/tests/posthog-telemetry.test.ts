import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostHogTelemetry } from '../src/adapters/posthog-telemetry';
import { resolvePositiveInt, resolvePosthogKey } from '../src/env';
import { $telemetryEnabled } from '../src/stores/preferences';
import {
  $telemetryInstanceId,
  $telemetryQueue,
  setTelemetryEnabled,
  TELEMETRY_INSTANCE_ID_KEY,
} from '../src/stores/telemetry';

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe('PostHogTelemetry', () => {
  const originalSendBeacon = navigator.sendBeacon;
  const originalFetch = globalThis.fetch;
  let sendBeaconSpy: ReturnType<typeof vi.fn>;
  let fetchSpy: ReturnType<typeof vi.fn>;
  const instances: PostHogTelemetry[] = [];

  const createTelemetry = (
    apiKey: string,
    host = 'https://eu.i.posthog.com',
    batchSize = 3,
    environment: 'dev' | 'prod' = 'prod',
  ) => {
    const instance = new PostHogTelemetry(apiKey, host, batchSize, environment);
    instances.push(instance);
    return instance;
  };

  beforeEach(() => {
    $telemetryEnabled.set(true);
    $telemetryInstanceId.set('');
    $telemetryQueue.set([]);
    localStorage.clear();
    sendBeaconSpy = vi.fn().mockReturnValue(true);
    fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    Object.defineProperty(navigator, 'sendBeacon', { value: sendBeaconSpy, configurable: true });
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    while (instances.length > 0) instances.pop()?.dispose();
    $telemetryEnabled.set(true);
    Object.defineProperty(navigator, 'sendBeacon', { value: originalSendBeacon, configurable: true });
    globalThis.fetch = originalFetch;
  });

  it('guards dev mode unless VITE_TELEMETRY_DEV=true', () => {
    expect(resolvePosthogKey('phc_test', true, undefined)).toBe('');
    expect(resolvePosthogKey('phc_test', true, 'false')).toBe('');
    expect(resolvePosthogKey('phc_test', true, 'true')).toBe('phc_test');
    expect(resolvePosthogKey('phc_test', false, undefined)).toBe('phc_test');
    expect(resolvePosthogKey('  ', false, undefined)).toBe('');
  });

  it('parses VITE_TELEMETRY_BATCH_SIZE with a positive integer fallback', () => {
    expect(resolvePositiveInt('10', 5)).toBe(10);
    expect(resolvePositiveInt(' 1 ', 5)).toBe(1);
    expect(resolvePositiveInt('0', 5)).toBe(5);
    expect(resolvePositiveInt('-3', 5)).toBe(5);
    expect(resolvePositiveInt('abc', 5)).toBe(5);
    expect(resolvePositiveInt(undefined, 5)).toBe(5);
  });

  it('acts as a no-op without touching stores when apiKey is empty', () => {
    const telemetry = createTelemetry('', 'https://eu.i.posthog.com', 1);
    telemetry.capture('search', { query: 'grace' });
    expect(sendBeaconSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect($telemetryQueue.get()).toEqual([]);
    expect($telemetryInstanceId.get()).toBe('');
  });

  it('stores minimal events in nanostores queue and flushes in one POST /batch/ at threshold', async () => {
    const telemetry = createTelemetry('phc_test', 'https://eu.i.posthog.com/', 2, 'dev');

    telemetry.capture('search', { query: 'peace' });
    expect(sendBeaconSpy).not.toHaveBeenCalled();

    // Stored entry must stay lightweight: only { event, ts, props } — no distinct_id, env, or api_key.
    const queued = $telemetryQueue.get();
    expect(queued).toHaveLength(1);
    expect(Object.keys(queued[0]!).sort()).toEqual(['event', 'props', 'ts']);

    telemetry.capture('passage_feedback', { query: 'peace', vote: 'up' });
    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
    expect($telemetryQueue.get()).toEqual([]);

    const [url, blob] = sendBeaconSpy.mock.calls[0] as [string, Blob];
    expect(url).toBe('https://eu.i.posthog.com/batch/');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/plain');

    const payload = JSON.parse(await readBlobText(blob));
    const storedId = localStorage.getItem(TELEMETRY_INSTANCE_ID_KEY);
    expect(storedId).toBeTruthy();
    expect(payload.api_key).toBe('phc_test');
    expect(payload.batch).toHaveLength(2);
    expect(payload.batch[0]).toMatchObject({
      event: 'search',
      properties: { query: 'peace', distinct_id: storedId, env: 'dev' },
    });
    expect(payload.batch[1]).toMatchObject({
      event: 'passage_feedback',
      properties: { query: 'peace', vote: 'up', distinct_id: storedId, env: 'dev' },
    });
  });

  it('keeps queued events offline with zero network calls and flushes once back online', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const telemetry = createTelemetry('phc_test', 'https://eu.i.posthog.com', 1);

    telemetry.capture('search', { query: 'hope' });
    expect(sendBeaconSpy).not.toHaveBeenCalled();
    expect($telemetryQueue.get()).toHaveLength(1);

    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    window.dispatchEvent(new Event('online'));

    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
    expect($telemetryQueue.get()).toEqual([]);
  });

  it('falls back to fire-and-forget fetch and clears queue even if delivery fails', async () => {
    Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true });
    fetchSpy.mockRejectedValueOnce(new Error('network error'));
    const telemetry = createTelemetry('phc_test', 'https://eu.i.posthog.com', 1);

    telemetry.capture('search', { query: 'faith' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect($telemetryQueue.get()).toEqual([]);
    await Promise.resolve();
    expect($telemetryQueue.get()).toEqual([]);
  });

  it('clears stored telemetry data and stops capturing when disabled via preference', () => {
    const telemetry = createTelemetry('phc_test', 'https://eu.i.posthog.com', 5);
    telemetry.capture('search', { query: 'mercy' });
    $telemetryInstanceId.set('existing-id');
    expect($telemetryQueue.get()).toHaveLength(1);

    setTelemetryEnabled(false);
    expect($telemetryQueue.get()).toEqual([]);
    expect($telemetryInstanceId.get()).toBe('');

    telemetry.capture('search', { query: 'grace' });
    telemetry.flush();
    expect($telemetryQueue.get()).toEqual([]);
    expect(sendBeaconSpy).not.toHaveBeenCalled();
  });

  it('flushes on visibilitychange hidden and reuses persisted instance ID across reloads', async () => {
    const first = createTelemetry('phc_test', 'https://eu.i.posthog.com', 5);
    first.capture('search', { query: 'love' });

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
    const [, firstBlob] = sendBeaconSpy.mock.calls[0] as [string, Blob];
    const firstPayload = JSON.parse(await readBlobText(firstBlob));
    expect($telemetryQueue.get()).toEqual([]);

    const second = createTelemetry('phc_test', 'https://eu.i.posthog.com', 5);
    second.capture('overview_feedback', { vote: 'up' });
    second.flush();

    const [, secondBlob] = sendBeaconSpy.mock.calls[1] as [string, Blob];
    const secondPayload = JSON.parse(await readBlobText(secondBlob));
    expect(secondPayload.batch[0].properties.distinct_id).toBe(
      firstPayload.batch[0].properties.distinct_id,
    );
  });
});
