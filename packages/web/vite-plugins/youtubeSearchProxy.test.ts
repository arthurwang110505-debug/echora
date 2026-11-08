import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The search proxy owns the deployment's only YouTube Data API key and the whole `search.list`
 * budget, so its behaviour under repetition matters more than its happy path.
 *
 * These tests call the real handler with fake Node req/res objects. The handler lives outside the
 * web tsconfig (`api/**` belongs to no project), so it is loaded by path and typed loosely here.
 */

type Handler = (req: unknown, res: unknown) => Promise<void>;

const createResponse = () => {
  const state = { statusCode: 200, headers: {} as Record<string, string>, body: '' };
  const response = {
    get statusCode() { return state.statusCode; },
    set statusCode(value: number) { state.statusCode = value; },
    setHeader: (name: string, value: string) => { state.headers[name.toLowerCase()] = value; },
    end: (payload: string) => { state.body = payload; },
  };
  const json = () => JSON.parse(state.body || 'null');
  return { response, state, json };
};

const createRequest = (url: string, ip = '10.0.0.1') => ({
  method: 'GET',
  url,
  headers: { 'x-forwarded-for': ip },
});

/** A fresh handler per test: the cache and limiter are module state and must not leak between tests. */
const loadHandler = async (): Promise<Handler> => {
  vi.resetModules();
  const module = await import('../../../api/youtube/search');
  return (module as { default: Handler }).default;
};

const upstreamPage = () => new Response(JSON.stringify({
  items: [{ id: { videoId: 'by4SYYWlhEs' }, snippet: { title: '夜に駆ける', channelTitle: 'YOASOBI' } }],
}), { status: 200 });

let originalKey: string | undefined;

beforeEach(() => {
  originalKey = process.env.YOUTUBE_API_KEY;
  process.env.YOUTUBE_API_KEY = 'test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalKey === undefined) delete process.env.YOUTUBE_API_KEY;
  else process.env.YOUTUBE_API_KEY = originalKey;
});

describe('youtube search proxy: quota protection', () => {
  it('answers the same query from cache without a second upstream call', async () => {
    // The acceptance criterion: 100 calls a day is spent fastest by repeating the same search.
    const fetchMock = vi.fn(async () => upstreamPage());
    vi.stubGlobal('fetch', fetchMock);

    const handler = await loadHandler();
    const first = createResponse();
    await handler(createRequest('/api/youtube/search?q=夜に駆ける'), first.response);

    const second = createResponse();
    await handler(createRequest('/api/youtube/search?q=夜に駆ける'), second.response);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.json().items).toHaveLength(1);
    expect(second.json().items).toHaveLength(1);
    expect(second.json().cached).toBe(true);
  });

  it('treats a differently cased or spaced query as the same search', async () => {
    const fetchMock = vi.fn(async () => upstreamPage());
    vi.stubGlobal('fetch', fetchMock);

    const handler = await loadHandler();
    await handler(createRequest('/api/youtube/search?q=YOASOBI%20%E5%A4%9C'), createResponse().response);
    await handler(createRequest('/api/youtube/search?q=yoasobi%20%20%E5%A4%9C'), createResponse().response);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('makes a separate upstream call for a different query', async () => {
    const fetchMock = vi.fn(async () => upstreamPage());
    vi.stubGlobal('fetch', fetchMock);

    const handler = await loadHandler();
    await handler(createRequest('/api/youtube/search?q=夜に駆ける'), createResponse().response);
    await handler(createRequest('/api/youtube/search?q=紅蓮華'), createResponse().response);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed upstream response', async () => {
    // A transient 502 cached for a minute would look like a broken feature, not a slow one.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockResolvedValueOnce(upstreamPage());
    vi.stubGlobal('fetch', fetchMock);

    const handler = await loadHandler();
    const failed = createResponse();
    await handler(createRequest('/api/youtube/search?q=夜に駆ける'), failed.response);
    expect(failed.state.statusCode).toBe(502);

    const retried = createResponse();
    await handler(createRequest('/api/youtube/search?q=夜に駆ける'), retried.response);
    expect(retried.state.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rate limits distinct queries from one client', async () => {
    const fetchMock = vi.fn(async () => upstreamPage());
    vi.stubGlobal('fetch', fetchMock);

    const handler = await loadHandler();
    // The limiter allows 20 per minute; the 21st distinct query is refused.
    for (let index = 0; index < 20; index += 1) {
      const ok = createResponse();
      await handler(createRequest(`/api/youtube/search?q=song-${index}`), ok.response);
      expect(ok.state.statusCode).toBe(200);
    }

    const blocked = createResponse();
    await handler(createRequest('/api/youtube/search?q=one-more'), blocked.response);

    expect(blocked.state.statusCode).toBe(429);
    expect(blocked.state.headers['retry-after']).toBeDefined();
    // The refused request must not have spent quota.
    expect(fetchMock).toHaveBeenCalledTimes(20);
  });

  it('charges the limiter only for misses, so cache hits stay free', async () => {
    // Otherwise the cache would be useless exactly when it matters: a user replaying the same search
    // would be throttled for behaviour the cache is supposed to absorb.
    const fetchMock = vi.fn(async () => upstreamPage());
    vi.stubGlobal('fetch', fetchMock);

    const handler = await loadHandler();
    for (let index = 0; index < 30; index += 1) {
      const response = createResponse();
      await handler(createRequest('/api/youtube/search?q=night'), response.response);
      expect(response.state.statusCode).toBe(200);
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives one client a budget without spending another one', async () => {
    const fetchMock = vi.fn(async () => upstreamPage());
    vi.stubGlobal('fetch', fetchMock);

    const handler = await loadHandler();
    for (let index = 0; index < 20; index += 1) {
      await handler(createRequest(`/api/youtube/search?q=a-${index}`, '10.0.0.1'), createResponse().response);
    }
    const otherClient = createResponse();
    await handler(createRequest('/api/youtube/search?q=b-1', '10.0.0.2'), otherClient.response);

    expect(otherClient.state.statusCode).toBe(200);
  });
});

describe('youtube search proxy: unchanged contract', () => {
  it('rejects a missing query', async () => {
    const handler = await loadHandler();
    const response = createResponse();
    await handler(createRequest('/api/youtube/search'), response.response);
    expect(response.state.statusCode).toBe(400);
  });

  it('rejects a query that is too long', async () => {
    const handler = await loadHandler();
    const response = createResponse();
    await handler(createRequest(`/api/youtube/search?q=${'a'.repeat(121)}`), response.response);
    expect(response.state.statusCode).toBe(400);
  });

  it('rejects a non-GET method', async () => {
    const handler = await loadHandler();
    const response = createResponse();
    await handler({ method: 'POST', url: '/api/youtube/search?q=x', headers: {} }, response.response);
    expect(response.state.statusCode).toBe(405);
  });

  it('degrades with 503 when no API key is configured', async () => {
    delete process.env.YOUTUBE_API_KEY;
    const handler = await loadHandler();
    const response = createResponse();
    await handler(createRequest('/api/youtube/search?q=夜に駆ける'), response.response);
    expect(response.state.statusCode).toBe(503);
  });

  it('keeps the search key out of the client-visible URL', async () => {
    // The whole reason this proxy exists rather than calling Google from the browser.
    const fetchMock = vi.fn(async () => upstreamPage());
    vi.stubGlobal('fetch', fetchMock);

    const handler = await loadHandler();
    const response = createResponse();
    await handler(createRequest('/api/youtube/search?q=夜に駆ける'), response.response);

    const upstreamUrl = String(fetchMock.mock.calls[0][0]);
    expect(upstreamUrl).toContain('key=test-key');
    expect(response.state.body).not.toContain('test-key');
  });
});
