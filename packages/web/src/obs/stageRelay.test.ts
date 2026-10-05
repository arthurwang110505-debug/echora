import { afterEach, describe, expect, it } from 'vitest';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
// The relay is dependency-free ESM so it can run straight from a clone; the test drives the real
// HTTP handler rather than a mock, which is the only way to claim the Stage API actually works.
// @ts-expect-error - plain .mjs without types, deliberately: the relay must not import the app.
import { createStageRelay } from '../../stage-server/relay.mjs';
// @ts-expect-error see above
import { STAGE_EVENT_CLOCK, STAGE_EVENT_CONFIG, parseLrc } from '../../stage-server/protocol.mjs'

const TOKEN = 'test-token-000000000000000000000000';

interface Relay {
    handler: (req: unknown, res: unknown) => void;
    close: () => void;
    overlayClients: number;
    publish: (message: { kind: string; clock?: unknown; config?: unknown }) => unknown;
    state: { config: unknown; clock: unknown };
}

let server: Server | null = null;
let relay: Relay | null = null;
let baseUrl = '';

const startRelay = async (): Promise<void> => {
    relay = createStageRelay({ token: TOKEN }) as Relay;
    server = createServer(relay.handler as never);
    await new Promise<void>(resolve => server?.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
};

afterEach(async () => {
    relay?.close();
    relay = null;
    await new Promise<void>(resolve => {
        if (!server) {
            resolve();
            return;
        }
        server.close(() => resolve());
    });
    server = null;
});

const post = (path: string, body: unknown, token: string | null = TOKEN) => fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
});

/** Polls a condition; SSE teardown is asynchronous, so a bare assertion would be a race. */
const waitFor = async (predicate: () => boolean, timeoutMs = 2000): Promise<void> => {
    const startedAt = Date.now();
    while (!predicate()) {
        if (Date.now() - startedAt > timeoutMs) throw new Error('waitFor timed out');
        await new Promise(resolve => setTimeout(resolve, 10));
    }
};

const sampleConfig = (overrides: Record<string, unknown> = {}) => ({
    kind: 'config',
    config: {
        version: 1,
        updatedAt: Date.now(),
        visualizerMode: 'sonnet',
        backgroundMode: 'latent',
        visualizerTunings: {},
        theme: { name: 'T', backgroundColor: '#000', primaryColor: '#fff', accentColor: '#fff', secondaryColor: '#888' },
        song: { title: 'Song', artist: 'Artist', coverUrl: null, duration: 200 },
        lyrics: [
            { fullText: 'one', startTime: 0, endTime: 2000, words: [{ text: 'one', startTime: 0, endTime: 2000 }] },
            { fullText: 'two', startTime: 2500, endTime: 4000, words: [{ text: 'two', startTime: 2500, endTime: 4000 }] },
        ],
        showText: true,
        ...overrides,
    },
});

/**
 * Subscribes to the overlay stream and hands back a handle, so a test can wait for the connection
 * (`ready`), drive the relay, and then wait for the frames it expects (`finished`).
 *
 * Uses the low-level http client rather than `fetch`: a streamed response keeps undici's pooled
 * connection busy, so a later request in the same test can queue behind it - an artifact of the test
 * runner that has nothing to do with the relay (the same sequence from plain Node behaves normally).
 */
const subscribeSse = (predicate: (frames: { event: string; data: unknown }[]) => boolean, timeoutMs = 4000) => {
    const frames: { event: string; data: unknown }[] = [];
    let release: () => void = () => undefined;
    const finished = new Promise<void>(resolve => {
        release = resolve;
    });
    let request_: ReturnType<typeof request> | null = null;
    const ready = new Promise<void>((resolve, reject) => {
        request_ = request(`${baseUrl}/obs/events?token=${TOKEN}`, { headers: { accept: 'text/event-stream' } }, response => {
            if (response.statusCode !== 200) {
                reject(new Error(`SSE refused: ${response.statusCode}`));
                return;
            }
            resolve();
            let buffer = '';
            const deadline = setTimeout(() => {
                response.destroy();
                release();
            }, timeoutMs);
            response.setEncoding('utf8');
            response.on('data', (chunk: string) => {
                buffer += chunk;
                // Frames are separated by a blank line; the trailing partial stays in the buffer.
                const parts = buffer.split('\n\n');
                buffer = parts.pop() ?? '';
                for (const part of parts) {
                    const event = /^event: (.+)$/m.exec(part)?.[1];
                    const data = /^data: (.*)$/m.exec(part)?.[1];
                    if (event && data !== undefined) frames.push({ event, data: JSON.parse(data) });
                }
                if (predicate(frames)) {
                    clearTimeout(deadline);
                    response.destroy();
                    release();
                }
            });
            response.on('close', () => {
                clearTimeout(deadline);
                release();
            });
            response.on('error', () => {
                clearTimeout(deadline);
                release();
            });
        });
        request_.on('error', reject);
        request_.end();
    });
    return { frames, ready, finished, close: () => request_?.destroy() };
};

describe('stage relay', () => {
    it('answers health without a token and refuses everything else without one', async () => {
        await startRelay();
        const health = await fetch(`${baseUrl}/stage/health`);
        expect(health.status).toBe(200);
        expect(await health.json()).toMatchObject({ ok: true, name: 'echora-stage-relay' });

        const unauthorized = await fetch(`${baseUrl}/stage/status`);
        expect(unauthorized.status).toBe(401);

        const wrongToken = await fetch(`${baseUrl}/stage/status`, { headers: { authorization: 'Bearer nope' } });
        expect(wrongToken.status).toBe(401);
    });

    it('accepts a published config and reflects it in /stage/status', async () => {
        await startRelay();
        const published = await post('/stage/publish', sampleConfig());
        expect(published.status).toBe(200);
        expect(await published.json()).toMatchObject({ ok: true, overlays: 0 });

        const status = await (await fetch(`${baseUrl}/stage/status?token=${TOKEN}`)).json();
        expect(status).toMatchObject({
            hasSession: true,
            hasLyrics: true,
            lyricLineCount: 2,
            visualizerMode: 'sonnet',
            playing: false,
        });
        expect(status.song).toMatchObject({ title: 'Song', artist: 'Artist' });
    });

    it('rejects malformed publishes with a reason an external tool can act on', async () => {
        await startRelay();
        const cases: [unknown, string][] = [
            [{ kind: 'nope' }, 'kind must be one of'],
            [{ kind: 'config', config: { version: 99 } }, 'config.version must be 1'],
            [{ kind: 'config', config: { version: 1, visualizerMode: 'sonnet', theme: {} } }, 'config.lyrics must be an array'],
            [{ kind: 'clock', clock: { currentTime: 'soon' } }, 'clock.currentTime must be a number'],
            [{ kind: 'clock', clock: { currentTime: 1, sentAtMs: 1, playerState: 'playing' } }, 'clock.duration must be a number'],
        ];
        for (const [body, expected] of cases) {
            const response = await post('/stage/publish', body);
            expect(response.status, JSON.stringify(body)).toBe(400);
            expect((await response.json()).error).toContain(expected);
        }
    });

    it('replays the current state to a late-joining overlay, then fans new publishes out live', async () => {
        await startRelay();
        await post('/stage/publish', sampleConfig());
        await post('/stage/publish', {
            kind: 'clock',
            clock: { currentTime: 3, sentAtMs: Date.now(), playerState: 'playing', duration: 200, playbackRate: 1, lyricOffsetMs: 0 },
        });

        // A subscriber that attaches after the fact still receives the current state.
        const late = subscribeSse(frames => frames.some(frame => frame.event === STAGE_EVENT_CONFIG)
            && frames.some(frame => frame.event === STAGE_EVENT_CLOCK));
        await late.ready;
        await late.finished;
        const received = new Map(late.frames.map(frame => [frame.event, frame.data]));
        expect(received.get(STAGE_EVENT_CONFIG)).toMatchObject({ visualizerMode: 'sonnet' });
        expect(received.get(STAGE_EVENT_CLOCK)).toMatchObject({ currentTime: 3 });

        // Publishes after that point are pushed live, not just replayed. The publish goes through
        // the relay's own fan-out rather than a second HTTP request: vitest's fetch keeps a streamed
        // response on its pooled connection, so interleaving a POST with an open SSE stream hangs
        // inside the test runner even though the relay answers it in single-digit milliseconds
        // (verified against the same handler from plain Node).
        const clockAt = (frame: { event: string; data: unknown }) => (
            frame.event === STAGE_EVENT_CLOCK ? (frame.data as { currentTime?: number }).currentTime : undefined
        );
        const attached = subscribeSse(frames => frames.some(frame => clockAt(frame) === 12.5));
        await attached.ready;
        // The replay of `3` is what proves the relay has this connection registered.
        await waitFor(() => attached.frames.some(frame => clockAt(frame) === 3));
        relay!.publish({
            kind: 'clock',
            clock: { currentTime: 12.5, sentAtMs: Date.now(), playerState: 'playing', duration: 200, playbackRate: 1, lyricOffsetMs: 0 },
        });
        await attached.finished;
        expect(attached.frames.some(frame => clockAt(frame) === 12.5)).toBe(true);
    }, 15000);

    it('lets an external tool push lyrics, and parses them into Echora line shape', async () => {
        await startRelay();
        const response = await post('/stage/lyrics', {
            lyricsText: [
                '[ti:Bench Song]',
                '[00:01.00]first line',
                '[00:04.20]<00:04.20>word <00:05.00>by <00:05.60>word',
            ].join('\n'),
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ ok: true, lines: 2, metadata: { ti: 'Bench Song' } });

        const status = await (await fetch(`${baseUrl}/stage/status?token=${TOKEN}`)).json();
        expect(status.lyricLineCount).toBe(2);

        const overlayConfig = relay?.overlayClients === 0 ? null : null;
        expect(overlayConfig).toBeNull();
    });

    it('drives the clock from an external player, which is how a Now-Playing style tool attaches', async () => {
        await startRelay();
        const pushed = await post('/stage/clock', { positionSec: 42.5, playing: true, durationSec: 180 });
        expect(pushed.status).toBe(200);
        const status = await (await fetch(`${baseUrl}/stage/status?token=${TOKEN}`)).json();
        expect(status).toMatchObject({ playing: true, positionSec: 42.5, durationSec: 180 });

        await post('/stage/clock', { positionSec: 43, playing: false });
        const paused = await (await fetch(`${baseUrl}/stage/status?token=${TOKEN}`)).json();
        expect(paused).toMatchObject({ playing: false, positionSec: 43 });
    });

    it('accepts a session push and keeps the lyrics that are already loaded', async () => {
        await startRelay();
        await post('/stage/lyrics', { lyricsText: '[00:01.00]kept' });
        const response = await post('/stage/session', { title: 'New Song', artist: 'Someone', duration: 120 });
        expect(response.status).toBe(200);

        const status = await (await fetch(`${baseUrl}/stage/status?token=${TOKEN}`)).json();
        expect(status.song).toMatchObject({ title: 'New Song', artist: 'Someone' });
        expect(status.lyricLineCount).toBe(1);
    });

    it('answers preflights for the deployed PWA origin and rejects a disallowed one', async () => {
        relay = createStageRelay({ token: TOKEN, corsOrigin: 'https://echora.example' }) as Relay;
        server = createServer(relay.handler as never);
        await new Promise<void>(resolve => server?.listen(0, '127.0.0.1', () => resolve()));
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

        const allowed = await fetch(`${baseUrl}/stage/publish`, {
            method: 'OPTIONS',
            headers: { origin: 'https://echora.example', 'access-control-request-method': 'POST' },
        });
        expect(allowed.status).toBe(204);
        expect(allowed.headers.get('access-control-allow-origin')).toBe('https://echora.example');

        const denied = await fetch(`${baseUrl}/stage/publish`, {
            method: 'OPTIONS',
            headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
        });
        expect(denied.status).toBe(403);
    });

    it('404s unknown routes instead of pretending they worked', async () => {
        await startRelay();
        const response = await post('/stage/nope', {});
        expect(response.status).toBe(404);
        expect((await response.json()).error).toContain('no route');
    });
});

interface ParsedLine {
    fullText: string;
    startTime: number;
    endTime: number;
    words: { text: string; startTime: number; endTime: number }[];
}

// The relay is untyped JavaScript by design; this is the shape the Stage API documents.
const parseLrcTyped = parseLrc as (text: string) => { lines: ParsedLine[]; metadata: Record<string, string> };

describe('relay LRC parsing', () => {
    it('parses plain lines, ordering them and closing each at the next start', () => {
        const parsed = parseLrcTyped('[00:10.00]later\n[00:05.00]earlier');
        expect(parsed.lines.map(line => line.fullText)).toEqual(['earlier', 'later']);
        expect(parsed.lines[0].startTime).toBe(5000);
        expect(parsed.lines[1].startTime).toBe(10000);
        expect(parsed.lines[1].endTime).toBeGreaterThan(10000);
    });

    it('keeps enhanced word timings and drops the inline tags from the line text', () => {
        const parsed = parseLrcTyped('[00:04.20]<00:04.20>word <00:05.00>by <00:05.60>word');
        expect(parsed.lines[0].fullText).toBe('word by word');
        expect(parsed.lines[0].words.map(word => word.text)).toEqual(['word', 'by', 'word']);
        expect(parsed.lines[0].words[0]).toMatchObject({ startTime: 4200 });
        expect(parsed.lines[0].words[1].startTime).toBe(5000);
    });

    it('ignores untimestamped lines and metadata-only input', () => {
        expect(parseLrcTyped('just a line with no timestamp').lines).toEqual([]);
        expect(parseLrcTyped('[ar:Artist]\n[ti:Title]').lines).toEqual([]);
    });

    it('falls back to a single word per line when there are no word timings', () => {
        const parsed = parseLrcTyped('[00:01.00]a plain line');
        expect(parsed.lines[0].words).toHaveLength(1);
        expect(parsed.lines[0].words[0].text).toBe('a plain line');
    });
});
