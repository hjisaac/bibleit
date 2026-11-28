import { DEFAULT_TELEMETRY_BATCH_SIZE } from '../constants';
import type { Telemetry } from '../core/ports';
import { $telemetryEnabled } from '../stores/preferences';
import {
  $telemetryQueue,
  enqueueTelemetryEvent,
  getOrCreateTelemetryInstanceId,
} from '../stores/telemetry';

export class PostHogTelemetry implements Telemetry {
  private readonly endpoint: string;
  private readonly onVisibilityChange?: () => void;
  private readonly onOnline?: () => void;

  constructor(
    private readonly apiKey: string,
    apiHost: string,
    private readonly batchSize = DEFAULT_TELEMETRY_BATCH_SIZE,
    private readonly environment: 'dev' | 'prod' = 'prod',
  ) {
    this.endpoint = `${apiHost.replace(/\/+$/, '')}/batch/`;

    if (!this.apiKey) return;

    if (typeof document !== 'undefined') {
      this.onVisibilityChange = () => {
        if (document.visibilityState === 'hidden') this.flush();
      };
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }

    if (typeof window !== 'undefined') {
      this.onOnline = () => this.flush();
      window.addEventListener('online', this.onOnline);
    }

    if ($telemetryQueue.get().length > 0) {
      this.flush();
    }
  }

  capture(event: string, properties?: Record<string, unknown>): void {
    if (!this.apiKey || !$telemetryEnabled.get()) return;

    const size = enqueueTelemetryEvent(event, properties);
    if (size >= this.batchSize) {
      this.flush();
    }
  }

  flush(): void {
    if (!this.apiKey || !$telemetryEnabled.get()) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    const batch = $telemetryQueue.get();
    if (batch.length === 0) return;

    // Clear queue immediately (fire-and-forget); drop batch if delivery fails.
    $telemetryQueue.set([]);

    // Attach distinct_id and env only at flush time so queued items stay minimal in storage.
    const distinctId = getOrCreateTelemetryInstanceId();
    const payload = JSON.stringify({
      api_key: this.apiKey,
      batch: batch.map((item) => ({
        event: item.event,
        timestamp: new Date(item.ts).toISOString(),
        properties: { ...item.props, distinct_id: distinctId, env: this.environment },
      })),
    });

    // text/plain avoids CORS preflight on cross-origin sendBeacon/keepalive requests.
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      if (navigator.sendBeacon(this.endpoint, new Blob([payload], { type: 'text/plain' }))) {
        return;
      }
    }

    if (typeof fetch === 'function') {
      void fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  }

  dispose(): void {
    if (this.onVisibilityChange && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (this.onOnline && typeof window !== 'undefined') {
      window.removeEventListener('online', this.onOnline);
    }
  }
}
