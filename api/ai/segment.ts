import type { IncomingMessage, ServerResponse } from 'node:http';
// The prompt and its parser live at the repo root because the browser also imports them: the prompt
// a user copies out has to be the one this endpoint sends. Same layout as upstream's shared/.
import {
    SEGMENTATION_MAX_OUTPUT_TOKENS,
    buildSegmentationSourcePrompt,
    buildSegmentationSystemPrompt,
    parseSegmentationResponse,
} from '../../shared/segmentationPrompt';

// api/ai/segment.ts
// Word-segmentation proxy for the AGNES endpoint, following api/ai/theme.ts exactly (same env, same
// origin policy, same rate limit and body cap) because it is the same deployment secret and the same
// abuse surface.
//
// It answers one question — "split these lyric lines into words" — and returns the boundaries, not
// the raw model text. Validation happens here rather than in the browser so a malformed answer is
// logged where a deployment can see it, and so the client cannot be blamed for a model that
// rewrote the lyrics: `parseSegmentationResponse` re-aligns each row onto the line it came from and
// returns null for any row that does not reproduce it.
//
// A null row is a *rejected* line, not a failure: it keeps the default Intl.Segmenter split, which is
// correct output. A run where every row was rejected is a 502.

type ApiResponse = ServerResponse & {
    status?: (code: number) => ApiResponse;
    json?: (payload: unknown) => void;
};

type ApiRequest = IncomingMessage & {
    method?: string;
    body?: unknown;
};

type SegmentRequest = { lines?: unknown };

// Overridable so `pnpm dev` + a local stub can exercise the whole path (client, proxy, prompt,
// parser) without a real key. Unset in production, where the default applies.
const AGNES_BASE_URL = process.env.AGNES_BASE_URL || 'https://apihub.agnes-ai.com/v1';
const AGNES_MODEL = process.env.AGNES_MODEL || 'agnes-2.0-flash';

const MAX_LINES = 400;
const MAX_LINE_LENGTH = 2_000;
const MAX_BODY_BYTES = 128_000;

// Segmentation is mechanical, so this only has to cover model + network time. Generous next to the
// theme endpoint's 12s: a 100-line batch is a much larger response.
const UPSTREAM_TIMEOUT_MS = 25_000;

// In-memory per-client rate limit; same accepted limitation as the theme endpoint (serverless
// instances do not share state, so this blunts bursts rather than enforcing a quota).
const RATE_LIMIT_MAX = 8;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateBuckets = new Map<string, number[]>();

const ALLOWED_ORIGINS = (process.env.ECHORA_ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

const sendJson = (response: ApiResponse, status: number, payload: unknown) => {
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify(payload));
};

const readBody = async (request: ApiRequest): Promise<SegmentRequest> => {
    if (request.body && typeof request.body === 'object') return request.body as SegmentRequest;

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
        return parsed && typeof parsed === 'object' ? parsed as SegmentRequest : {};
    } catch {
        throw new Error('請求內容不是有效的 JSON。');
    }
};

/** Guards the request before any credential or network work happens. */
const readLines = (body: SegmentRequest): string[] => {
    const lines = body.lines;
    if (!Array.isArray(lines) || lines.length === 0) throw new Error('缺少歌詞行。');
    if (lines.length > MAX_LINES) throw new Error(`歌詞行數過多（上限 ${MAX_LINES} 行）。`);
    return lines.map(line => String(line ?? '').slice(0, MAX_LINE_LENGTH));
};

const getContent = (payload: unknown): string => {
    if (!payload || typeof payload !== 'object') return '';
    const message = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) {
        return message
            .filter((part): part is { text?: unknown } => Boolean(part) && typeof part === 'object')
            .map(part => (typeof part.text === 'string' ? part.text : ''))
            .join('');
    }
    return '';
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
        sendJson(response, 503, { error: 'AI 詞切分服務尚未完成設定，請稍後再試。' });
        return;
    }

    try {
        const lines = readLines(await readBody(request));
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
                    messages: [
                        { role: 'system', content: buildSegmentationSystemPrompt() },
                        { role: 'user', content: buildSegmentationSourcePrompt(lines) },
                    ],
                    // Splitting text at word boundaries is mechanical; there is nothing to sample
                    // for, and temperature is the one knob that can make a line come back rewritten.
                    temperature: 0,
                    max_tokens: SEGMENTATION_MAX_OUTPUT_TOKENS,
                    response_format: { type: 'json_object' },
                }),
                signal: controller.signal,
            });

            const payload = await upstream.json().catch(() => null);
            if (!upstream.ok) {
                console.error('[Agnes AI] segmentation upstream failed', { status: upstream.status });
                sendJson(response, 502, { error: `AI 詞切分服務請求失敗（HTTP ${upstream.status}），請稍後再試。` });
                return;
            }

            const content = getContent(payload);
            if (!content) {
                sendJson(response, 502, { error: 'AI 詞切分服務沒有回傳內容。' });
                return;
            }

            try {
                const { boundaries, rejections } = parseSegmentationResponse(content, lines);
                if (rejections.length > 0) {
                    console.warn(`[segment] ${rejections.length}/${lines.length} lines rejected; first: ${rejections[0]}`);
                }
                sendJson(response, 200, { lines: boundaries });
            } catch (error) {
                // The response is the only evidence of why a run was rejected, and it is gone once
                // this throws. Server logs are the one place a deployment can see it.
                console.error('[segment] rejected model response:', String(content).slice(0, 4000));
                sendJson(response, 502, { error: error instanceof Error ? error.message : '詞切分結果無法解析。' });
            }
        } finally {
            clearTimeout(timer);
        }
    } catch (error) {
        const aborted = error instanceof Error && error.name === 'AbortError';
        console.error('[Agnes AI] segmentation proxy error', error instanceof Error ? error.message : error);
        sendJson(response, aborted ? 504 : 400, { error: aborted ? 'AI 詞切分服務逾時，請稍後再試。' : error instanceof Error ? error.message : '詞切分失敗。' });
    }
}
