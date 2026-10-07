import type { Line, ThemeConfig } from '@echora/core';

// src/obs/protocol.ts
//
// The overlay side of the Stage API: the same wire contract the relay speaks
// (`packages/web/stage-server/protocol.mjs`), the URL shape of an overlay, and the pure helpers the
// overlay and the publisher both need.
//
// Kept self-contained on purpose. Echora's tree also contains a vendored OBS helper
// (`utils/obsBrowserSource.ts`) written against modules that were never ported; importing it would
// put a file with unresolvable imports into the type-checked program. The two ideas worth keeping
// from it - a clock anchor the overlay extrapolates, and a signature that suppresses republishing an
// unchanged config - are reimplemented here, small enough to test directly.

/** Must equal `STAGE_PROTOCOL_VERSION` in stage-server/protocol.mjs; a test enforces it. */
export const OBS_STAGE_PROTOCOL_VERSION = 1;
export const OBS_STAGE_DEFAULT_RELAY = '127.0.0.1:32107';
export const OBS_STAGE_DEFAULT_PORT = 32107;
/** SSE event names, matching the relay. */
export const OBS_STAGE_EVENT_CONFIG = 'config';
export const OBS_STAGE_EVENT_CLOCK = 'clock';
/** How often the player republishes its clock. The overlay extrapolates between messages. */
export const OBS_STAGE_CLOCK_INTERVAL_MS = 200;
/** An overlay with no clock message for this long reports a stale source instead of pretending. */
export const OBS_STAGE_STALE_AFTER_MS = 4000;

export type ObsStagePlaybackState = 'playing' | 'paused' | 'buffering' | 'idle';

export interface ObsStageSong {
    title?: string;
    artist?: string;
    album?: string;
    coverUrl?: string | null;
    /** Seconds. */
    duration?: number;
}

/** Everything the overlay needs in order to render the stage. */
export interface ObsStageConfig {
    version: number;
    /** Wall clock (ms) this config was built. Transport metadata; ignored by the change signature. */
    updatedAt: number;
    visualizerMode: string;
    backgroundMode: string;
    visualizerTunings?: Record<string, unknown>;
    theme: ThemeConfig;
    song: ObsStageSong | null;
    /** Echora's lyric lines, with the millisecond timestamps the stage converts itself. */
    lyrics: Line[];
    showText?: boolean;
}

/** A clock anchor, not a stream of positions: see `resolveObsStageTime`. */
export interface ObsStageClock {
    currentTime: number;
    sentAtMs: number;
    playerState: ObsStagePlaybackState;
    duration: number;
    playbackRate?: number;
    /** Lyrics offset (ms) the overlay still has to subtract; 0 when the publisher applied it. */
    lyricOffsetMs?: number;
}

export type ObsStagePublishMessage =
    | { kind: 'config'; config: ObsStageConfig }
    | { kind: 'clock'; clock: ObsStageClock };

export type ObsStageTransport = 'relay' | 'broadcast';

export type ObsStageConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface ObsStageOverlayParams {
    transport: ObsStageTransport;
    /** `host:port` of the relay, without a scheme. */
    relay: string;
    token: string;
    /** Hides the "waiting for the player" card, for streamers who would rather show a black frame. */
    quiet: boolean;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Reads the overlay's own URL. Everything has a default, so a bare `/obs` still works. */
export const parseObsStageOverlayParams = (search: string): ObsStageOverlayParams => {
    const params = new URLSearchParams(search);
    const transport = params.get('transport') === 'broadcast' ? 'broadcast' : 'relay';
    const relay = (params.get('relay') || '').trim() || OBS_STAGE_DEFAULT_RELAY;
    return {
        transport,
        relay,
        token: params.get('token') ?? '',
        quiet: params.get('quiet') === '1',
    };
};

const normalizeRelayHost = (relay: string): string => {
    const trimmed = relay.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return trimmed || OBS_STAGE_DEFAULT_RELAY;
};

/** `ws`/`http` are irrelevant to EventSource, but a pasted `http://host:port/` is common. */
export const buildObsStageEventsUrl = (relay: string, token: string): string => {
    const host = normalizeRelayHost(relay);
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    return `http://${host}/obs/events${query}`;
};

/**
 * The URL to paste into an OBS browser source. Built from the *overlay's* point of view: the relay
 * address is where the overlay should connect, not where this page is served from.
 */
export const buildObsStageOverlayUrl = (
    origin: string,
    { relay, token, transport = 'relay', quiet = false }: {
        relay: string;
        token: string;
        transport?: ObsStageTransport;
        quiet?: boolean;
    },
): string => {
    const params = new URLSearchParams();
    if (transport !== 'relay') params.set('transport', transport);
    if (transport === 'relay') params.set('relay', normalizeRelayHost(relay));
    if (token) params.set('token', token);
    if (quiet) params.set('quiet', '1');
    const query = params.toString();
    return `${origin.replace(/\/+$/, '')}/obs${query ? `?${query}` : ''}`;
};

/**
 * Extrapolates the current playback position from a clock anchor: advance with wall-clock time while
 * playing, hold while paused, clamp to `[0, duration]` when the duration is known, and subtract the
 * lyric offset. This is what makes a 5 Hz feed drive a 60 fps stage.
 */
export const resolveObsStageTime = (clock: ObsStageClock | null, nowMs: number = Date.now()): number => {
    if (!clock) return 0;
    const offset = (clock.lyricOffsetMs ?? 0) / 1000;
    if (clock.playerState !== 'playing') return clock.currentTime - offset;
    const elapsed = Math.max(0, (nowMs - clock.sentAtMs) / 1000) * (clock.playbackRate ?? 1);
    const position = clock.currentTime + elapsed;
    const clamped = clock.duration > 0 ? Math.min(clock.duration, position) : position;
    return clamped - offset;
};

/** True once the source has gone quiet: the overlay shows its status card rather than a frozen frame. */
export const isObsStageClockStale = (
    clock: ObsStageClock | null,
    nowMs: number = Date.now(),
    staleAfterMs: number = OBS_STAGE_STALE_AFTER_MS,
): boolean => {
    if (!clock) return true;
    if (isFiniteNumber(clock.sentAtMs) && nowMs - clock.sentAtMs > staleAfterMs) return true;
    return false;
};

/**
 * A stable identity for a config, ignoring `updatedAt`. The publisher republishes only when this
 * changes, so unrelated React renders (a slider that did not move, a re-created line array with the
 * same content) do not push a fresh payload to every overlay.
 */
export const buildObsStageConfigSignature = (config: ObsStageConfig): string => JSON.stringify([
    config.visualizerMode,
    config.backgroundMode,
    config.visualizerTunings ?? {},
    config.theme,
    config.song ?? null,
    config.showText ?? true,
    config.lyrics.map(line => [
        line.fullText,
        line.startTime,
        line.endTime,
        line.words?.length ?? 0,
    ]),
]);

/** Suppresses duplicate publishes. Same contract as the vendored tracker, without its import graph. */
export class ObsStageConfigPublisher {
    private lastSignature: string | null = null;

    /** Returns the config to publish, or null when nothing an overlay can see has changed. */
    prepare(enabled: boolean, config: ObsStageConfig): ObsStageConfig | null {
        if (!enabled) {
            this.lastSignature = null;
            return null;
        }
        const signature = buildObsStageConfigSignature(config);
        if (signature === this.lastSignature) return null;
        this.lastSignature = signature;
        return config;
    }

    reset() {
        this.lastSignature = null;
    }
}

/** Which lyric line is current at `timeSec`; -1 before the first line, like the app's own index. */
export const resolveObsStageLineIndex = (lines: Line[], timeSec: number): number => {
    const timeMs = timeSec * 1000;
    let index = -1;
    for (let i = 0; i < lines.length; i += 1) {
        if (lines[i].startTime <= timeMs) index = i;
        else break;
    }
    return index;
};
