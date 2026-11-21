import posthog from 'posthog-js';
import type { Telemetry } from '../core/ports';

export class PostHogTelemetry implements Telemetry {
  private initialized = false;

  constructor(
    private readonly apiKey: string,
    private readonly apiHost: string,
  ) {}

  private ensureInit(): boolean {
    if (!this.apiKey) return false;
    if (!this.initialized) {
      // Anonymous, memory-only mode: no cookies, no persistent person profiles, no autocapture.
      posthog.init(this.apiKey, {
        api_host: this.apiHost,
        persistence: 'memory',
        person_profiles: 'never',
        autocapture: false,
        capture_pageview: false,
        disable_session_recording: true,
      });
      this.initialized = true;
    }
    return true;
  }

  capture(event: string, properties?: Record<string, unknown>): void {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (!this.ensureInit()) return;
    posthog.capture(event, properties);
  }
}
