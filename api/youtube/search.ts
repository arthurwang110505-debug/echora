import type { IncomingMessage } from 'node:http';
import { SearchCache, RateLimiter, buildSearchCacheKey } from '../../packages/web/src/lib/searchCache';
import { respond, methodNotAllowed, type ApiResponse } from '../_lib/http';
import { DailyCeiling } from '../_lib/limits';
import { isAllowedRequest, requestHostname } from '../_lib/origin';

type ApiRequest = IncomingMessage & {
  method?: string;
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
 * A hard stop for the shared daily quota.
 *
 * `search.list` allows 100 calls a day. The cache and the per-client limiter above both assume a
 * caller who is merely enthusiastic; neither survives a caller who is not. This is the number that
 * means a spent budget costs an attacker real requests rather than one loop, and that the app still
 * has search tomorrow. Set well under 100 so a burst cannot take the whole day in one instance.
 */
const DAILY_UPSTREAM_CEILING = 60;
const ceiling = new DailyCeiling(DAILY_UPSTREAM_CEILING);

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
  if (request.method !== 'GET') return methodNotAllowed(response, 'GET');

  // This route had no origin check at all, which is what let a script spend the day's 100 calls
  // before anyone else searched. It returns public data, so a headerless caller is allowed - a
  // plain link or a prefetcher is not the threat - but a browser page on another site is refused.
  const headers = request.headers as Record<string, string | string[] | undefined>;
  if (!isAllowedRequest(headers.origin, { sameOrigin: requestHostname(headers), allowMissingOrigin: true })) {
    return respond(response, 403, { error: '不允許的來源。' });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return respond(response, 503, { error: '尚未設定 YouTube 搜尋服務，請改從已同步的私人歌單選取曲目。' });
  }

  let query = '';
  try {
    const url = new URL(request.url || '/', 'http://localhost');
    query = (url.searchParams.get('q') || '').trim();
  } catch {
    // Malformed URL falls through to the empty-query validation below.
  }

  if (!query) {
    return respond(response, 400, { error: '缺少搜尋關鍵字。' });
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return respond(response, 400, { error: '搜尋關鍵字太長。' });
  }

  // Serve from cache before touching the quota. A cache hit costs nothing and is indistinguishable
  // from fresh data at this TTL.
  const cacheKey = buildSearchCacheKey(query);
  const cached = cache.get(cacheKey);
  if (cached) {
    // A cache hit costs no quota, so it is served even when the ceiling is spent: the whole point
    // of the cache is that repeated searches keep working after the upstream budget is gone.
    return respond(response, 200, { items: cached, cached: true });
  }

  // Only *misses* are rate limited. Charging the limiter for a cache hit would punish the exact
  // behaviour the cache exists to encourage.
  const { allowed, retryAfterSeconds } = limiter.take(getClientKey(request));
  if (!allowed) {
    response.setHeader('Retry-After', String(retryAfterSeconds));
    return respond(response, 429, { error: `搜尋次數過多，請 ${retryAfterSeconds} 秒後再試。` });
  }

  if (!ceiling.take()) {
    console.warn('[YouTube Search] daily upstream ceiling reached', { ceiling: DAILY_UPSTREAM_CEILING });
    return respond(response, 429, { error: '今天的搜尋額度已用完，請明天再試或改用已同步的私人歌單。' });
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
      return respond(response, 502, { error: `YouTube 搜尋服務暫時無法使用（HTTP ${upstream.status}），請稍後再試。` });
    }

    const data = await upstream.json();
    const items = Array.isArray((data as { items?: unknown }).items) ? (data as { items: unknown[] }).items : [];
    // Only successful answers are cached: caching a 502 would make a transient upstream failure
    // sticky for a minute.
    cache.set(cacheKey, items);
    return respond(response, 200, { items });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    console.error('[YouTube Search] proxy error', error instanceof Error ? error.message : error);
    return respond(response, aborted ? 504 : 502, { error: aborted ? 'YouTube 搜尋服務逾時，請稍後再試。' : 'YouTube 搜尋服務暫時無法使用。' });
  } finally {
    clearTimeout(timer);
  }
}
