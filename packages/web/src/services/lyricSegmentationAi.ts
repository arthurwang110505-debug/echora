import { buildSegmentationManualPrompt } from '@shared/segmentationPrompt';

// src/services/lyricSegmentationAi.ts
// Client entry to AI word segmentation. Mirrors the split the rest of Echora's AI features use: the
// browser posts to this deployment's own endpoint (`api/ai/segment.ts`) because the credential lives
// server-side, and the prompt a user copies out comes from the same shared module the endpoint uses,
// so "run it for me" and "give me the prompt to paste myself" ask for identical output.
//
// Ported from upstream's `services/lyricSegmentationAi.ts`, including its batching decision:
//
// Batching exists because a whole song originally took a minute; that turned out to be the model's
// thinking tokens, and with those off the picture reverses — each request carries ~1.4s of fixed
// network cost, so splitting a song makes it slower (measured upstream: 43 lines took 6.5s as three
// batches and 3.6s as one). The machinery stays because it costs nothing when unused and still
// covers the case one request cannot: output grows at roughly 18 tokens per line, so a very long
// lyric would otherwise run into the output ceiling and truncate, failing the whole song instead of
// one batch.

/**
 * Lines per request. Sized so essentially every song is one call, while keeping a batch's output
 * (~1800 tokens at 100 lines) well clear of the ceiling.
 */
export const SEGMENTATION_BATCH_SIZE = 100;

/** The full prompt a user copies into a model site, lyrics included. */
export const buildLyricSegmentationPrompt = (lines: string[]): string => buildSegmentationManualPrompt(lines);

export interface SegmentationProgress {
    /** Lines whose batch has come back, successfully or not. */
    done: number;
    total: number;
}

export interface SegmentationRunResult {
    /** Boundaries by index into the input; a null entry keeps that line on the default split. */
    boundaries: (string[] | null)[];
    appliedCount: number;
    /** One message per failed batch. Empty when everything landed. */
    failures: string[];
}

export interface SegmentLyricsOptions {
    signal?: AbortSignal;
    onProgress?: (progress: SegmentationProgress) => void;
}

/**
 * A null row is a line the model got wrong, already rejected server-side; it keeps the default
 * split. Only the row count is structural, since it is what maps rows back onto lyric lines.
 */
const assertBoundaries = (value: unknown, lines: string[]): (string[] | null)[] => {
    if (!Array.isArray(value) || value.length !== lines.length) {
        throw new Error('Segmentation response did not cover every line');
    }
    return value.map(row => (Array.isArray(row) ? row.map(segment => String(segment)) : null));
};

const readError = (payload: unknown, fallback: string): string => {
    if (payload && typeof payload === 'object') {
        const candidate = payload as { error?: unknown; message?: unknown };
        if (typeof candidate.message === 'string' && candidate.message.trim()) return candidate.message;
        if (typeof candidate.error === 'string' && candidate.error.trim()) return candidate.error;
    }
    return fallback;
};

/** One request. */
const segmentBatch = async (lines: string[], signal?: AbortSignal): Promise<(string[] | null)[]> => {
    let response: Response;
    try {
        response = await fetch('/api/ai/segment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lines }),
            signal,
        });
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        throw new Error('無法連線到 AI 詞切分服務，請檢查網路或稍後再試。');
    }

    const payload = await response.json().catch(() => null);
    // A dev server without the serverless functions answers the SPA fallback with HTML and a 200,
    // which would otherwise surface as "the response did not cover every line" — true, and useless
    // for working out why.
    if (payload === null) {
        throw new Error('找不到 AI 詞切分服務（/api/ai/segment）。本機開發需要跑 Vercel 函式，或改用「複製 prompt」。');
    }
    if (!response.ok) {
        throw new Error(readError(payload, `AI 詞切分服務暫時無法使用（HTTP ${response.status}）。`));
    }

    return assertBoundaries((payload as { lines?: unknown }).lines, lines);
};

/**
 * Segments the given lyric lines with the configured model, one batch at a time.
 *
 * A failed batch is reported rather than thrown: its lines simply keep the default split, which is
 * correct output, not corrupt output. On a lyric long enough to need more than one batch, throwing
 * the whole run away because the model fumbled one of them is the worse trade — the user waited for
 * the batches that did come back. A run where nothing landed still throws, since there is nothing
 * to save.
 */
export const segmentLyricsWithAi = async (
    lines: string[],
    { signal, onProgress }: SegmentLyricsOptions = {},
): Promise<SegmentationRunResult> => {
    if (lines.length === 0) throw new Error('沒有可切分的歌詞行。');

    const boundaries: (string[] | null)[] = new Array(lines.length).fill(null);
    const failures: string[] = [];
    let appliedCount = 0;

    for (let start = 0; start < lines.length; start += SEGMENTATION_BATCH_SIZE) {
        if (signal?.aborted) throw new DOMException('Segmentation cancelled', 'AbortError');

        const batch = lines.slice(start, start + SEGMENTATION_BATCH_SIZE);
        try {
            const result = await segmentBatch(batch, signal);
            result.forEach((row, offset) => {
                if (!row) return;
                boundaries[start + offset] = row;
                appliedCount += 1;
            });
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') throw error;
            failures.push(error instanceof Error ? error.message : String(error));
        }

        onProgress?.({ done: Math.min(start + SEGMENTATION_BATCH_SIZE, lines.length), total: lines.length });
    }

    if (appliedCount === 0) throw new Error(failures[0] || 'AI 詞切分沒有回傳可用的結果。');

    return { boundaries, appliedCount, failures };
};
