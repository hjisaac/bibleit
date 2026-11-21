import { Hono } from 'hono';
import { proxy } from 'hono/proxy';
import {
  BrokenCircuitError,
  CircuitState,
  ConsecutiveBreaker,
  TimeoutStrategy,
  circuitBreaker,
  handleAll,
  timeout,
  wrap,
  type CircuitBreakerPolicy,
} from 'cockatiel';
import { API_ROUTES } from '@bibleit/engine';

export interface ProxyBindings {
  UPSTREAMS?: string;
  UPSTREAM_TIMEOUT_MS?: string;
  STREAM_TIMEOUT_MS?: string;
  FAILURE_THRESHOLD?: string;
  COOLDOWN_MS?: string;
}

export interface UpstreamStatus {
  readonly name: string;
  readonly url: string;
  readonly state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

interface UpstreamNode {
  readonly name: string;
  readonly url: string;
  readonly breaker: CircuitBreakerPolicy;
}

const DEFAULT_TIMEOUT_MS = 3500;
const DEFAULT_STREAM_TIMEOUT_MS = 12_000;
const DEFAULT_FAILURE_THRESHOLD = 2;
const DEFAULT_COOLDOWN_MS = 30_000;

const parsePositiveInt = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

const stateLabel = (state: CircuitState): UpstreamStatus['state'] =>
  state === CircuitState.Open || state === CircuitState.Isolated
    ? 'OPEN'
    : state === CircuitState.HalfOpen
      ? 'HALF_OPEN'
      : 'CLOSED';

function parseUpstreams(raw: string): Array<{ name: string; url: string }> {
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf('=');
      if (eq > 0 && !part.slice(0, eq).includes('://')) {
        return { name: part.slice(0, eq).trim(), url: part.slice(eq + 1).trim().replace(/\/+$/, '') };
      }
      const url = part.replace(/\/+$/, '');
      try {
        return { name: new URL(url).hostname, url };
      } catch {
        return { name: url, url };
      }
    })
    .filter((u) => u.url.length > 0);
}

export function createProxyApp(options?: { customFetch?: (request: Request) => Promise<Response> }) {
  const app = new Hono<{ Bindings: ProxyBindings }>();

  // Lazily initialized inside request handlers (Cloudflare Workers forbids global timers/AbortController).
  let cachedKey = '';
  let nodes: UpstreamNode[] = [];
  let cursor = 0;

  const getNodes = (env?: ProxyBindings): UpstreamNode[] => {
    const raw = env?.UPSTREAMS ?? '';
    const failureThreshold = parsePositiveInt(env?.FAILURE_THRESHOLD, DEFAULT_FAILURE_THRESHOLD);
    const cooldownMs = parsePositiveInt(env?.COOLDOWN_MS, DEFAULT_COOLDOWN_MS);
    const key = `${raw}|${failureThreshold}|${cooldownMs}`;
    if (cachedKey !== key) {
      const handleFailure = handleAll.orWhenResult((r) => r instanceof Response && r.status >= 500);
      nodes = parseUpstreams(raw).map((entry) => ({
        ...entry,
        breaker: circuitBreaker(handleFailure, {
          halfOpenAfter: cooldownMs,
          breaker: new ConsecutiveBreaker(failureThreshold),
        }),
      }));
      cachedKey = key;
      cursor = 0;
    }
    return nodes;
  };

  const snapshot = (list: UpstreamNode[]): UpstreamStatus[] =>
    list.map((n) => ({ name: n.name, url: n.url, state: stateLabel(n.breaker.state) }));

  app.get(API_ROUTES.HEALTH, (c) => {
    const upstreams = snapshot(getNodes(c.env));
    const healthyCount = upstreams.filter((u) => u.state !== 'OPEN').length;
    return c.json(
      { status: healthyCount > 0 ? 'ok' : 'degraded', healthyCount, totalCount: upstreams.length },
      healthyCount > 0 ? 200 : 503,
    );
  });

  app.get(API_ROUTES.STATUS, (c) => {
    const upstreams = snapshot(getNodes(c.env));
    const healthyCount = upstreams.filter((u) => u.state !== 'OPEN').length;
    return c.json(
      { status: healthyCount > 0 ? 'ok' : 'degraded', healthyCount, totalCount: upstreams.length, upstreams },
      healthyCount > 0 ? 200 : 503,
    );
  });

  app.all('*', async (c) => {
    const list = getNodes(c.env);
    if (list.length === 0) return c.json({ error: 'No upstreams configured' }, 503);

    const start = cursor % list.length;
    cursor = (cursor + 1) % list.length;
    const ordered = list.map((_, i) => list[(start + i) % list.length]!);

    const reqUrl = new URL(c.req.url);
    const timeoutMs =
      reqUrl.pathname === API_ROUTES.GENERATE
        ? parsePositiveInt(c.env?.STREAM_TIMEOUT_MS, DEFAULT_STREAM_TIMEOUT_MS)
        : parsePositiveInt(c.env?.UPSTREAM_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

    for (const node of ordered) {
      // abortOnReturn: false keeps the response body stream open after headers arrive.
      const policy = wrap(
        node.breaker,
        timeout(timeoutMs, { strategy: TimeoutStrategy.Aggressive, abortOnReturn: false }),
      );

      try {
        const res = await policy.execute(({ signal }) =>
          proxy(`${node.url}${reqUrl.pathname}${reqUrl.search}`, {
            ...c.req,
            headers: { ...c.req.header(), host: undefined },
            signal,
            ...(options?.customFetch ? { customFetch: options.customFetch } : {}),
          }),
        );
        res.headers.set('X-Proxy-Upstream', node.name);
        return res;
      } catch (err) {
        // Only advance when the circuit was already OPEN (zero network calls made); never retry a failed call.
        if (err instanceof BrokenCircuitError) continue;
        return c.json({ error: 'Upstream unavailable', upstream: node.name }, 502);
      }
    }

    return c.json({ error: 'All upstreams unavailable' }, 503);
  });

  return app;
}

export default createProxyApp();
