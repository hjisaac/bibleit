import { beforeEach, describe, expect, it, vi } from 'vitest';

const { initSpy, captureSpy } = vi.hoisted(() => ({
  initSpy: vi.fn(),
  captureSpy: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: {
    init: initSpy,
    capture: captureSpy,
  },
}));

import { PostHogTelemetry } from '../src/adapters/posthog-telemetry';

describe('PostHogTelemetry', () => {
  beforeEach(() => {
    initSpy.mockClear();
    captureSpy.mockClear();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('acts as a no-op when apiKey is empty', () => {
    const telemetry = new PostHogTelemetry('', 'https://eu.i.posthog.com');
    telemetry.capture('search', { query: 'grace' });
    expect(initSpy).not.toHaveBeenCalled();
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it('sends zero network events when navigator.onLine is false', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const telemetry = new PostHogTelemetry('phc_test', 'https://eu.i.posthog.com');
    telemetry.capture('search', { query: 'grace' });
    expect(initSpy).not.toHaveBeenCalled();
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it('initializes PostHog once in anonymous memory-only mode and captures events when online', () => {
    const telemetry = new PostHogTelemetry('phc_test', 'https://eu.i.posthog.com');
    telemetry.capture('search', { query: 'peace', duration_ms: 42 });
    telemetry.capture('passage_feedback', { query: 'peace', ref: 'Philippians 4:7', rank: 0, vote: 'up' });

    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(initSpy).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({
        api_host: 'https://eu.i.posthog.com',
        persistence: 'memory',
        person_profiles: 'never',
        autocapture: false,
        capture_pageview: false,
        disable_session_recording: true,
      }),
    );
    expect(captureSpy).toHaveBeenCalledTimes(2);
    expect(captureSpy).toHaveBeenNthCalledWith(1, 'search', { query: 'peace', duration_ms: 42 });
    expect(captureSpy).toHaveBeenNthCalledWith(2, 'passage_feedback', {
      query: 'peace',
      ref: 'Philippians 4:7',
      rank: 0,
      vote: 'up',
    });
  });
});
