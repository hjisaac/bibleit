import { Hono } from 'hono';
import { proxy } from 'hono/proxy';
import { API_ROUTES } from '@bibleit/engine';
import { UpstreamPool, parseUpstreams } from './circuit-breaker';

export interface ProxyBindings {
  UPSTREAMS?: string;
  UPSTREAM_TIMEOUT_MS?: string;
  STREAM_TIMEOUT_MS?: string;
  FAILURE_THRESHOLD?: string;
  COOLDOWN_MS?: string;
}

const DEFAULT_TIMEOUT_MS = 3500;
const DEFAULT_STREAM_TIMEOUT_MS = 12_000;
const DEFAULT_FAILURE_THRESHOLD = 2;
const DEFAULT_COOLDOWN_MS = 30_000;

const PROXY_DIAGNOSTIC_HEADERS = ['X-Proxy-Upstream', 'X-Proxy-Attempts', 'X-Proxy-Latency-Ms'];

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function appendExposeHeaders(headers: Headers): void {
  const existing = headers.get('Access-Control-Expose-Headers') ?? '';
  const current = new Set(
    existing
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean),
  );
  for (const h of PROXY_DIAGNOSTIC_HEADERS) current.add(h);
  headers.set('Access-Control-Expose-Headers', Array.from(current).join(', '));
}

export function createProxyApp(options?: {
  customFetch?: typeof fetch;
  now?: () => number;
}) {
  const app = new Hono<{ Bindings: ProxyBindings }>();
  const now = options?.now ?? (() => Date.now());
  const fetcher = options?.customFetch ?? fetch;

  let cachedKey = '';
  let pool: UpstreamPool | null = null;

  const getPool = (env: ProxyBindings | undefined): UpstreamPool => {
    const raw = env?.UPSTREAMS ?? '';
    const failureThreshold = parsePositiveInt(env?.FAILURE_THRESHOLD, DEFAULT_FAILURE_THRESHOLD);
    const cooldownMs = parsePositiveInt(env?.COOLDOWN_MS, DEFAULT_COOLDOWN_MS);
    const key = `${raw}|${failureThreshold}|${cooldownMs}`;
    if (!pool || cachedKey !== key) {
      pool = new UpstreamPool(parseUpstreams(raw), { failureThreshold, cooldownMs });
      cachedKey = key;
    }
    return pool;
  };

  app.get(API_ROUTES.HEALTH, (c) => {
    const upstreams = getPool(c.env).snapshot(now());
    const healthyCount = upstreams.filter((u) => u.state !== 'OPEN').length;
    const isOk = healthyCount > 0;
    return c.json(
      { status: isOk ? 'ok' : 'degraded', healthyCount, totalCount: upstreams.length },
      isOk ? 200 : 503,
    );
  });

  app.get(API_ROUTES.STATUS, async (c) => {
    const upstreams = getPool(c.env).snapshot(now());
    const healthyCount = upstreams.filter((u) => u.state !== 'OPEN').length;
    const probeTimeoutMs = parsePositiveInt(c.env?.UPSTREAM_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

    // Probe each upstream's /status?format=json in parallel for a unified fleet snapshot.
    const detailed = await Promise.all(
      upstreams.map(async (u) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), probeTimeoutMs);
        try {
          const res = await fetcher(`${u.url}${API_ROUTES.STATUS}?format=json`, {
            headers: { accept: 'application/json' },
            signal: controller.signal,
          });
          clearTimeout(timer);
          const backend = res.ok ? await res.json().catch(() => null) : { httpStatus: res.status };
          return { ...u, backend };
        } catch (err) {
          clearTimeout(timer);
          return { ...u, backend: { error: err instanceof Error ? err.message : String(err) } };
        }
      }),
    );

    const isOk = healthyCount > 0;
    return c.json(
      {
        status: isOk ? 'ok' : 'degraded',
        healthyCount,
        totalCount: upstreams.length,
        upstreams: detailed,
      },
      isOk ? 200 : 503,
    );
  });

  app.all('*', async (c) => {
    const currentPool = getPool(c.env);
    const candidates = currentPool.selectOrder(now());
    if (candidates.length === 0) {
      return c.json({ error: 'No upstreams configured' }, 503);
    }

    const reqUrl = new URL(c.req.url);
    const isStreamPath = reqUrl.pathname === API_ROUTES.GENERATE;
    const timeoutMs = isStreamPath
      ? parsePositiveInt(c.env?.STREAM_TIMEOUT_MS, DEFAULT_STREAM_TIMEOUT_MS)
      : parsePositiveInt(c.env?.UPSTREAM_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

    const method = c.req.method;
    const body = method === 'GET' || method === 'HEAD' ? undefined : await c.req.arrayBuffer();

    const forwardHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(c.req.header())) {
      if (k.toLowerCase() !== 'host') forwardHeaders[k] = v;
    }
    const clientIp = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for');
    if (clientIp) forwardHeaders['x-forwarded-for'] = clientIp;
    const reqHost = c.req.header('host');
    if (reqHost) forwardHeaders['x-forwarded-host'] = reqHost;

    let lastResponse: Response | null = null;
    let lastError = 'All upstreams unavailable';

    for (let i = 0; i < candidates.length; i++) {
      const upstream = candidates[i]!;
      const targetUrl = `${upstream.url}${reqUrl.pathname}${reqUrl.search}`;
      const attempt = i + 1;
      const startedAt = now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await proxy(targetUrl, {
          method,
          headers: forwardHeaders,
          body,
          signal: controller.signal,
          ...(options?.customFetch ? { customFetch: options.customFetch } : {}),
        });
        clearTimeout(timer);
        const latencyMs = Math.max(0, Math.round(now() - startedAt));

        if (res.status >= 500) {
          currentPool.recordFailure(upstream.url, now());
          lastResponse = res;
          lastError = `HTTP ${res.status}`;
          console.log(
            JSON.stringify({
              event: 'proxy_upstream_error',
              method,
              path: reqUrl.pathname,
              upstream: upstream.name,
              status: res.status,
              latencyMs,
              attempt,
            }),
          );
          continue;
        }

        currentPool.recordSuccess(upstream.url, latencyMs);
        const outHeaders = new Headers(res.headers);
        outHeaders.set('X-Proxy-Upstream', upstream.name);
        outHeaders.set('X-Proxy-Attempts', String(attempt));
        outHeaders.set('X-Proxy-Latency-Ms', String(latencyMs));
        appendExposeHeaders(outHeaders);

        console.log(
          JSON.stringify({
            event: 'proxy_request',
            method,
            path: reqUrl.pathname,
            upstream: upstream.name,
            status: res.status,
            latencyMs,
            attempts: attempt,
            failover: attempt > 1,
          }),
        );

        return new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers: outHeaders,
        });
      } catch (err) {
        clearTimeout(timer);
        const latencyMs = Math.max(0, Math.round(now() - startedAt));
        currentPool.recordFailure(upstream.url, now());
        lastError = err instanceof Error ? err.message : String(err);
        console.log(
          JSON.stringify({
            event: 'proxy_upstream_failure',
            method,
            path: reqUrl.pathname,
            upstream: upstream.name,
            error: lastError,
            latencyMs,
            attempt,
          }),
        );
      }
    }

    if (lastResponse) return lastResponse;
    return c.json({ error: 'All upstreams unavailable', detail: lastError }, 502);
  });

  return app;
}

export default createProxyApp();
