export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface UpstreamEntry {
  readonly name: string;
  readonly url: string;
}

export interface UpstreamStatus {
  readonly name: string;
  readonly url: string;
  readonly state: CircuitState;
  readonly consecutiveFailures: number;
  readonly cooldownRemainingMs: number;
  readonly served: number;
  readonly errors: number;
  readonly lastLatencyMs: number | null;
}

interface InternalUpstream extends UpstreamEntry {
  consecutiveFailures: number;
  openUntil: number;
  served: number;
  errors: number;
  lastLatencyMs: number | null;
}

export interface PoolConfig {
  failureThreshold: number;
  cooldownMs: number;
}

export function parseUpstreams(raw: string): UpstreamEntry[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eqIdx = part.indexOf('=');
      if (eqIdx > 0 && !part.slice(0, eqIdx).includes('://')) {
        const name = part.slice(0, eqIdx).trim();
        const url = part.slice(eqIdx + 1).trim().replace(/\/+$/, '');
        return { name, url };
      }
      const url = part.replace(/\/+$/, '');
      try {
        return { name: new URL(url).hostname, url };
      } catch {
        return { name: url, url };
      }
    })
    .filter((entry) => entry.url.length > 0);
}

/**
 * Per-isolate round-robin pool with a 3-state circuit breaker (CLOSED / OPEN / HALF_OPEN).
 */
export class UpstreamPool {
  private readonly upstreams: InternalUpstream[];
  private readonly config: PoolConfig;
  private cursor = 0;

  constructor(entries: UpstreamEntry[], config: PoolConfig) {
    this.upstreams = entries.map((e) => ({
      ...e,
      consecutiveFailures: 0,
      openUntil: 0,
      served: 0,
      errors: 0,
      lastLatencyMs: null,
    }));
    this.config = config;
  }

  get size(): number {
    return this.upstreams.length;
  }

  private getState(u: InternalUpstream, now: number): CircuitState {
    if (u.openUntil === 0) return 'CLOSED';
    return now < u.openUntil ? 'OPEN' : 'HALF_OPEN';
  }

  /** Returns upstreams in round-robin attempt order, skipping OPEN circuits unless all are OPEN. */
  selectOrder(now = Date.now()): UpstreamEntry[] {
    const n = this.upstreams.length;
    if (n === 0) return [];

    const start = this.cursor % n;
    this.cursor = (this.cursor + 1) % n;

    const ordered: InternalUpstream[] = [];
    for (let i = 0; i < n; i++) {
      ordered.push(this.upstreams[(start + i) % n]!);
    }

    const eligible = ordered.filter((u) => this.getState(u, now) !== 'OPEN');
    if (eligible.length > 0) return eligible;

    // All circuits are OPEN: probe earliest-expiring upstream first rather than blindly failing.
    return [...ordered].sort((a, b) => a.openUntil - b.openUntil);
  }

  recordSuccess(url: string, latencyMs: number): void {
    const u = this.upstreams.find((item) => item.url === url);
    if (!u) return;
    u.consecutiveFailures = 0;
    u.openUntil = 0;
    u.served += 1;
    u.lastLatencyMs = latencyMs;
  }

  recordFailure(url: string, now = Date.now()): void {
    const u = this.upstreams.find((item) => item.url === url);
    if (!u) return;
    u.errors += 1;
    u.consecutiveFailures += 1;
    if (u.consecutiveFailures >= this.config.failureThreshold) {
      u.openUntil = now + this.config.cooldownMs;
    }
  }

  snapshot(now = Date.now()): UpstreamStatus[] {
    return this.upstreams.map((u) => {
      const state = this.getState(u, now);
      return {
        name: u.name,
        url: u.url,
        state,
        consecutiveFailures: u.consecutiveFailures,
        cooldownRemainingMs: state === 'OPEN' ? Math.max(0, u.openUntil - now) : 0,
        served: u.served,
        errors: u.errors,
        lastLatencyMs: u.lastLatencyMs,
      };
    });
  }
}
