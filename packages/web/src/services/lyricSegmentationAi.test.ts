import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEGMENTATION_BATCH_SIZE, buildLyricSegmentationPrompt, segmentLyricsWithAi } from './lyricSegmentationAi';

// src/services/lyricSegmentationAi.test.ts
// The client's half of the AI path: one request for a normal song, and what happens when the
// deployment or the model fumbles one. The trade the code makes is deliberate — a batch that fails
// costs its own lines and nothing else — so it is worth pinning down rather than trusting.

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
});

const jsonResponse = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status });

describe('segmentLyricsWithAi', () => {
    it('sends one request for a song-sized list and returns the boundaries', async () => {
        const fetchMock = vi.fn(async () => jsonResponse({ lines: [['把', '回忆', '拼好', '给', '你'], null] }));
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await segmentLyricsWithAi(['把回忆拼好给你', 'unsegmentable']);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(result.boundaries[0]).toEqual(['把', '回忆', '拼好', '给', '你']);
        expect(result.boundaries[1]).toBeNull();
        expect(result.appliedCount).toBe(1);
        expect(result.failures).toEqual([]);
    });

    it('splits a long song into batches and reports progress against the whole run', async () => {
        const total = SEGMENTATION_BATCH_SIZE + 3;
        const lines = Array.from({ length: total }, (_, index) => `line ${index}`);
        const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body));
            return jsonResponse({ lines: body.lines.map((line: string) => [line]) });
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        const progress: { done: number; total: number }[] = [];

        const result = await segmentLyricsWithAi(lines, { onProgress: update => progress.push(update) });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(result.appliedCount).toBe(total);
        expect(progress).toEqual([
            { done: SEGMENTATION_BATCH_SIZE, total },
            { done: total, total },
        ]);
    });

    it('keeps the batches that landed when another fails', async () => {
        const lines = Array.from({ length: SEGMENTATION_BATCH_SIZE + 1 }, (_, index) => `line ${index}`);
        let call = 0;
        globalThis.fetch = (async (_url: string, init?: RequestInit) => {
            call += 1;
            const body = JSON.parse(String(init?.body));
            // The first batch is fumbled at the transport level; the second is fine.
            if (call === 1) return jsonResponse({ error: '上游掛了' }, 502);
            return jsonResponse({ lines: body.lines.map((line: string) => [line]) });
        }) as unknown as typeof fetch;

        const result = await segmentLyricsWithAi(lines);

        expect(result.appliedCount).toBe(1);
        expect(result.failures).toEqual(['上游掛了']);
        expect(result.boundaries[0]).toBeNull();
        expect(result.boundaries[SEGMENTATION_BATCH_SIZE]).toEqual([`line ${SEGMENTATION_BATCH_SIZE}`]);
    });

    it('treats a wrong row count as a failed batch, not as misaligned lyrics', async () => {
        globalThis.fetch = (async () => jsonResponse({ lines: [['only one row']] })) as unknown as typeof fetch;

        await expect(segmentLyricsWithAi(['a', 'b', 'c'])).rejects.toThrow(/did not cover every line/);
    });

    it('explains a missing endpoint rather than reporting a malformed answer', async () => {
        // The dev server has no serverless functions and answers with the SPA fallback.
        globalThis.fetch = (async () => new Response('<!doctype html><html></html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
        })) as unknown as typeof fetch;

        await expect(segmentLyricsWithAi(['a'])).rejects.toThrow(/\/api\/ai\/segment/);
    });

    it('throws when nothing landed, since there is nothing to save', async () => {
        globalThis.fetch = (async () => jsonResponse({ error: '服務未設定' }, 503)) as unknown as typeof fetch;

        await expect(segmentLyricsWithAi(['a'])).rejects.toThrow('服務未設定');
    });

    it('refuses an empty list rather than sending a request for it', async () => {
        const fetchMock = vi.fn();
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        await expect(segmentLyricsWithAi([])).rejects.toThrow();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('propagates an abort instead of recording it as a failed batch', async () => {
        const controller = new AbortController();
        globalThis.fetch = (async () => {
            controller.abort();
            throw new DOMException('aborted', 'AbortError');
        }) as unknown as typeof fetch;

        await expect(segmentLyricsWithAi(['a'], { signal: controller.signal })).rejects.toThrow(/aborted/i);
    });
});

describe('buildLyricSegmentationPrompt', () => {
    it('is the same prompt the endpoint sends, lyrics included', () => {
        const prompt = buildLyricSegmentationPrompt(['第一行']);
        expect(prompt).toContain('You segment song lyrics into words');
        expect(prompt).toContain('1. 第一行');
    });
});
