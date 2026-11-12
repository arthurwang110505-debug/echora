import type { IncomingMessage } from 'node:http';
import { readJsonBody, BodyError } from '../_lib/body';
import { respond, methodNotAllowed, type ApiResponse } from '../_lib/http';
import { DailyCeiling, RateLimiter, clientKey } from '../_lib/limits';
import { isAllowedRequest, requestHostname } from '../_lib/origin';
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
const limiter = new RateLimiter(RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);

// A segmentation run is a paid generation, and one is issued per lyric batch during an import.
// The ceiling is higher than the theme endpoint's because a single song import legitimately uses
// several, but it still bounds what one instance will ever spend in a day.
const DAILY_GENERATION_CEILING = 500;
const ceiling = new DailyCeiling(DAILY_GENERATION_CEILING);

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
        return respond(response, 503, { error: 'AI 詞切分服務尚未完成設定，請稍後再試。' });
    }

    let lines: string[];
    try {
        lines = readLines(await readJsonBody(request, MAX_BODY_BYTES) as SegmentRequest);
    } catch (error) {
        if (error instanceof BodyError) return respond(response, error.status, { error: error.message });
        // `readLines` throws plain Errors for a missing or oversized line list: those are the
        // caller's to fix, so they stay 400.
        return respond(response, 400, { error: error instanceof Error ? error.message : '請求內容有誤。' });
    }

    // Every accepted batch is a billed model call, so the ceiling gates right before it and only
    // after validation - a malformed request must not spend the day's allowance.
    if (!ceiling.take()) {
        console.warn('[Agnes AI] daily segmentation ceiling reached', { ceiling: DAILY_GENERATION_CEILING });
        return respond(response, 429, { error: 'AI 詞切分服務今天的額度已用完，請稍後再試。' });
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
            return respond(response, 502, { error: `AI 詞切分服務請求失敗（HTTP ${upstream.status}），請稍後再試。` });
        }

        const content = getContent(payload);
        if (!content) {
            return respond(response, 502, { error: 'AI 詞切分服務沒有回傳內容。' });
        }

        try {
            const { boundaries, rejections } = parseSegmentationResponse(content, lines);
            if (rejections.length > 0) {
                console.warn(`[segment] ${rejections.length}/${lines.length} lines rejected; first: ${rejections[0]}`);
            }
            return respond(response, 200, { lines: boundaries });
        } catch (error) {
            // The response is the only evidence of why a run was rejected, and it is gone once
            // this throws. Server logs are the one place a deployment can see it.
            console.error('[segment] rejected model response:', String(content).slice(0, 4000));
            return respond(response, 502, { error: error instanceof Error ? error.message : '詞切分結果無法解析。' });
        }
    } catch (error) {
        const aborted = error instanceof Error && error.name === 'AbortError';
        console.error('[Agnes AI] segmentation proxy error', error instanceof Error ? error.message : error);
        // Anything reaching here is the upstream's fault: the request was already validated, so
        // there is nothing the caller could change. 502/504, never 400.
        return respond(response, aborted ? 504 : 502, {
            error: aborted ? 'AI 詞切分服務逾時，請稍後再試。' : 'AI 詞切分服務暫時無法使用。',
        });
    } finally {
        clearTimeout(timer);
    }
}
