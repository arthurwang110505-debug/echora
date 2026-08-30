import type { IncomingMessage, ServerResponse } from 'node:http';

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
    sendJson(response, 200, { items: Array.isArray((data as { items?: unknown }).items) ? (data as { items: unknown }).items : [] });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    console.error('[YouTube Search] proxy error', error instanceof Error ? error.message : error);
    sendJson(response, aborted ? 504 : 502, { error: aborted ? 'YouTube 搜尋服務逾時，請稍後再試。' : 'YouTube 搜尋服務暫時無法使用。' });
  } finally {
    clearTimeout(timer);
  }
}
