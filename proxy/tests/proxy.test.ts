import { describe, expect, it, vi } from 'vitest';
import { createProxyApp, type ProxyBindings, type UpstreamStatus } from '../src/index';

interface StatusResponse {
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
  it('distributes requests across upstreams using round-robin', async () => {
    const seen: string[] = [];
    const customFetch = vi.fn(async (req: Request) => {
      seen.push(new URL(req.url).hostname);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const app = createProxyApp({ customFetch });

    const r1 = await app.request('https://api.bibleit.app/api/v1/search?q=love', {}, BASE_ENV);
    const r2 = await app.request('https://api.bibleit.app/api/v1/search?q=hope', {}, BASE_ENV);
    const r3 = await app.request('https://api.bibleit.app/api/v1/search?q=faith', {}, BASE_ENV);

    expect(seen).toEqual(['render.test', 'serv00.test', 'render.test']);
    expect(r1.headers.get('X-Proxy-Upstream')).toBe('render');
    expect(r2.headers.get('X-Proxy-Upstream')).toBe('serv00');
    expect(r3.headers.get('X-Proxy-Upstream')).toBe('render');
  });

  it('does not retry on 5xx — returns upstream response directly and records failure', async () => {
    const customFetch = vi.fn(async () => new Response('Internal Error', { status: 503 }));
    const app = createProxyApp({ customFetch });

    const res = await app.request(
      'https://api.bibleit.app/api/v1/search',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"query":"grace"}' },
      BASE_ENV,
    );

    expect(res.status).toBe(503);
    expect(customFetch).toHaveBeenCalledTimes(1);
  });

  it('returns 4xx directly without tripping the circuit breaker', async () => {
    const customFetch = vi.fn(async () => new Response(JSON.stringify({ error: 'Bad query' }), { status: 400 }));
    const app = createProxyApp({ customFetch });

    const res = await app.request('https://api.bibleit.app/api/v1/search', { method: 'POST', body: '{}' }, BASE_ENV);
    expect(res.status).toBe(400);
    expect(customFetch).toHaveBeenCalledTimes(1);

    const status = (await (await app.request('https://api.bibleit.app/status', {}, BASE_ENV)).json()) as StatusResponse;
    expect(status.upstreams[0]?.state).toBe('CLOSED');
  });

  it('opens circuit after FAILURE_THRESHOLD failures, skips OPEN upstream, and recovers after cooldown', async () => {
    vi.useFakeTimers();
    try {
      let renderHealthy = false;
      const calls: string[] = [];

      const customFetch = vi.fn(async (req: Request) => {
        const host = new URL(req.url).hostname;
        calls.push(host);
        if (host === 'render.test' && !renderHealthy) {
          throw new Error('ECONNREFUSED');
        }
        return new Response('ok', { status: 200 });
      });

      const app = createProxyApp({ customFetch });

      // 1st failure on render -> returns 502 (no retry)
      const r1 = await app.request('https://api.bibleit.app/api/v1/search?q=a', {}, BASE_ENV);
      expect(r1.status).toBe(502);
      // serv00 succeeds
      const r2 = await app.request('https://api.bibleit.app/api/v1/search?q=b', {}, BASE_ENV);
      expect(r2.status).toBe(200);
      // 2nd failure on render -> returns 502 and OPENS circuit
      const r3 = await app.request('https://api.bibleit.app/api/v1/search?q=c', {}, BASE_ENV);
      expect(r3.status).toBe(502);

      const statusOpen = (await (await app.request('https://api.bibleit.app/status', {}, BASE_ENV)).json()) as StatusResponse;
      expect(statusOpen.upstreams[0]).toMatchObject({ name: 'render', state: 'OPEN' });

      // While OPEN, render is skipped without making any network call to it
      calls.length = 0;
      await app.request('https://api.bibleit.app/api/v1/search?q=d', {}, BASE_ENV);
      await app.request('https://api.bibleit.app/api/v1/search?q=e', {}, BASE_ENV);
      expect(calls).toEqual(['serv00.test', 'serv00.test']);

      // Advance past 30s cooldown -> cockatiel allows probe -> succeeds -> CLOSED
      vi.advanceTimersByTime(31_000);
      renderHealthy = true;
      calls.length = 0;

      await app.request('https://api.bibleit.app/api/v1/search?q=f', {}, BASE_ENV);
      await app.request('https://api.bibleit.app/api/v1/search?q=g', {}, BASE_ENV);
      expect(calls).toContain('render.test');
      const statusClosed = (await (await app.request('https://api.bibleit.app/status', {}, BASE_ENV)).json()) as StatusResponse;
      expect(statusClosed.upstreams[0]?.state).toBe('CLOSED');
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns 503 on /health and proxied routes when no upstreams are configured', async () => {
    const app = createProxyApp();
    const healthRes = await app.request('https://api.bibleit.app/health', {}, { UPSTREAMS: '' });
    expect(healthRes.status).toBe(503);
    const searchRes = await app.request('https://api.bibleit.app/api/v1/search?q=a', {}, { UPSTREAMS: '' });
    expect(searchRes.status).toBe(503);
  });
});
