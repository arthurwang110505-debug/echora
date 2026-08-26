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
const AGNES_MODEL = 'agnes-2.0-flash';
const COLOR_PATTERN = /^#[0-9a-f]{3,8}$/i;
const MAX_LYRICS_LENGTH = 2_000;

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

  let raw = '';
  for await (const chunk of request) raw += String(chunk);
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

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    sendJson(response, 405, { error: '只支援 POST。' });
    return;
  }

  const apiKey = process.env.AGNES_API_KEY;
  if (!apiKey) {
    sendJson(response, 503, { error: 'AI 主題服務尚未完成設定，請稍後再試。' });
    return;
  }

  try {
    const requestBody = await readBody(request);
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

    sendJson(response, 200, normalizeTheme(parseJsonContent(content)));
  } catch (error) {
    console.error('[Agnes AI] theme proxy error', error instanceof Error ? error.message : error);
    sendJson(response, 400, { error: error instanceof Error ? error.message : 'AI 主題生成失敗。' });
  }
}
