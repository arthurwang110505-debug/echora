import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The endpoint's contract is a security property, so that is what these test.
 *
 * The upstream project this port came from used `/api/lyric-proxy?url=…`, which accepts any URL and
 * fetches it server-side. That is a request forgery primitive: `http://169.254.169.254/…` is a cloud
 * instance's metadata service and `http://localhost:5432` is whatever happens to be listening. The
 * fix is not better validation inside such a route - it is a route that cannot express the request.
 * `?platform=ncm&id=347230` names a pair, and this handler builds the URL.
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
  return { response, state, json: () => JSON.parse(state.body || 'null') };
};

const request = (url: string) => ({ method: 'GET', url, headers: {} });

const loadHandler = async (): Promise<Handler> => {
  vi.resetModules();
  const module = await import('../../../api/lyrics/amll');
  return (module as { default: Handler }).default;
};

/** A minimal but real document shape, so the pass-through path is exercised. */
const TTML = '<tt><body><div><p begin="00:01.000" end="00:02.000">'
  + '<span begin="00:01.000" end="00:01.500">今</span><span begin="00:01.500" end="00:02.000">天</span>'
  + '</p></div></body></tt>';

afterEach(() => { vi.unstubAllGlobals(); });

describe('amll lyrics proxy: request forging is not expressible', () => {
  it('never fetches anything but the database host', async () => {
    // The whole point: whatever the caller sends, the only host reachable is the allowlisted one.
    const fetchMock = vi.fn(async () => new Response(TTML, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    for (const url of [
      '/api/lyrics/amll?platform=ncm&id=347230',
      '/api/lyrics/amll?platform=http://169.254.169.254&id=latest',
      '/api/lyrics/amll?platform=ncm&id=../../etc/passwd',
      // A valid pair with a hostile extra parameter: the extra is ignored, and the URL is still
      // built here. This is the case a `?url=` route cannot defend against and this one cannot
      // express at all.
      '/api/lyrics/amll?platform=ncm&id=2&url=http://169.254.169.254/',
      '/api/lyrics/amll?url=http://169.254.169.254/latest/meta-data',
      '/api/lyrics/amll?platform=ncm&id=1%2F..%2F..%2Fetc%2Fpasswd',
    ]) {
      await handler(request(url), createResponse().response);
    }

    // Two of the inputs name a real platform and a real id; the rest are rejected outright.
    // What matters is the invariant below: no input produces a request anywhere else.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
    for (const [upstream] of fetchMock.mock.calls) {
      expect(String(upstream).startsWith('https://amll-ttml-db.stevexmh.net/')).toBe(true);
      expect(String(upstream)).not.toContain('169.254');
      expect(String(upstream)).not.toContain('passwd');
    }
  });

  it('rejects a platform outside the allowlist', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    const { response, state } = createResponse();
    await handler(request('/api/lyrics/amll?platform=evil&id=1'), response);

    expect(state.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['../etc/passwd', '1 OR 1=1', 'abc', '', '1/2', '１２３'])(
    'rejects the id %j',
    async id => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const handler = await loadHandler();

      const { response, state } = createResponse();
      await handler(request(`/api/lyrics/amll?platform=ncm&id=${encodeURIComponent(id)}`), response);

      expect(state.statusCode).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('says nothing about which part of the request was wrong', async () => {
    // Describing the allowlist to a caller is a free map of the server.
    const handler = await loadHandler();
    const { response, state } = createResponse();
    await handler(request('/api/lyrics/amll?platform=evil&id=1'), response);
    expect(state.body).not.toContain('ncm');
    expect(state.body).not.toContain('allow');
  });

  it('does not follow a redirect away from the database', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    await handler(request('/api/lyrics/amll?platform=ncm&id=347230'), createResponse().response);

    // `redirect: 'error'` means a 3xx is an exception rather than a silent hop to another origin.
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
  });
});

describe('amll lyrics proxy: passing a document through', () => {
  it('returns the TTML verbatim with its own content type', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(TTML, { status: 200 })));
    const handler = await loadHandler();

    const { response, state } = createResponse();
    await handler(request('/api/lyrics/amll?platform=ncm&id=347230'), response);

    expect(state.statusCode).toBe(200);
    expect(state.headers['content-type']).toContain('ttml');
    // Verbatim: re-encoding XML on the server would be a parse step with nothing to gain.
    expect(state.body).toBe(TTML);
  });

  it('caches at the CDN, not only in the browser', async () => {
    // `max-age` alone is a browser cache: Vercel's edge keys on `s-maxage`, so a header without it
    // meant every request for the same song reached the community database.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(TTML, { status: 200 })));
    const handler = await loadHandler();

    const { response, state } = createResponse();
    await handler(request('/api/lyrics/amll?platform=ncm&id=347230'), response);
    const cacheControl = String(state.headers['cache-control']);
    expect(cacheControl).toContain('s-maxage=');
    expect(cacheControl).toContain('stale-while-revalidate=');
  });

  it('also caches a miss, so a song the database lacks is not asked for repeatedly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    const handler = await loadHandler();

    const { response, state } = createResponse();
    await handler(request('/api/lyrics/amll?platform=ncm&id=999999999'), response);
    expect(state.statusCode).toBe(404);
    // Shorter than a hit, but present: a missing song stays missing for a while.
    expect(String(state.headers['cache-control'])).toContain('s-maxage=3600');
  });

  it('treats a missing song as a normal 404, not a failure', async () => {
    // The database simply does not have every song. That is an answer, and the client falls back.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    const handler = await loadHandler();

    const { response, state } = createResponse();
    await handler(request('/api/lyrics/amll?platform=ncm&id=999999999'), response);
    expect(state.statusCode).toBe(404);
  });

  it('reports an upstream failure as 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    const handler = await loadHandler();

    const { response, state } = createResponse();
    await handler(request('/api/lyrics/amll?platform=ncm&id=347230'), response);
    expect(state.statusCode).toBe(502);
  });

  it('reports a timeout as 504', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }));
    const handler = await loadHandler();

    const { response, state } = createResponse();
    await handler(request('/api/lyrics/amll?platform=ncm&id=347230'), response);
    expect(state.statusCode).toBe(504);
  });

  it('rejects a non-GET method', async () => {
    const handler = await loadHandler();
    const { response, state } = createResponse();
    await handler({ method: 'POST', url: '/api/lyrics/amll?platform=ncm&id=1', headers: {} }, response);
    expect(state.statusCode).toBe(405);
  });

  it('does not forward credentials to the upstream', async () => {
    // The upstream should see this deployment, not the visitor.
    const fetchMock = vi.fn(async () => new Response(TTML, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();

    await handler(request('/api/lyrics/amll?platform=ncm&id=347230'), createResponse().response);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).not.toHaveProperty('Cookie');
    expect(init.headers).not.toHaveProperty('Authorization');
  });
});
