import { describe, expect, it } from 'vitest';
import {
    STAGE_CLOCK_MAX_EXTRAPOLATION_SEC,
    createStageClock,
} from './stageClock';

// src/playback/stageClock.test.ts
//
// The invariants that decide whether a stage animates or stutters. A stage renderer reads its
// position once per frame and derives the whole composition from it, so the property that matters
// is not "is the number right" but "does the number MOVE between two coarse host updates".

/** Feeds a 4 Hz `timeupdate`-style cadence and reads the clock at 60 Hz for `seconds`. */
const sampleCoarseClock = ({
    seconds,
    hostIntervalMs = 250,
    frameIntervalMs = 1000 / 60,
    playing = true,
    durationSec,
    startSec = 10,
}: {
    seconds: number;
    hostIntervalMs?: number;
    frameIntervalMs?: number;
    playing?: boolean;
    durationSec?: number;
    startSec?: number;
}) => {
    const clock = createStageClock();
    const frames: number[] = [];
    const totalMs = seconds * 1000;
    let nextHostUpdateMs = 0;
    let lastReported = startSec;

    for (let nowMs = 0; nowMs <= totalMs; nowMs += frameIntervalMs) {
        // The host reports a new position every `hostIntervalMs`. Between those it still renders,
        // handing down the same stale value - which is exactly what a store-backed clock does.
        if (nowMs >= nextHostUpdateMs) {
            lastReported = startSec + nowMs / 1000;
            nextHostUpdateMs += hostIntervalMs;
        }
        clock.update({ timeSec: lastReported, playing, durationSec }, nowMs);
        frames.push(clock.read(nowMs));
    }
    return frames;
};

describe('stage clock', () => {
    it('moves on every frame between two coarse host updates', () => {
        const frames = sampleCoarseClock({ seconds: 1 });

        // One second at 60 fps with a 4 Hz host clock. A clock that merely forwarded the host
        // value would repeat each position for ~15 frames; the whole point is that it does not.
        expect(frames.length).toBeGreaterThan(55);
        expect(new Set(frames.map(value => value.toFixed(4))).size).toBeGreaterThan(55);

        for (let index = 1; index < frames.length; index += 1) {
            expect(frames[index], `frame ${index} did not advance`).toBeGreaterThanOrEqual(frames[index - 1]!);
        }
    });

    it('tracks the real position instead of running away from it', () => {
        const frames = sampleCoarseClock({ seconds: 2, startSec: 10 });
        const last = frames[frames.length - 1]!;

        // Two seconds of playback starting at 10 s. Wall-clock extrapolation between 4 Hz anchors
        // cannot be exact, but it has to land within one host interval of the truth.
        expect(last).toBeCloseTo(12, 1);
        expect(Math.abs(last - 12)).toBeLessThan(0.25);
    });

    it('holds the position while paused', () => {
        const clock = createStageClock();
        clock.update({ timeSec: 42, playing: false }, 0);

        expect(clock.read(0)).toBe(42);
        expect(clock.read(5_000)).toBe(42);
        expect(clock.read(60_000)).toBe(42);
    });

    it('does not restart the extrapolation when the host re-renders with the same position', () => {
        const clock = createStageClock();
        clock.update({ timeSec: 5, playing: true }, 0);

        // Three host renders inside one update interval, all reporting the same stale position.
        clock.update({ timeSec: 5, playing: true }, 80);
        clock.update({ timeSec: 5, playing: true }, 160);

        expect(clock.read(160)).toBeCloseTo(5.16, 5);
    });

    it('resumes advancing from the new anchor when the position finally moves', () => {
        const clock = createStageClock();
        clock.update({ timeSec: 5, playing: true }, 0);
        expect(clock.read(100)).toBeCloseTo(5.1, 5);

        clock.update({ timeSec: 5.25, playing: true }, 250);
        expect(clock.read(250)).toBeCloseTo(5.25, 5);
        expect(clock.read(350)).toBeCloseTo(5.35, 5);
    });

    it('caps how far it runs ahead of a source that stopped reporting', () => {
        const clock = createStageClock();
        clock.update({ timeSec: 30, playing: true }, 0);

        // No further `timeupdate` ever arrives: buffering, a hidden tab, a stalled element.
        expect(clock.read(100)).toBeCloseTo(30.1, 5);
        expect(clock.read(10_000)).toBeCloseTo(30 + STAGE_CLOCK_MAX_EXTRAPOLATION_SEC, 5);
        expect(clock.read(600_000)).toBeCloseTo(30 + STAGE_CLOCK_MAX_EXTRAPOLATION_SEC, 5);
    });

    it('clamps to the duration and never returns a negative position', () => {
        const clock = createStageClock();
        clock.update({ timeSec: 199.9, playing: true, durationSec: 200 }, 0);
        expect(clock.read(5_000)).toBe(200);

        clock.update({ timeSec: -3, playing: true }, 5_000);
        expect(clock.read(5_000)).toBe(0);
    });

    it('scales with the playback rate', () => {
        const clock = createStageClock();
        clock.update({ timeSec: 10, playing: true, playbackRate: 1.5 }, 0);
        // Inside the extrapolation window: half a second of wall clock is 0.75 s of media.
        expect(clock.read(500)).toBeCloseTo(10.75, 5);
        // Past it the wall-clock bound applies first, so the rate scales the capped interval.
        expect(clock.read(60_000)).toBeCloseTo(
            10 + STAGE_CLOCK_MAX_EXTRAPOLATION_SEC * 1.5,
            5,
        );
    });

    it('treats a jump backwards as a re-anchor, not as something to extrapolate over', () => {
        const clock = createStageClock();
        clock.update({ timeSec: 90, playing: true }, 0);
        expect(clock.read(500)).toBeCloseTo(90.5, 5);

        // A seek or a track change: the reported position moves backwards.
        clock.update({ timeSec: 4, playing: true }, 600);
        expect(clock.read(600)).toBe(4);
        expect(clock.read(700)).toBeCloseTo(4.1, 5);
    });

    it('ignores a malformed sample rather than publishing NaN', () => {
        const clock = createStageClock();
        clock.update({ timeSec: Number.NaN, playing: true }, 0);
        expect(clock.read(100)).toBeCloseTo(0.1, 5);

        clock.update({ timeSec: 12, playing: true, durationSec: Number.NaN }, 200);
        expect(clock.read(300)).toBeCloseTo(12.1, 5);
    });

    it('resumes from the held position when playback restarts', () => {
        const clock = createStageClock();
        clock.update({ timeSec: 20, playing: true }, 0);
        clock.update({ timeSec: 20, playing: false }, 1_000);
        expect(clock.read(5_000)).toBe(20);

        clock.update({ timeSec: 20, playing: true }, 5_000);
        expect(clock.read(5_100)).toBeCloseTo(20.1, 5);
    });
});
