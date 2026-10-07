import { describe, expect, it } from 'vitest';
// @ts-expect-error - plain .mjs without types, deliberately: the relay must not import the app.
import { STAGE_PROTOCOL_VERSION } from '../../stage-server/protocol.mjs';
import {
    OBS_STAGE_PROTOCOL_VERSION,
    ObsStageConfigPublisher,
    buildObsStageConfigSignature,
    buildObsStageEventsUrl,
    buildObsStageOverlayUrl,
    parseObsStageOverlayParams,
    resolveObsStageLineIndex,
    resolveObsStageTime,
    type ObsStageClock,
    type ObsStageConfig,
} from './protocol';

// src/obs/protocol.test.ts
//
// The overlay's half of the Stage API. These are the invariants that keep a stream from stuttering,
// drifting or showing the wrong lyric, so they are tested directly rather than through the UI.

const clock = (overrides: Partial<ObsStageClock> = {}): ObsStageClock => ({
    currentTime: 10,
    sentAtMs: 1000,
    playerState: 'playing',
    duration: 200,
    playbackRate: 1,
    lyricOffsetMs: 0,
    ...overrides,
});

describe('observe stage protocol', () => {
    it('matches the relay protocol version', () => {
        // If these drift apart, an overlay silently misreads every frame. See stage-server/protocol.mjs.
        expect(OBS_STAGE_PROTOCOL_VERSION).toBe(STAGE_PROTOCOL_VERSION);
    });
});

describe('overlay URL', () => {
    it('defaults to the relay and drops a scheme or trailing slash from a pasted address', () => {
        expect(parseObsStageOverlayParams('')).toMatchObject({ transport: 'relay', relay: '127.0.0.1:32107', token: '', quiet: false });
        expect(parseObsStageOverlayParams('?relay=http://192.168.1.9:32107/')).toMatchObject({ relay: 'http://192.168.1.9:32107/' });
        expect(buildObsStageEventsUrl('http://192.168.1.9:32107/', 'secret')).toBe('http://192.168.1.9:32107/obs/events?token=secret');
    });

    it('encodes a token rather than assuming it is URL-safe', () => {
        expect(buildObsStageEventsUrl('127.0.0.1:32107', 'a b&c')).toBe('http://127.0.0.1:32107/obs/events?token=a%20b%26c');
    });

    it('builds an overlay URL from the app origin and omits defaults', () => {
        const url = buildObsStageOverlayUrl('https://echora.example/', { relay: '127.0.0.1:32107', token: 'tok' });
        expect(url).toBe('https://echora.example/obs?relay=127.0.0.1%3A32107&token=tok');
        expect(parseObsStageOverlayParams(new URL(url).search)).toMatchObject({ transport: 'relay', relay: '127.0.0.1:32107', token: 'tok' });
    });

    it('leaves the relay out of a broadcast overlay and keeps quiet', () => {
        const url = buildObsStageOverlayUrl('https://echora.example', { relay: '127.0.0.1:32107', token: '', transport: 'broadcast', quiet: true });
        expect(url).toBe('https://echora.example/obs?transport=broadcast&quiet=1');
        expect(parseObsStageOverlayParams(new URL(url).search)).toMatchObject({ transport: 'broadcast', quiet: true });
    });
});

describe('resolveObsStageTime', () => {
    it('extrapolates between clock messages', () => {
        // 5 Hz messages driving a 60 fps stage: the position must move between them.
        expect(resolveObsStageTime(clock(), 1000)).toBe(10);
        expect(resolveObsStageTime(clock(), 1200)).toBeCloseTo(10.2, 5);
        expect(resolveObsStageTime(clock(), 1500)).toBeCloseTo(10.5, 5);
    });

    it('holds the position while paused', () => {
        expect(resolveObsStageTime(clock({ playerState: 'paused' }), 9000)).toBe(10);
    });

    it('scales with the playback rate', () => {
        expect(resolveObsStageTime(clock({ playbackRate: 1.5 }), 2000)).toBeCloseTo(11.5, 5);
    });

    it('clamps to the duration and never goes negative', () => {
        expect(resolveObsStageTime(clock({ currentTime: 199.9, duration: 200 }), 10_000)).toBe(200);
        expect(resolveObsStageTime(clock({ currentTime: 1 }), 500)).toBe(1);
    });

    it('subtracts a lyric offset the publisher left for the overlay', () => {
        expect(resolveObsStageTime(clock({ lyricOffsetMs: 500 }), 1000)).toBe(9.5);
    });

    it('treats a missing clock as the start of the song', () => {
        expect(resolveObsStageTime(null, 5000)).toBe(0);
    });
});

describe('resolveObsStageLineIndex', () => {
    const lines = [
        { fullText: 'a', startTime: 0, endTime: 1000, words: [] },
        { fullText: 'b', startTime: 1000, endTime: 2000, words: [] },
        { fullText: 'c', startTime: 5000, endTime: 6000, words: [] },
    ];

    it('tracks the last line that has started', () => {
        expect(resolveObsStageLineIndex(lines, 1.5)).toBe(1);
        expect(resolveObsStageLineIndex(lines, 2.5)).toBe(1); // still sitting on the previous line
        expect(resolveObsStageLineIndex(lines, 5.1)).toBe(2);
    });

    it('is -1 before the first line', () => {
        expect(resolveObsStageLineIndex([{ fullText: 'a', startTime: 1000, endTime: 2000, words: [] }], 0.2)).toBe(-1);
    });
});

const config = (overrides: Partial<ObsStageConfig> = {}): ObsStageConfig => ({
    version: OBS_STAGE_PROTOCOL_VERSION,
    updatedAt: 1000,
    visualizerMode: 'sonnet',
    backgroundMode: 'latent',
    visualizerTunings: {},
    theme: { name: 't', backgroundColor: '#000', primaryColor: '#111', accentColor: '#222', secondaryColor: '#333' },
    song: { title: 'Song', artist: 'Artist', duration: 200 },
    lyrics: [{ fullText: 'a', startTime: 0, endTime: 1000, words: [] }],
    showText: true,
    ...overrides,
});

describe('ObsStageConfigPublisher', () => {
    it('publishes once and suppresses an identical config', () => {
        const publisher = new ObsStageConfigPublisher();
        expect(publisher.prepare(true, config())).not.toBeNull();
        expect(publisher.prepare(true, config())).toBeNull();
    });

    it('ignores updatedAt, so a render loop cannot republish the same payload', () => {
        const publisher = new ObsStageConfigPublisher();
        publisher.prepare(true, config({ updatedAt: 1 }));
        expect(publisher.prepare(true, config({ updatedAt: 99_999 }))).toBeNull();
    });

    it('republishes when the lyrics, tuning or song change', () => {
        const publisher = new ObsStageConfigPublisher();
        publisher.prepare(true, config());
        expect(publisher.prepare(true, config({ lyrics: [{ fullText: 'b', startTime: 0, endTime: 1000, words: [] }] }))).not.toBeNull();
        publisher.reset();
        publisher.prepare(true, config());
        expect(publisher.prepare(true, config({ visualizerTunings: { sonnet: { blur: 2 } } }))).not.toBeNull();
        publisher.reset();
        publisher.prepare(true, config());
        expect(publisher.prepare(true, config({ song: { title: 'Other' } }))).not.toBeNull();
    });

    it('sends nothing while publishing is off, and forgets its history', () => {
        const publisher = new ObsStageConfigPublisher();
        expect(publisher.prepare(false, config())).toBeNull();
        // Turning publishing off and on again must resend, since the relay may have restarted.
        expect(publisher.prepare(true, config())).not.toBeNull();
    });

    it('signature is stable for the same content in a new array', () => {
        const a = buildObsStageConfigSignature(config());
        const b = buildObsStageConfigSignature(config({ updatedAt: 42 }));
        expect(a).toBe(b);
        expect(buildObsStageConfigSignature(config({ lyrics: [] }))).not.toBe(a);
    });
});
