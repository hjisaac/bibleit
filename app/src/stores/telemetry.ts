import { persistentAtom } from '@nanostores/persistent';
import { $telemetryEnabled } from './preferences';

export const TELEMETRY_INSTANCE_ID_KEY = 'bibleit:telemetry:instance_id';
export const TELEMETRY_QUEUE_KEY = 'bibleit:telemetry:queue';
export const MAX_TELEMETRY_QUEUE = 50;

export interface QueuedTelemetryEvent {
  event: string;
  ts: number;
  props?: Record<string, unknown>;
}

export const $telemetryInstanceId = persistentAtom<string>(TELEMETRY_INSTANCE_ID_KEY, '');

export const $telemetryQueue = persistentAtom<QueuedTelemetryEvent[]>(
  TELEMETRY_QUEUE_KEY,
  [],
  {
    encode: JSON.stringify,
    decode: (raw) => {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },
  },
);

function createRandomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `anon-${Math.random().toString(36).slice(2)}`;
}

export function getOrCreateTelemetryInstanceId(): string {
  const existing = $telemetryInstanceId.get();
  if (existing) return existing;
  const fresh = createRandomId();
  $telemetryInstanceId.set(fresh);
  return fresh;
}

export function enqueueTelemetryEvent(
  event: string,
  props?: Record<string, unknown>,
): number {
  const entry: QueuedTelemetryEvent = { event, ts: Date.now() };
  if (props && Object.keys(props).length > 0) entry.props = props;
  const next = [...$telemetryQueue.get(), entry].slice(-MAX_TELEMETRY_QUEUE);
  $telemetryQueue.set(next);
  return next.length;
}

export function clearTelemetryData(): void {
  $telemetryQueue.set([]);
  $telemetryInstanceId.set('');
}

export function setTelemetryEnabled(enabled: boolean): void {
  $telemetryEnabled.set(enabled);
  if (!enabled) clearTelemetryData();
}
