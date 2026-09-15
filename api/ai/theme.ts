import type { IncomingMessage, ServerResponse } from 'node:http';

type ApiResponse = ServerResponse & {
  status?: (code: number) => ApiResponse;
  json?: (payload: unknown) => void;
};

type ApiRequest = IncomingMessage & {
  method?: string;
  body?: unknown;
};

type ThemeSide = {
  name: string;
  backgroundColor: string;
  primaryColor: string;
  accentColor: string;
  secondaryColor: string;
  wordColors?: { word: string; color: string }[];
  lyricsIcons?: string[];
  fontStyle?: 'sans' | 'serif' | 'mono';
};

type ThemeResponse = { light: ThemeSide; dark: ThemeSide };

type ThemeRequest = {
  lyricsText?: unknown;
  isPureMusic?: unknown;
  songTitle?: unknown;
};

const AGNES_BASE_URL = 'https://apihub.agnes-ai.com/v1';
const AGNES_MODEL = process.env.AGNES_MODEL || 'agnes-2.0-flash';
const COLOR_PATTERN = /^#[0-9a-f]{3,8}$/i;
const MAX_LYRICS_LENGTH = 2_000;
const MAX_BODY_BYTES = 32_000;

// Upstream call budget: abort slow responses so a stalled Agnes call cannot hold
// the serverless function (and its billed execution time) open indefinitely.
const UPSTREAM_TIMEOUT_MS = 12_000;

// In-memory theme cache. Keyed by the full prompt context so the same song never
// pays for a second generation within the TTL. State resets on cold start, which
// is the accepted trade-off of the zero-extra-infrastructure option.
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX_ENTRIES = 50;
const themeCache = new Map<string, { expiresAt: number; value: ThemeResponse }>();

// In-memory per-client rate limit. Serverless instances may not share this state,
// but it still blunts bursts from a single caller.
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateBuckets = new Map<string, number[]>();

const ALLOWED_ORIGINS = (process.env.ECHORA_ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const FALLBACK_THEME: ThemeResponse = {
  light: {
    name: 'AI Light',
    backgroundColor: '#f6f3ef',
    primaryColor: '#231f20',
    accentColor: '#c96e4f',
    secondaryColor: '#5c4d48',
    fontStyle: 'sans',
  },
  dark: {
    name: 'AI Dark',
    backgroundColor: '#101217',
    primaryColor: '#f6f3ef',
    accentColor: '#d88d6e',
    secondaryColor: '#b9aea7',
    fontStyle: 'sans',
  },
};

const sendJson = (response: ApiResponse, status: number, payload: unknown) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
};

const readBody = async (request: ApiRequest): Promise<ThemeRequest> => {
  if (request.body && typeof request.body === 'object') return request.body as ThemeRequest;

  const declaredLength = Number(request.headers['content-length'] || 0);
  if (declaredLength > MAX_BODY_BYTES) throw new Error('請求內容過大。');

  let raw = '';
  let received = 0;
  for await (const chunk of request) {
    received += String(chunk).length;
    if (received > MAX_BODY_BYTES) throw new Error('請求內容過大。');
    raw += String(chunk);
  }
  if (!raw.trim()) return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as ThemeRequest : {};
  } catch {
    throw new Error('請求內容不是有效的 JSON。');
  }
};

const stringValue = (value: unknown, fallback: string): string => (
  typeof value === 'string' && value.trim() ? value.trim() : fallback
);

const colorValue = (value: unknown, fallback: string): string => (
  typeof value === 'string' && COLOR_PATTERN.test(value.trim()) ? value.trim() : fallback
);

const parseJsonContent = (content: string): unknown => {
  const cleaned = content
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI 主題服務回傳的格式無法解析。');
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error('AI 主題服務回傳的內容不是有效的 JSON。');
  }
};

const normalizeSide = (value: unknown, fallback: ThemeSide): ThemeSide => {
  if (!value || typeof value !== 'object') throw new Error('AI 主題服務回傳缺少完整的 light/dark 主題。');
  const source = value as Record<string, unknown>;
  const fontStyle = source.fontStyle === 'serif' || source.fontStyle === 'mono' ? source.fontStyle : 'sans';
  const wordColors = Array.isArray(source.wordColors)
    ? source.wordColors
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
      .map(entry => ({
        word: stringValue(entry.word, ''),
        color: colorValue(entry.color, ''),
      }))
      .filter(entry => entry.word && entry.color)
      .slice(0, 24)
    : undefined;
  const lyricsIcons = Array.isArray(source.lyricsIcons)
    ? source.lyricsIcons.filter((icon): icon is string => typeof icon === 'string' && Boolean(icon.trim())).slice(0, 12)
    : undefined;

  return {
    name: stringValue(source.name, fallback.name).slice(0, 80),
    backgroundColor: colorValue(source.backgroundColor, fallback.backgroundColor),
    primaryColor: colorValue(source.primaryColor, fallback.primaryColor),
    accentColor: colorValue(source.accentColor, fallback.accentColor),
    secondaryColor: colorValue(source.secondaryColor, fallback.secondaryColor),
    ...(wordColors?.length ? { wordColors } : {}),
    ...(lyricsIcons?.length ? { lyricsIcons } : {}),
    fontStyle,
  };
};

const normalizeTheme = (value: unknown): ThemeResponse => {
  if (!value || typeof value !== 'object') throw new Error('AI 主題服務回傳缺少主題資料。');
  const source = value as Record<string, unknown>;
  return {
    light: normalizeSide(source.light, FALLBACK_THEME.light),
    dark: normalizeSide(source.dark, FALLBACK_THEME.dark),
  };
};

const getContent = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object') return '';
  const message = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) {
    return message
      .filter((part): part is { text?: unknown } => Boolean(part) && typeof part === 'object')
      .map(part => typeof part.text === 'string' ? part.text : '')
      .join('');
  }
  return '';
};

const buildPrompt = (request: ThemeRequest): string => {
  const lyrics = stringValue(request.lyricsText, '').slice(0, MAX_LYRICS_LENGTH);
  const title = stringValue(request.songTitle, 'Echora showcase').slice(0, 160);
  const isPureMusic = Boolean(request.isPureMusic);
  return `You are the visual theme designer for Echora, an immersive music lyrics player. Create one light and one dark theme based on the song context below. Return JSON only, without markdown or commentary, using exactly this structure: {"light":{"name":"...","backgroundColor":"#hex","primaryColor":"#hex","accentColor":"#hex","secondaryColor":"#hex","wordColors":[{"word":"...","color":"#hex"}],"lyricsIcons":["Heart"],"fontStyle":"sans"},"dark":{"name":"...","backgroundColor":"#hex","primaryColor":"#hex","accentColor":"#hex","secondaryColor":"#hex","wordColors":[{"word":"...","color":"#hex"}],"lyricsIcons":["Cloud"],"fontStyle":"sans"}}. Use only valid CSS hex colors and fontStyle sans, serif, or mono. Keep wordColors concise and use Lucide icon names only. Song title: ${title}. Pure music: ${isPureMusic}. Lyrics or audio context: ${lyrics || '[instrumental / no lyrics]'}`;
};

/** Deterministic, collision-resistant-enough cache key for the prompt context. */
const cacheKeyFor = (request: ThemeRequest): string => {
  const seed = `${stringValue(request.songTitle, '')}|${stringValue(request.lyricsText, '').slice(0, MAX_LYRICS_LENGTH)}|${Boolean(request.isPureMusic)}`;
  let hash = 5381;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) >>> 0;
  }
  return `theme:${hash.toString(36)}`;
};

const readClientIp = (request: ApiRequest): string => {
  const forwarded = request.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof first === 'string' && first.trim()) return first.split(',')[0].trim();
  return request.socket?.remoteAddress || 'unknown';
};

const isRateLimited = (clientKey: string): boolean => {
  const now = Date.now();
  const bucket = (rateBuckets.get(clientKey) || []).filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
  if (bucket.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(clientKey, bucket);
    return true;
  }
  bucket.push(now);
  rateBuckets.set(clientKey, bucket);
  return false;
};

const isAllowedOrigin = (origin: string | undefined): boolean => {
  // Non-browser requests (curl, same-origin fetches) do not send Origin.
  if (!origin) return true;
  let hostname = '';
  try {
    hostname = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (ALLOWED_ORIGINS.length > 0) {
    return ALLOWED_ORIGINS.some(allowed => {
      try {
        return new URL(allowed).hostname.toLowerCase() === hostname;
      } catch {
        return allowed.toLowerCase() === hostname;
      }
    });
  }
  // Default policy: the deployed *.vercel.app host and local development only.
  return /(^|\.)vercel\.app$/.test(hostname) || hostname === 'localhost' || hostname === '127.0.0.1';
};

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    sendJson(response, 405, { error: '只支援 POST。' });
    return;
  }

  if (!isAllowedOrigin(request.headers.origin)) {
    sendJson(response, 403, { error: '不允許的來源。' });
    return;
  }

  if (isRateLimited(readClientIp(request))) {
    sendJson(response, 429, { error: '請求過於頻繁，請稍後再試。' });
    return;
  }

  const apiKey = process.env.AGNES_API_KEY;
  if (!apiKey) {
    sendJson(response, 503, { error: 'AI 主題服務尚未完成設定，請稍後再試。' });
    return;
  }

  try {
    const requestBody = await readBody(request);
    const cacheKey = cacheKeyFor(requestBody);
    const cached = themeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      sendJson(response, 200, cached.value);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const upstream = await fetch(`${AGNES_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: AGNES_MODEL,
          messages: [{ role: 'user', content: buildPrompt(requestBody) }],
          temperature: 0.7,
        }),
        signal: controller.signal,
      });

      const payload = await upstream.json().catch(() => null);
      if (!upstream.ok) {
        console.error('[Agnes AI] upstream request failed', { status: upstream.status });
        sendJson(response, 502, { error: `AI 主題服務請求失敗（HTTP ${upstream.status}），請稍後再試。` });
        return;
      }

      const content = getContent(payload);
      if (!content) {
        sendJson(response, 502, { error: 'AI 主題服務沒有回傳可用的主題內容。' });
        return;
      }

      const theme = normalizeTheme(parseJsonContent(content));
      if (themeCache.size >= CACHE_MAX_ENTRIES) {
        const oldest = themeCache.keys().next().value;
        if (oldest) themeCache.delete(oldest);
      }
      themeCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: theme });
      sendJson(response, 200, theme);
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    console.error('[Agnes AI] theme proxy error', error instanceof Error ? error.message : error);
    sendJson(response, aborted ? 504 : 400, { error: aborted ? 'AI 主題服務逾時，請稍後再試。' : error instanceof Error ? error.message : 'AI 主題生成失敗。' });
  }
}
