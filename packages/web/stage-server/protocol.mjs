// packages/web/stage-server/protocol.mjs
//
// The Stage API wire contract, shared by the relay server and its tests.
//
// Plain ESM with no dependencies: the relay has to be runnable straight from a clone
// (`pnpm stage:server`) on any Node the app itself supports, and a streamer should be able to read
// the whole thing before trusting it with their lyrics.
//
// The TypeScript mirror the app uses lives in `src/obs/protocol.ts`; `src/obs/protocol.test.ts`
// imports both and fails if the two sides drift, so the duplication cannot rot silently.

export const STAGE_PROTOCOL_VERSION = 1;
export const STAGE_DEFAULT_PORT = 32107;
export const STAGE_DEFAULT_HOST = '127.0.0.1';
/** Upstream's OBS page polls at this cadence; the overlay extrapolates between messages. */
export const STAGE_CLOCK_INTERVAL_MS = 200;
export const STAGE_SSE_HEARTBEAT_MS = 15000;
/** Reject bodies above this; a lyric sheet is tens of kB, anything past this is a mistake. */
export const STAGE_MAX_BODY_BYTES = 2 * 1024 * 1024;

export const STAGE_ROUTES = {
    health: '/stage/health',
    status: '/stage/status',
    lyrics: '/stage/lyrics',
    session: '/stage/session',
    clock: '/stage/clock',
    publish: '/stage/publish',
    events: '/obs/events',
};

/** The two SSE event names the overlay listens for. */
export const STAGE_EVENT_CONFIG = 'config';
export const STAGE_EVENT_CLOCK = 'clock';

export const STAGE_PUBLISH_KINDS = ['config', 'clock'];

export const generateStageToken = () => {
    // 24 bytes of hex. Long enough that guessing it over loopback is not the weak link.
    const bytes = new Uint8Array(24);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

export const buildStageStatus = state => ({
    protocol: STAGE_PROTOCOL_VERSION,
    hasSession: Boolean(state.config || state.clock),
    hasLyrics: Boolean(state.config && Array.isArray(state.config.lyrics) && state.config.lyrics.length > 0),
    lyricLineCount: state.config && Array.isArray(state.config.lyrics) ? state.config.lyrics.length : 0,
    visualizerMode: state.config ? state.config.visualizerMode : null,
    song: state.config ? state.config.song : null,
    playing: state.clock ? state.clock.playerState === 'playing' : false,
    positionSec: state.clock ? state.clock.currentTime : 0,
    durationSec: state.clock ? state.clock.duration : 0,
    lastPublishAtMs: state.lastPublishAtMs ?? null,
    overlayClients: state.overlayClients ?? 0,
});

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value);

/**
 * Validates one publish message. Returns `{ ok: true, message }` or `{ ok: false, error }` - the
 * relay answers 400 with `error`, which is what an external tool sees while it is being written.
 */
export const validatePublish = payload => {
    if (!isObject(payload)) return { ok: false, error: 'body must be a JSON object' };
    const { kind } = payload;
    if (typeof kind !== 'string' || !STAGE_PUBLISH_KINDS.includes(kind)) {
        return { ok: false, error: `kind must be one of ${STAGE_PUBLISH_KINDS.join(', ')}` };
    }

    if (kind === 'config') {
        const { config } = payload;
        if (!isObject(config)) return { ok: false, error: 'config must be an object' };
        if (config.version !== STAGE_PROTOCOL_VERSION) {
            return { ok: false, error: `config.version must be ${STAGE_PROTOCOL_VERSION}` };
        }
        if (typeof config.visualizerMode !== 'string' || !config.visualizerMode) {
            return { ok: false, error: 'config.visualizerMode is required' };
        }
        if (!Array.isArray(config.lyrics)) return { ok: false, error: 'config.lyrics must be an array' };
        if (!isObject(config.theme)) return { ok: false, error: 'config.theme must be an object' };
        return { ok: true, message: { kind, config } };
    }

    const { clock } = payload;
    if (!isObject(clock)) return { ok: false, error: 'clock must be an object' };
    if (!isFiniteNumber(clock.currentTime)) return { ok: false, error: 'clock.currentTime must be a number' };
    if (!isFiniteNumber(clock.sentAtMs)) return { ok: false, error: 'clock.sentAtMs must be a number' };
    if (typeof clock.playerState !== 'string' || !clock.playerState) {
        return { ok: false, error: 'clock.playerState is required' };
    }
    if (!isFiniteNumber(clock.duration)) return { ok: false, error: 'clock.duration must be a number' };
    return { ok: true, message: { kind, clock } };
};

/** Applies a validated publish to the relay's session state. Returns the state for chaining. */
export const applyPublish = (state, message) => {
    if (message.kind === 'config') {
        state.config = message.config;
    } else {
        state.clock = message.clock;
    }
    state.lastPublishAtMs = Date.now();
    return state;
};

export const createStageState = () => ({
    config: null,
    clock: null,
    lastPublishAtMs: null,
    overlayClients: 0,
});

/* ---------------------------------------------------------------- LRC parsing (POST /stage/lyrics) */

const LRC_LINE = /^\s*\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]\s*(.*)$/;
const LRC_WORD = /<(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)>/g;
const LRC_META = /^\s*\[(ti|ar|al|by|offset):(.*)\]$/i;

const toSeconds = (minutes, seconds) => Number(minutes) * 60 + Number(String(seconds).replace(':', '.'));

const stripWordTags = text => text.replace(LRC_WORD, '').trim();

/**
 * Minimal LRC / enhanced-LRC reader, so an external tool can push a lyric sheet and get a stage
 * without anyone porting Echora's full parser into the relay. Handles the two shapes that matter:
 *
 *   [00:12.34]a plain line
 *   [00:12.34]<00:12.34>word <00:12.90>timings
 *
 * Returns `{ lines, metadata }` using the same shape Echora's own parser produces (millisecond
 * timestamps, one `Word` per lyric line when word timings are present).
 */
export const parseLrc = (text) => {
    const metadata = {};
    const pending = [];
    const lines = String(text ?? '').split(/\r?\n/);

    for (const raw of lines) {
        const meta = raw.match(LRC_META);
        if (meta) {
            metadata[meta[1].toLowerCase()] = meta[2].trim();
            continue;
        }
        const match = raw.match(LRC_LINE);
        if (!match) continue;
        const startTime = toSeconds(match[1], match[2]);
        const body = match[3] ?? '';
        const plain = stripWordTags(body);
        const words = [];
        LRC_WORD.lastIndex = 0;
        let wordMatch;
        const marks = [];
        while ((wordMatch = LRC_WORD.exec(body)) !== null) {
            marks.push({ at: toSeconds(wordMatch[1], wordMatch[2]), index: wordMatch.index, end: LRC_WORD.lastIndex });
        }
        for (let index = 0; index < marks.length; index += 1) {
            const mark = marks[index];
            const next = marks[index + 1];
            const sliceEnd = next ? next.index : body.length;
            const wordText = body.slice(mark.end, sliceEnd).trim();
            if (!wordText) continue;
            const endTime = next ? next.at : Math.min(startTime + 4, mark.at + 1.2);
            words.push({ text: wordText, startTime: mark.at, endTime: Math.max(endTime, mark.at) });
        }
        pending.push({ startTime, plain, words });
    }

    pending.sort((a, b) => a.startTime - b.startTime);

    // A line runs until the next one starts; word timings narrow it when they exist.
    const built = pending.map((entry, index) => {
        const nextStart = index + 1 < pending.length ? pending[index + 1].startTime : entry.startTime + 4;
        const wordEnd = entry.words.length > 0 ? Math.max(...entry.words.map(word => word.endTime)) : 0;
        const endTime = Math.min(nextStart, Math.max(entry.startTime + 0.2, wordEnd || nextStart));
        const words = entry.words.length > 0
            ? entry.words.map(word => ({
                text: word.text,
                startTime: Math.round(word.startTime * 1000),
                endTime: Math.round(Math.min(word.endTime, endTime) * 1000),
            }))
            : [{ text: entry.plain, startTime: Math.round(entry.startTime * 1000), endTime: Math.round(endTime * 1000) }];
        return {
            fullText: entry.plain,
            startTime: Math.round(entry.startTime * 1000),
            endTime: Math.round(endTime * 1000),
            words,
        };
    });

    return { lines: built, metadata };
};

/** Wraps parsed lyrics into a config payload for `POST /stage/lyrics`. */
export const buildLyricsConfig = (previousConfig, lyrics, overrides = {}) => {
    const base = isObject(previousConfig) ? previousConfig : null;
    const first = lyrics.lines.length > 0 ? lyrics.lines[0].startTime : 0;
    const last = lyrics.lines.length > 0 ? lyrics.lines[lyrics.lines.length - 1].endTime : 0;
    return {
        version: STAGE_PROTOCOL_VERSION,
        updatedAt: Date.now(),
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
        song: base ? base.song : null,
        lyrics: lyrics.lines,
        showText: base ? base.showText : true,
        ...overrides,
        // Expose the parsed span so an external tool can size its own clock without guessing.
        lyricsSpanMs: { from: first, to: last },
    };
};
