import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { readJsonBody, BodyError } from '../_lib/body';
import { ensureContrast, isHexColor } from '../_lib/color';
import { respond, methodNotAllowed, type ApiResponse } from '../_lib/http';
import { DailyCeiling, RateLimiter, clientKey } from '../_lib/limits';
import { isAllowedRequest, requestHostname } from '../_lib/origin';

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

const AGNES_BASE_URL = process.env.AGNES_BASE_URL || 'https://apihub.agnes-ai.com/v1';
const AGNES_MODEL = process.env.AGNES_MODEL || 'agnes-2.0-flash';
const MAX_LYRICS_LENGTH = 2_000;
const MAX_BODY_BYTES = 32_000;

// Upstream call budget: abort slow responses so a stalled Agnes call cannot hold the serverless
// function (and its billed execution time) open indefinitely.
const UPSTREAM_TIMEOUT_MS = 12_000;

// Enough for one theme object twice over. Without it the model can run to its own default limit,
// which is billed against the same balance as a useful answer.
const MAX_OUTPUT_TOKENS = 1_200;

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

// A paid generation behind every request: this is the number that decides what a bad day costs.
// Per instance, so the effective ceiling is `live instances × this` - see api/_lib/limits.ts.
const DAILY_GENERATION_CEILING = 300;

// In-memory theme cache, keyed by a SHA-256 of the prompt context.
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX_ENTRIES = 50;
const themeCache = new Map<string, { expiresAt: number; value: ThemeResponse }>();

const limiter = new RateLimiter(RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
const ceiling = new DailyCeiling(DAILY_GENERATION_CEILING);

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

const stringValue = (value: unknown, fallback: string): string => (
  typeof value === 'string' && value.trim() ? value.trim() : fallback
);

const colorValue = (value: unknown, fallback: string): string => (
  isHexColor(value) ? value.trim() : fallback
);

const parseJsonContent = (content: string): unknown => {
  const cleaned = content
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI 主題服務回傳的格式無法解析。');
  return JSON.parse(cleaned.slice(start, end + 1));
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

  const backgroundColor = colorValue(source.backgroundColor, fallback.backgroundColor);

  return {
    name: stringValue(source.name, fallback.name).slice(0, 80),
    backgroundColor,
    // The model has no idea that a theme is mostly a readability problem, so the check happens
    // here. Without it a perfectly valid answer can produce a stage whose lyrics are invisible.
    // `ensureContrast` keeps the hue and only moves the lightness, so a good answer is untouched.
    primaryColor: ensureContrast(colorValue(source.primaryColor, fallback.primaryColor), backgroundColor),
    accentColor: ensureContrast(colorValue(source.accentColor, fallback.accentColor), backgroundColor),
    secondaryColor: ensureContrast(colorValue(source.secondaryColor, fallback.secondaryColor), backgroundColor),
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
  return `You are the visual theme designer for Echora, an immersive music lyrics player. Create one light and one dark theme based on the song context below. Return JSON only, without markdown or commentary, using exactly this structure: {"light":{"name":"...","backgroundColor":"#hex","primaryColor":"#hex","accentColor":"#hex","secondaryColor":"#hex","wordColors":[{"word":"...","color":"#hex"}],"lyricsIcons":["Heart"],"fontStyle":"sans"},"dark":{"name":"...","backgroundColor":"#hex","primaryColor":"#hex","accentColor":"#hex","secondaryColor":"#hex","wordColors":[{"word":"...","color":"#hex"}],"lyricsIcons":["Cloud"],"fontStyle":"sans"}}. Use only valid CSS hex colors (3, 6 or 8 digits) and fontStyle sans, serif, or mono. The primaryColor must be clearly readable against backgroundColor: aim for a WCAG contrast ratio of at least 4.5. Keep wordColors concise and use Lucide icon names only. Song title: ${title}. Pure music: ${isPureMusic}. Lyrics or audio context: ${lyrics || '[instrumental / no lyrics]'}`;
};

/**
 * Cache key for the prompt context.
 *
 * This used to be a 32-bit djb2 hash, which is small enough that two different songs collide by
 * birthday: a few thousand titles in a shared instance is enough. A collision is not a crash, it is
 * one song silently wearing another song's theme - the kind of bug nobody reports.
 */
const cacheKeyFor = (request: ThemeRequest): string => {
  const seed = `${stringValue(request.songTitle, '')}|${stringValue(request.lyricsText, '').slice(0, MAX_LYRICS_LENGTH)}|${Boolean(request.isPureMusic)}`;
  // `node:crypto` is available in the Node runtime this function deploys to.
  return `theme:${createHash('sha256').update(seed).digest('hex').slice(0, 32)}`;
};

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') return methodNotAllowed(response, 'POST');

  const headers = request.headers as Record<string, string | string[] | undefined>;
  if (!isAllowedRequest(headers.origin, { sameOrigin: requestHostname(headers) })) {
    return respond(response, 403, { error: '不允許的來源。' });
  }

  const { allowed, retryAfterSeconds } = limiter.take(clientKey(headers, request.socket?.remoteAddress || 'unknown'));
  if (!allowed) {
    response.setHeader('Retry-After', String(retryAfterSeconds));
    return respond(response, 429, { error: '請求過於頻繁，請稍後再試。' });
  }

  const apiKey = process.env.AGNES_API_KEY;
  if (!apiKey) {
    return respond(response, 503, { error: 'AI 主題服務尚未完成設定，請稍後再試。' });
  }

  let requestBody: ThemeRequest;
  try {
    requestBody = await readJsonBody(request, MAX_BODY_BYTES) as ThemeRequest;
  } catch (error) {
    if (error instanceof BodyError) return respond(response, error.status, { error: error.message });
    throw error;
  }

  const cacheKey = cacheKeyFor(requestBody);
  const cached = themeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return respond(response, 200, cached.value);
  }

  // Only a cache *miss* can spend money, so this is where the ceiling belongs: a repeated song is
  // free and must not be refused for being the 301st request of the day.
  if (!ceiling.take()) {
    console.warn('[Agnes AI] daily generation ceiling reached', { ceiling: DAILY_GENERATION_CEILING });
    return respond(response, 429, { error: 'AI 主題服務今天的額度已用完，請稍後再試。' });
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
        // Both were missing, and both are why a run could come back as prose or as a truncated
        // object - a 400 for the caller when the problem was upstream.
        max_tokens: MAX_OUTPUT_TOKENS,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      console.error('[Agnes AI] upstream request failed', { status: upstream.status });
      return respond(response, 502, { error: `AI 主題服務請求失敗（HTTP ${upstream.status}），請稍後再試。` });
    }

    const content = getContent(payload);
    if (!content) {
      return respond(response, 502, { error: 'AI 主題服務沒有回傳可用的主題內容。' });
    }

    let theme: ThemeResponse;
    try {
      theme = normalizeTheme(parseJsonContent(content));
    } catch (error) {
      // A model that answered with something unparseable is an upstream fault. This used to fall
      // through to the outer catch and become a 400, telling the client to fix its own request.
      console.error('[theme] unusable model response:', String(content).slice(0, 2000));
      return respond(response, 502, { error: error instanceof Error ? error.message : 'AI 主題服務回傳的格式無法解析。' });
    }

    if (themeCache.size >= CACHE_MAX_ENTRIES) {
      const oldest = themeCache.keys().next().value;
      if (oldest) themeCache.delete(oldest);
    }
    themeCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: theme });
    return respond(response, 200, theme);
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    console.error('[Agnes AI] theme proxy error', error instanceof Error ? error.message : error);
    return respond(response, aborted ? 504 : 502, {
      error: aborted ? 'AI 主題服務逾時，請稍後再試。' : 'AI 主題生成失敗，請稍後再試。',
    });
  } finally {
    clearTimeout(timer);
  }
}
