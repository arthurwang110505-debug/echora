// packages/web/stage-server/relay.mjs
//
// The Stage API relay: one loopback HTTP server that
//   1. takes the player's config + clock (`POST /stage/publish`),
//   2. fans it out to OBS overlays over SSE (`GET /obs/events`),
//   3. accepts pushes from external tools (`/stage/lyrics`, `/stage/session`, `/stage/clock`),
//   4. answers `/stage/health` and `/stage/status`.
//
// Why a separate process at all: a web page cannot listen on a port, and an OBS browser source runs
// in its own Chromium profile, so it shares neither BroadcastChannel nor storage with the player tab.
// Upstream has the same server inside its Electron main process; Echora has no main process, so it
// ships as this script (`pnpm stage:server`). The deployed PWA talks to it on loopback, which
// browsers treat as a secure context, so an https page may call it.
//
// Security posture: loopback only by default, every route except /stage/health needs the token, and
// the token is generated per run and printed. No filesystem access, no eval, no outbound requests.

import http from 'node:http';
import {
    STAGE_CLOCK_INTERVAL_MS,
    STAGE_EVENT_CLOCK,
    STAGE_EVENT_CONFIG,
    STAGE_MAX_BODY_BYTES,
    STAGE_PROTOCOL_VERSION,
    STAGE_ROUTES,
    STAGE_SSE_HEARTBEAT_MS,
    applyPublish,
    buildLyricsConfig,
    buildStageStatus,
    createStageState,
    generateStageToken,
    parseLrc,
    validatePublish,
} from './protocol.mjs';

const json = (res, status, body) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(payload),
        'cache-control': 'no-store',
    });
    res.end(payload);
};

const readBody = (req, limit) => new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
        size += chunk.length;
        if (size > limit) {
            reject(Object.assign(new Error('body too large'), { statusCode: 413 }));
            req.destroy();
            return;
        }
        chunks.push(chunk);
    });
    req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw.trim()) {
            resolve({});
            return;
        }
        try {
            resolve(JSON.parse(raw));
        } catch {
            reject(Object.assign(new Error('body must be valid JSON'), { statusCode: 400 }));
        }
    });
    req.on('error', reject);
});

const readJsonBody = async (req, limit) => {
    try {
        return await readBody(req, limit);
    } catch (error) {
        if (error && typeof error === 'object' && 'statusCode' in error) throw error;
        throw Object.assign(new Error('could not read body'), { statusCode: 400 });
    }
};

const tokenFromRequest = (req, url) => {
    const header = req.headers.authorization;
    if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
        return header.slice(7).trim();
    }
    // EventSource cannot set headers, so the OBS page passes the token as a query param.
    return url.searchParams.get('token') ?? '';
};

/**
 * Creates the relay. Returns `{ handler, state, token, publish, ... }` so tests can drive it with
 * plain http.createServer(handler) and the CLI can own the listening socket and lifecycle.
 */
export const createStageRelay = ({ token = generateStageToken(), corsOrigin = '*', now = Date.now } = {}) => {
    const state = createStageState();
    const startedAt = now();
    /** SSE subscribers: `{ res }`. */
    const clients = new Set();

    const send = (client, event, data) => {
        client.res.write(`event: ${event}\n`);
        client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const broadcast = (event, data) => {
        for (const client of clients) {
            try {
                send(client, event, data);
            } catch {
                clients.delete(client);
            }
        }
    };

    /** Applies a validated message and fans it out. Also used by the Stage API routes. */
    const publish = message => {
        applyPublish(state, message);
        if (message.kind === 'config') {
            broadcast(STAGE_EVENT_CONFIG, state.config);
            // A new config invalidates the old clock (different song, different timeline).
            if (state.clock) broadcast(STAGE_EVENT_CLOCK, state.clock);
        } else {
            broadcast(STAGE_EVENT_CLOCK, state.clock);
        }
        return state;
    };

    const corsHeaders = req => {
        const origin = req.headers.origin;
        const allowOrigin = corsOrigin === '*' ? (origin || '*') : (origin === corsOrigin ? origin : null);
        if (!allowOrigin) return null;
        return {
            'access-control-allow-origin': allowOrigin,
            'access-control-allow-methods': 'GET, POST, OPTIONS',
            'access-control-allow-headers': 'authorization, content-type',
            'access-control-max-age': '600',
            vary: 'origin',
        };
    };

    const handle = async (req, res, url) => {
        const cors = corsHeaders(req);
        if (req.method === 'OPTIONS') {
            if (!cors) {
                json(res, 403, { error: 'origin not allowed' });
                return;
            }
            res.writeHead(204, cors);
            res.end();
            return;
        }
        if (cors) Object.entries(cors).forEach(([key, value]) => res.setHeader(key, value));

        const route = url.pathname.replace(/\/+$/, '') || '/';

        if (route === STAGE_ROUTES.health) {
            json(res, 200, {
                ok: true,
                name: 'echora-stage-relay',
                protocol: STAGE_PROTOCOL_VERSION,
                uptimeMs: now() - startedAt,
            });
            return;
        }

        if (tokenFromRequest(req, url) !== token) {
            json(res, 401, { error: 'unauthorized: pass Authorization: Bearer <token> or ?token=' });
            return;
        }

        if (route === STAGE_ROUTES.status) {
            json(res, 200, buildStageStatus({ ...state, overlayClients: clients.size }));
            return;
        }

        if (route === STAGE_ROUTES.publish && req.method === 'POST') {
            const body = await readJsonBody(req, STAGE_MAX_BODY_BYTES);
            const result = validatePublish(body);
            if (!result.ok) {
                json(res, 400, { error: result.error });
                return;
            }
            publish(result.message);
            json(res, 200, { ok: true, overlays: clients.size });
            return;
        }

        if (route === STAGE_ROUTES.lyrics && req.method === 'POST') {
            const body = await readJsonBody(req, STAGE_MAX_BODY_BYTES);
            if (typeof body.lyricsText !== 'string' || !body.lyricsText.trim()) {
                json(res, 400, { error: 'lyricsText is required' });
                return;
            }
            const parsed = parseLrc(body.lyricsText);
            if (parsed.lines.length === 0) {
                json(res, 400, { error: 'no timestamped lines found in lyricsText' });
                return;
            }
            const config = buildLyricsConfig(state.config, parsed, body.overrides ?? {});
            publish({ kind: 'config', config });
            json(res, 200, { ok: true, lines: parsed.lines.length, metadata: parsed.metadata });
            return;
        }

        if (route === STAGE_ROUTES.session && req.method === 'POST') {
            const body = await readJsonBody(req, STAGE_MAX_BODY_BYTES);
            const song = {
                title: typeof body.title === 'string' ? body.title : undefined,
                artist: typeof body.artist === 'string' ? body.artist : undefined,
                album: typeof body.album === 'string' ? body.album : undefined,
                coverUrl: typeof body.coverUrl === 'string' ? body.coverUrl : null,
                duration: Number.isFinite(body.duration) ? body.duration : undefined,
            };
            const base = state.config;
            const config = {
                version: STAGE_PROTOCOL_VERSION,
                updatedAt: now(),
                visualizerMode: (base && base.visualizerMode) || 'sonnet',
                backgroundMode: (base && base.backgroundMode) || 'latent',
                visualizerTunings: base ? base.visualizerTunings : {},
                theme: (base && base.theme) || {
                    name: 'Stage',
                    backgroundColor: '#07090e',
                    primaryColor: '#62f5c4',
                    accentColor: '#62f5c4',
                    secondaryColor: '#6366f1',
                    fontStyle: 'sans',
                },
                song,
                lyrics: base && Array.isArray(base.lyrics) ? base.lyrics : [],
                showText: base ? base.showText : true,
            };
            publish({ kind: 'config', config });
            json(res, 200, { ok: true, song });
            return;
        }

        if (route === STAGE_ROUTES.clock && req.method === 'POST') {
            const body = await readJsonBody(req, STAGE_MAX_BODY_BYTES);
            const positionSec = Number.isFinite(body.positionSec)
                ? body.positionSec
                : Number.isFinite(body.currentTime) ? body.currentTime : null;
            if (positionSec === null) {
                json(res, 400, { error: 'positionSec is required' });
                return;
            }
            const clock = {
                currentTime: positionSec,
                sentAtMs: now(),
                playerState: body.playing === false ? 'paused' : 'playing',
                duration: Number.isFinite(body.durationSec) ? body.durationSec : (state.clock ? state.clock.duration : 0),
                playbackRate: Number.isFinite(body.playbackRate) ? body.playbackRate : 1,
                lyricOffsetMs: Number.isFinite(body.lyricOffsetMs) ? body.lyricOffsetMs : 0,
            };
            publish({ kind: 'clock', clock });
            json(res, 200, { ok: true, clock });
            return;
        }

        if (route === STAGE_ROUTES.events && req.method === 'GET') {
            res.writeHead(200, {
                'content-type': 'text/event-stream; charset=utf-8',
                'cache-control': 'no-cache, no-transform',
                connection: 'keep-alive',
                'x-accel-buffering': 'no',
            });
            res.write(`retry: 2000\n\n`);
            const client = { res };
            clients.add(client);
            state.overlayClients = clients.size;
            if (state.config) send(client, STAGE_EVENT_CONFIG, state.config);
            if (state.clock) send(client, STAGE_EVENT_CLOCK, state.clock);

            const heartbeat = setInterval(() => {
                try {
                    res.write(': keep-alive\n\n');
                } catch {
                    clearInterval(heartbeat);
                }
            }, STAGE_SSE_HEARTBEAT_MS);

            const cleanup = () => {
                clearInterval(heartbeat);
                clients.delete(client);
                state.overlayClients = clients.size;
            };
            // Listen on the RESPONSE, not the request: for a GET with no body, `req` emits 'close' as
            // soon as the request is complete - immediately - which used to unsubscribe every overlay
            // one tick after it connected, so the replay arrived and nothing else ever did.
            res.on('close', cleanup);
            res.on('error', cleanup);
            return;
        }

        json(res, 404, { error: `no route ${req.method} ${route}` });
    };

    const handler = (req, res) => {
        let url;
        try {
            url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
        } catch {
            json(res, 400, { error: 'bad request url' });
            return;
        }
        handle(req, res, url).catch(error => {
            const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500;
            if (!res.headersSent) json(res, statusCode, { error: error instanceof Error ? error.message : 'relay error' });
            else res.end();
        });
    };

    return {
        handler,
        state,
        publish,
        get token() {
            return token;
        },
        get overlayClients() {
            return clients.size;
        },
        clockIntervalMs: STAGE_CLOCK_INTERVAL_MS,
        close: () => {
            for (const client of clients) {
                try {
                    client.res.end();
                } catch {
                    // Client already gone.
                }
            }
            clients.clear();
        },
    };
};

/** Convenience for the CLI: binds loopback, returns the server plus its address. */
export const startStageRelay = ({ port = 32107, host = '127.0.0.1', token, corsOrigin } = {}) => {
    const relay = createStageRelay({ token, corsOrigin });
    const server = http.createServer(relay.handler);
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
            server.removeListener('error', reject);
            const address = server.address();
            resolve({ server, relay, port: typeof address === 'object' && address ? address.port : port, host });
        });
    });
};
