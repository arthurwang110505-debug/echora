import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../../../api/ai/segment';

// src/lyrics/segmentEndpoint.test.ts
//
// Drives the real serverless handler (`api/ai/segment.ts`) with a stubbed upstream, because the AI
// path is the one part of this feature that cannot be checked by reading it: the prompt, the request
// shape, the parse and the status codes all only exist at runtime. A live key is not available in
// CI, so the upstream call is faked — everything below the fetch is the shipping code.

interface FakeResponse {
    statusCode?: number;
    headers: Record<string, string>;
    body: unknown;
    ended: boolean;
}

const makeResponse = (): FakeResponse & { setHeader: (k: string, v: string) => void; end: (b: string) => void } => {
    const response = {
        statusCode: 200,
        headers: {} as Record<string, string>,
        body: undefined as unknown,
        ended: false,
        setHeader(key: string, value: string) { this.headers[key] = value; },
        end(payload: string) { this.body = JSON.parse(payload); this.ended = true; },
    };
    return response;
};

const makeRequest = (lines: string[], headers: Record<string, string> = {}) => ({
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: { lines },
    socket: { remoteAddress: '203.0.113.7' },
});

const openAiAnswer = (lines: string[][]) => ({
    choices: [{ message: { content: JSON.stringify({ lines }) } }],
});

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

beforeEach(() => {
    process.env.AGNES_API_KEY = 'test-key';
    delete process.env.ECHORA_ALLOWED_ORIGINS;
});

afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
});

describe('POST /api/ai/segment', () => {
    it('segments lyrics and returns the validated boundaries', async () => {
        const upstream = vi.fn(async () => new Response(JSON.stringify(openAiAnswer([
            ['把', '回忆', '拼好', '给', '你'],
        ])), { status: 200 }));
        globalThis.fetch = upstream as unknown as typeof fetch;
        const response = makeResponse();

        await handler(makeRequest(['把回忆拼好给你']) as never, response as never);

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({ lines: [['把', '回忆', '拼好', '给', '你']] });
    });

    it('asks the upstream for a strict, lossless answer', async () => {
        const upstream = vi.fn(async () => new Response(JSON.stringify(openAiAnswer([['把回忆拼好给你']])), { status: 200 }));
        globalThis.fetch = upstream as unknown as typeof fetch;

        await handler(makeRequest(['把回忆拼好给你']) as never, makeResponse() as never);

        const body = JSON.parse(String((upstream.mock.calls[0] as unknown[])[1] && ((upstream.mock.calls[0] as unknown[])[1] as RequestInit).body));
        expect(body.temperature).toBe(0);
        expect(body.response_format).toEqual({ type: 'json_object' });
        expect(body.messages[0].content).toContain('Lossless');
        // The lines are numbered, and the prompt warns that the numbering is not part of the lyric.
        expect(body.messages[1].content).toContain('1. 把回忆拼好给你');
        expect(body.messages[0].content).toContain('NOT part of the');
    });

    it('nulls a row the model rewrote, and still succeeds', async () => {
        globalThis.fetch = (async () => new Response(JSON.stringify(openAiAnswer([
            ['把', '回忆', '拼好', '给', '你'],
            ['完', '全', '不', '同'],
        ])), { status: 200 })) as unknown as typeof fetch;
        const response = makeResponse();

        await handler(makeRequest(['把回忆拼好给你', 'It’s unbelievable']) as never, response as never);

        expect(response.statusCode).toBe(200);
        expect((response.body as { lines: unknown[] }).lines[1]).toBeNull();
    });

    it('fails with 502 when the model reproduced nothing, and logs what it said', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        globalThis.fetch = (async () => new Response(JSON.stringify(openAiAnswer([['x']])), { status: 200 })) as unknown as typeof fetch;
        const response = makeResponse();

        await handler(makeRequest(['把回忆拼好给你']) as never, response as never);

        expect(response.statusCode).toBe(502);
        expect(String((response.body as { error: string }).error)).toMatch(/reproduced none/);
        expect(log).toHaveBeenCalled();
    });

    it('rejects a bad request before spending the key', async () => {
        const upstream = vi.fn();
        globalThis.fetch = upstream as unknown as typeof fetch;

        const empty = makeResponse();
        await handler(makeRequest([]) as never, empty as never);
        expect(empty.statusCode).toBe(400);

        const tooMany = makeResponse();
        await handler(makeRequest(new Array(401).fill('a')) as never, tooMany as never);
        expect(tooMany.statusCode).toBe(400);

        expect(upstream).not.toHaveBeenCalled();
    });

    it('refuses a method and an unconfigured deployment', async () => {
        const wrongMethod = makeResponse();
        await handler({ ...makeRequest(['a']), method: 'GET' } as never, wrongMethod as never);
        expect(wrongMethod.statusCode).toBe(405);

        const badOrigin = makeResponse();
        await handler(makeRequest(['a'], { origin: 'https://evil.example' }) as never, badOrigin as never);
        expect(badOrigin.statusCode).toBe(403);

        delete process.env.AGNES_API_KEY;
        const unconfigured = makeResponse();
        await handler(makeRequest(['a']) as never, unconfigured as never);
        expect(unconfigured.statusCode).toBe(503);
    });

    it('honours ECHORA_ALLOWED_ORIGINS, which the module reads once at load', async () => {
        // The allowlist is a module constant, like the theme endpoint's: a deployment sets it and it
        // does not change per request. So this needs a fresh module, not just a fresh env var.
        process.env.ECHORA_ALLOWED_ORIGINS = 'https://echora.example';
        vi.resetModules();
        const { default: configured } = await import('../../../../api/ai/segment');
        const upstream = vi.fn(async () => new Response(JSON.stringify(openAiAnswer([['把回忆拼好给你']])), { status: 200 }));
        globalThis.fetch = upstream as unknown as typeof fetch;

        const refused = makeResponse();
        await configured(makeRequest(['把回忆拼好给你'], { origin: 'https://elsewhere.example' }) as never, refused as never);
        expect(refused.statusCode).toBe(403);

        const allowed = makeResponse();
        await configured(makeRequest(['把回忆拼好给你'], { origin: 'https://echora.example' }) as never, allowed as never);
        expect(allowed.statusCode).toBe(200);
    });

    it('surfaces an upstream failure as 502 with the status in the message', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        globalThis.fetch = (async () => new Response('nope', { status: 429 })) as unknown as typeof fetch;
        const response = makeResponse();

        await handler(makeRequest(['a']) as never, response as never);

        expect(response.statusCode).toBe(502);
        expect(String((response.body as { error: string }).error)).toContain('429');
    });
});
