import type { IncomingMessage, ServerResponse } from 'node:http';

type ApiResponse = ServerResponse;
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

const sendJson = (response: ApiResponse, status: number, payload: unknown) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
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
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    sendJson(response, 405, { error: '只支援 GET。' });
    return;
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
      sendJson(response, 404, { error: '這個來源沒有這首歌的歌詞。' });
      return;
    }
    if (!upstream.ok) {
      console.error('[AMLL DB] upstream failed', { status: upstream.status });
      sendJson(response, 502, { error: `歌詞來源暫時無法使用（HTTP ${upstream.status}）。` });
      return;
    }

    const text = await upstream.text();
    // Passed through as text, not JSON: it is XML, and wrapping it would add a parse/encode round
    // trip on the server for nothing.
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/ttml+xml; charset=utf-8');
    // A lyric document does not change once published, and the client caches by itself; this only
    // spares the database a repeat request for the same song.
    response.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    response.end(text);
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    console.error('[AMLL DB] proxy error', error instanceof Error ? error.message : error);
    sendJson(response, aborted ? 504 : 502, { error: aborted ? '歌詞來源逾時，請稍後再試。' : '歌詞來源暫時無法使用。' });
  } finally {
    clearTimeout(timer);
  }
}
