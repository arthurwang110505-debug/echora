import type { IncomingMessage } from 'node:http';
import { respond as sendJson, respondRaw, methodNotAllowed, type ApiResponse } from '../_lib/http';
import { RateLimiter, clientKey } from '../_lib/limits';
import { isAllowedRequest, requestHostname } from '../_lib/origin';

type ApiRequest = IncomingMessage & { method?: string };

// api/lyrics/amll.ts
//
// The one route that talks to the AMLL TTML database.
//
// The shape of this endpoint is the security design, not an implementation detail:
//
//   /api/lyrics/amll?platform=ncm&id=347230
//
// It accepts **no URL**. The client names a platform and an id; this handler validates both against
// a hard-coded allowlist and builds the upstream URL itself. A route like
// `/api/lyric-proxy?url=…`, which the upstream project this port came from uses, is a general
// server-side request forgery primitive: it will happily fetch `http://169.254.169.254/…` or an
// internal host, and no amount of "validate the URL" inside it stays correct under refactoring. The
// narrow shape removes the class of bug rather than filtering it.
//
// That also settles a second question. This app does not proxy arbitrary third-party lyric services
// (QQ Music, Kugou) - only a CC0-licensed community database, which is what the licence is for.
// Adding a host here is a deliberate legal decision, not a configuration change.

const AMLL_DB_ORIGIN = 'https://amll-ttml-db.stevexmh.net';
const UPSTREAM_TIMEOUT_MS = 8_000;

/** The platforms the database is organised by, and the only path segments this will ever request. */
const ALLOWED_PLATFORMS = new Set(['ncm', 'qq', 'spotify', 'am']);
/** Platform ids are plain integers; anchoring the charset keeps `../` out of the URL. */
const PLATFORM_ID = /^\d{1,20}$/;

// Rate limiting, per client. The database is a community service run by one person, not a paid
// API: the limit here is about not being the reason it falls over, not about our bill.
const limiter = new RateLimiter(60, 60_000);

/**
 * The largest lyric document this will read into memory.
 *
 * `upstream.text()` used to have no bound at all, so a hostile or broken upstream could stream
 * until the function ran out of memory. TTML is text: a dense, long song is well under 200 kB.
 */
const MAX_DOCUMENT_BYTES = 1_000_000;

/**
 * Cache headers for a found document.
 *
 * `max-age` alone is a browser cache; Vercel's CDN keys on `s-maxage`, so without it every request
 * for the same song reached the database. `stale-while-revalidate` lets the CDN answer instantly
 * while it refreshes, which is what keeps a popular song from being a repeated upstream hit.
 */
const HIT_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
};

/**
 * Cache headers for "this song is not in the database".
 *
 * A miss is also answerable and also stable - the database does not gain the song by being asked
 * again in ten seconds - but shorter, because it does get updated over time and a wrong 404 is more
 * damaging than a slow 200.
 */
const MISS_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
};

/**
 * Builds the upstream URL from a validated pair.
 *
 * Exported for the test that asserts no input can produce a URL outside the database - the property
 * that matters is about every input, not about the examples.
 */
export const buildUpstreamUrl = (platform: string, id: string): string | null => {
  if (!ALLOWED_PLATFORMS.has(platform)) return null;
  if (!PLATFORM_ID.test(id)) return null;
  const url = new URL(`${AMLL_DB_ORIGIN}/${platform}-lyrics/${id}.ttml`);
  // Belt and braces: even with both checks above, refuse anything that is not the expected origin.
  if (url.origin !== AMLL_DB_ORIGIN) return null;
  return url.toString();
};

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'GET') return methodNotAllowed(response, 'GET');

  const headers = request.headers as Record<string, string | string[] | undefined>;
  // Public, cacheable lyric documents: a headerless caller is fine (this is a read of a CC0
  // corpus), but a page on another site must not be able to drive it.
  if (!isAllowedRequest(headers.origin, { sameOrigin: requestHostname(headers), allowMissingOrigin: true })) {
    return sendJson(response, 403, { error: '不允許的來源。' });
  }

  const { allowed, retryAfterSeconds } = limiter.take(clientKey(headers, request.socket?.remoteAddress || 'unknown'));
  if (!allowed) {
    response.setHeader('Retry-After', String(retryAfterSeconds));
    return sendJson(response, 429, { error: '請求過於頻繁，請稍後再試。' });
  }

  let platform = '';
  let id = '';
  try {
    const url = new URL(request.url || '/', 'http://localhost');
    platform = (url.searchParams.get('platform') || '').trim();
    id = (url.searchParams.get('id') || '').trim();
  } catch {
    // A malformed URL falls through to the validation below and is rejected as a bad request.
  }

  const upstreamUrl = buildUpstreamUrl(platform, id);
  if (!upstreamUrl) {
    // One message for every rejection: naming which part was wrong would describe the internal
    // allowlist to a caller that has no business knowing it.
    sendJson(response, 400, { error: '不支援的歌詞來源或編號。' });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(upstreamUrl, {
      // A plain read of a public file. No credentials, no forwarding of the caller's headers: the
      // upstream should see this deployment, not whoever made the request.
      headers: { Accept: 'application/ttml+xml, text/xml, */*' },
      signal: controller.signal,
      redirect: 'error',
    });

    // A missing document is a normal answer - the database simply does not have this song - so it is
    // 404 and not an error, and the client treats it as "this source has nothing".
    if (upstream.status === 404) {
      response.setHeader('Cache-Control', MISS_CACHE_HEADERS['Cache-Control']);
      return sendJson(response, 404, { error: '這個來源沒有這首歌的歌詞。' });
    }
    if (!upstream.ok) {
      console.error('[AMLL DB] upstream failed', { status: upstream.status });
      sendJson(response, 502, { error: `歌詞來源暫時無法使用（HTTP ${upstream.status}）。` });
      return;
    }

    const declared = Number(upstream.headers.get('content-length') || 0);
    if (Number.isFinite(declared) && declared > MAX_DOCUMENT_BYTES) {
      console.error('[AMLL DB] upstream document too large', { declared });
      return sendJson(response, 502, { error: '歌詞檔案過大，無法載入。' });
    }

    // Read with a cap rather than `.text()`: a missing or lying Content-Length still gets bounded,
    // because the stream is counted as it arrives and abandoned once it passes the limit.
    const chunks: Uint8Array[] = [];
    let received = 0;
    if (upstream.body) {
      for await (const chunk of upstream.body as unknown as AsyncIterable<Uint8Array>) {
        received += chunk.byteLength;
        if (received > MAX_DOCUMENT_BYTES) {
          console.error('[AMLL DB] upstream document exceeded the size cap', { received });
          return sendJson(response, 502, { error: '歌詞檔案過大，無法載入。' });
        }
        chunks.push(chunk);
      }
    }
    const text = Buffer.concat(chunks).toString('utf8');
    // Passed through as XML, not JSON: wrapping it would add a parse/encode round trip for nothing.
    return respondRaw(response, 200, 'application/ttml+xml; charset=utf-8', text, HIT_CACHE_HEADERS);
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    console.error('[AMLL DB] proxy error', error instanceof Error ? error.message : error);
    sendJson(response, aborted ? 504 : 502, { error: aborted ? '歌詞來源逾時，請稍後再試。' : '歌詞來源暫時無法使用。' });
  } finally {
    clearTimeout(timer);
  }
}
