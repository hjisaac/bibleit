import { describe, expect, it, vi } from 'vitest';
import { createProxyApp, type ProxyBindings } from '../src/index';
import type { UpstreamStatus } from '../src/circuit-breaker';

interface HealthResponse {
  status: string;
  healthyCount: number;
  totalCount: number;
  upstreams: UpstreamStatus[];
}

const BASE_ENV: ProxyBindings = {
  UPSTREAMS: 'render=https://render.test,serv00=https://serv00.test',
  UPSTREAM_TIMEOUT_MS: '500',
  FAILURE_THRESHOLD: '2',
  COOLDOWN_MS: '30000',
};

describe('@bibleit/proxy', () => {
  it('distributes requests across upstreams using round-robin and sets diagnostic headers', async () => {
    const seen: string[] = [];
    const customFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      seen.push(new URL(url).hostname);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const app = createProxyApp({ customFetch });

    const r1 = await app.request('https://api.bibleit.app/api/v1/search?q=love', {}, BASE_ENV);
    const r2 = await app.request('https://api.bibleit.app/api/v1/search?q=hope', {}, BASE_ENV);
    const r3 = await app.request('https://api.bibleit.app/api/v1/search?q=faith', {}, BASE_ENV);

    expect(seen).toEqual(['render.test', 'serv00.test', 'render.test']);
    expect(r1.headers.get('X-Proxy-Upstream')).toBe('render');
    expect(r2.headers.get('X-Proxy-Upstream')).toBe('serv00');
    expect(r3.headers.get('X-Proxy-Upstream')).toBe('render');
    expect(r1.headers.get('X-Proxy-Attempts')).toBe('1');
    expect(r1.headers.get('Access-Control-Expose-Headers')).toContain('X-Proxy-Upstream');
  });

  it('fails over on 5xx and preserves POST body', async () => {
    const bodies: string[] = [];
    const customFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (input instanceof Request) {
        bodies.push(await input.clone().text());
      } else if (init?.body instanceof ArrayBuffer) {
        bodies.push(new TextDecoder().decode(init.body));
      }
      if (url.startsWith('https://render.test')) {
        return new Response('Internal Error', { status: 503 });
      }
      return new Response(JSON.stringify({ passages: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const app = createProxyApp({ customFetch });
    const res = await app.request(
      'https://api.bibleit.app/api/v1/search',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'grace' }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Proxy-Upstream')).toBe('serv00');
    expect(res.headers.get('X-Proxy-Attempts')).toBe('2');
    expect(bodies).toEqual(['{"query":"grace"}', '{"query":"grace"}']);
  });

  it('returns 4xx directly without retrying or tripping the circuit breaker', async () => {
    const customFetch = vi.fn(async () => new Response(JSON.stringify({ error: 'Bad query' }), { status: 400 })) as unknown as typeof fetch;
    const app = createProxyApp({ customFetch });

    const res = await app.request('https://api.bibleit.app/api/v1/search', { method: 'POST', body: '{}' }, BASE_ENV);
    expect(res.status).toBe(400);
    expect(res.headers.get('X-Proxy-Attempts')).toBe('1');
    expect(customFetch).toHaveBeenCalledTimes(1);

    const status = (await (await app.request('https://api.bibleit.app/status', {}, BASE_ENV)).json()) as HealthResponse;
    expect(status.upstreams[0]?.state).toBe('CLOSED');
    expect(status.upstreams[0]?.errors).toBe(0);
  });

  it('opens circuit after FAILURE_THRESHOLD failures, skips OPEN upstream, and recovers after cooldown', async () => {
    let clock = 100_000;
    let renderHealthy = false;
    const calls: string[] = [];

    const customFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const parsed = new URL(url);
      if (parsed.pathname === '/status') {
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      }
      const host = parsed.hostname;
      calls.push(host);
      if (host === 'render.test' && !renderHealthy) {
        throw new Error('ECONNREFUSED');
      }
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

    const app = createProxyApp({ customFetch, now: () => clock });

    // 1st failure on render (cursor=0 -> render fails -> serv00 succeeds)
    await app.request('https://api.bibleit.app/api/v1/search?q=a', {}, BASE_ENV);
    // cursor=1 -> serv00 succeeds
    await app.request('https://api.bibleit.app/api/v1/search?q=b', {}, BASE_ENV);
    // cursor=0 -> 2nd failure on render -> circuit OPENS!
    await app.request('https://api.bibleit.app/api/v1/search?q=c', {}, BASE_ENV);

    const statusOpen = (await (await app.request('https://api.bibleit.app/status', {}, BASE_ENV)).json()) as HealthResponse;
    expect(statusOpen.upstreams[0]).toMatchObject({
      name: 'render',
      state: 'OPEN',
      consecutiveFailures: 2,
    });

    // While OPEN, render is skipped completely
    calls.length = 0;
    await app.request('https://api.bibleit.app/api/v1/search?q=d', {}, BASE_ENV);
    await app.request('https://api.bibleit.app/api/v1/search?q=e', {}, BASE_ENV);
    expect(calls).toEqual(['serv00.test', 'serv00.test']);

    // Advance past 30s cooldown -> HALF_OPEN probe succeeds -> CLOSED
    clock += 31_000;
    renderHealthy = true;
    const statusHalfOpen = (await (await app.request('https://api.bibleit.app/status', {}, BASE_ENV)).json()) as HealthResponse;
    expect(statusHalfOpen.upstreams[0]?.state).toBe('HALF_OPEN');

    await app.request('https://api.bibleit.app/api/v1/search?q=f', {}, BASE_ENV);
    await app.request('https://api.bibleit.app/api/v1/search?q=g', {}, BASE_ENV);
    const statusClosed = (await (await app.request('https://api.bibleit.app/status', {}, BASE_ENV)).json()) as HealthResponse;
    expect(statusClosed.upstreams[0]?.state).toBe('CLOSED');
    expect(statusClosed.upstreams[0]?.consecutiveFailures).toBe(0);
  });

  it('returns 503 on /health and proxied routes when no upstreams are configured', async () => {
    const app = createProxyApp();
    const healthRes = await app.request('https://api.bibleit.app/health', {}, { UPSTREAMS: '' });
    expect(healthRes.status).toBe(503);
    const searchRes = await app.request('https://api.bibleit.app/api/v1/search?q=a', {}, { UPSTREAMS: '' });
    expect(searchRes.status).toBe(503);
  });
});
