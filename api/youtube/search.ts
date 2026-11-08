import type { IncomingMessage, ServerResponse } from 'node:http';
import { SearchCache, RateLimiter, buildSearchCacheKey } from '../../packages/web/src/lib/searchCache';

type ApiResponse = ServerResponse;

type ApiRequest = IncomingMessage & {
  method?: string;
};

const sendJson = (response: ApiResponse, status: number, payload: unknown) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
};

const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const MAX_QUERY_LENGTH = 120;
const UPSTREAM_TIMEOUT_MS = 8000;

/**
 * Shared across requests for the life of the instance.
 *
 * Module scope is what makes this a cache at all: a per-request `new SearchCache()` would always be
 * empty. `search.list` is allowed 100 calls per day in its own quota bucket, and this is the only
 * thing standing between a reload-happy user and a used-up budget.
 */
const cache = new SearchCache();
const limiter = new RateLimiter();

/**
 * Best-effort client identity for rate limiting.
 *
 * Vercel sets `x-forwarded-for`; the first entry is the client. This is not authentication and it is
 * spoofable by design - the goal is to stop one browser draining a 100-call day, not to enforce
 * anything. A shared NAT gets one budget between them, which is acceptable for a limit this loose.
 */
const getClientKey = (request: ApiRequest): string => {
  const forwarded = request.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (raw || '').split(',')[0].trim() || 'unknown';
};

/**
 * Serverless proxy for public YouTube Music search.
 *
 * The browser only sees this same-origin endpoint; the Google Cloud Data API v3
 * key lives in `process.env.YOUTUBE_API_KEY` and never ships to the client.
 * Playback is still handled by the YouTube IFrame Player, so a search result only
 * needs a valid 11-character video id.
 */
export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    sendJson(response, 405, { error: '只支援 GET。' });
    return;
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    sendJson(response, 503, { error: '尚未設定 YouTube 搜尋服務，請改從已同步的私人歌單選取曲目。' });
    return;
  }

  let query = '';
  try {
    const url = new URL(request.url || '/', 'http://localhost');
    query = (url.searchParams.get('q') || '').trim();
  } catch {
    // Malformed URL falls through to the empty-query validation below.
  }

  if (!query) {
    sendJson(response, 400, { error: '缺少搜尋關鍵字。' });
    return;
  }
  if (query.length > MAX_QUERY_LENGTH) {
    sendJson(response, 400, { error: '搜尋關鍵字太長。' });
    return;
  }

  // Serve from cache before touching the quota. A cache hit costs nothing and is indistinguishable
  // from fresh data at this TTL.
  const cacheKey = buildSearchCacheKey(query);
  const cached = cache.get(cacheKey);
  if (cached) {
    sendJson(response, 200, { items: cached, cached: true });
    return;
  }

  // Only *misses* are rate limited. Charging the limiter for a cache hit would punish the exact
  // behaviour the cache exists to encourage.
  const { allowed, retryAfterSeconds } = limiter.take(getClientKey(request));
  if (!allowed) {
    response.setHeader('Retry-After', String(retryAfterSeconds));
    sendJson(response, 429, { error: `搜尋次數過多，請 ${retryAfterSeconds} 秒後再試。` });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(
      `${YOUTUBE_SEARCH_URL}?part=snippet&type=video&videoCategoryId=10&maxResults=20&q=${encodeURIComponent(query)}&key=${encodeURIComponent(apiKey)}`,
      { signal: controller.signal },
    );

    if (!upstream.ok) {
      console.error('[YouTube Search] upstream request failed', { status: upstream.status });
      sendJson(response, 502, { error: `YouTube 搜尋服務暫時無法使用（HTTP ${upstream.status}），請稍後再試。` });
      return;
    }

    const data = await upstream.json();
    const items = Array.isArray((data as { items?: unknown }).items) ? (data as { items: unknown[] }).items : [];
    // Only successful answers are cached: caching a 502 would make a transient upstream failure
    // sticky for a minute.
    cache.set(cacheKey, items);
    sendJson(response, 200, { items });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    console.error('[YouTube Search] proxy error', error instanceof Error ? error.message : error);
    sendJson(response, aborted ? 504 : 502, { error: aborted ? 'YouTube 搜尋服務逾時，請稍後再試。' : 'YouTube 搜尋服務暫時無法使用。' });
  } finally {
    clearTimeout(timer);
  }
}
