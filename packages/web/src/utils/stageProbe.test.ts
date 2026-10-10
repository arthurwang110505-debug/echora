import { afterEach, describe, expect, it, vi } from 'vitest';

// src/utils/stageProbe.test.ts
//
// The probe's whole job is to turn frame deltas into numbers a human will trust, so the sampling
// math is tested against a driven clock: frames are delivered on demand and `performance.now()` is
// faked, which makes every percentile and every stall classification deterministic.

type ProbeModule = typeof import('./stageProbe');

interface Harness {
    probe: ProbeModule;
    /** Runs every queued animation-frame callback at `atMs`. */
    advance: (atMs: number) => void;
}

const originalPerformance = globalThis.performance;
const originalWindow = (globalThis as { window?: unknown }).window;

let fakeNow = 0;

const installHarness = async (search: string, storage?: string | null): Promise<Harness> => {
    vi.resetModules();
    fakeNow = 0;
    let nextRafId = 0;
    const queue = new Map<number, FrameRequestCallback>();

    const fakeWindow = {
        location: { search },
        localStorage: {
            getItem: (key: string) => (key === 'echora.stageProbe' ? storage ?? null : null),
        },
        requestAnimationFrame: (callback: FrameRequestCallback) => {
            nextRafId += 1;
            queue.set(nextRafId, callback);
            return nextRafId;
        },
        cancelAnimationFrame: (id: number) => {
            queue.delete(id);
        },
    };

    (globalThis as { window?: unknown }).window = fakeWindow;
    (globalThis as { performance?: unknown }).performance = { now: () => fakeNow };

    const probe = await import('./stageProbe');
    return {
        probe,
        advance: (atMs: number) => {
            fakeNow = atMs;
            const pending = [...queue.values()];
            queue.clear();
            pending.forEach(callback => callback(atMs));
        },
    };
};

afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
    (globalThis as { performance?: unknown }).performance = originalPerformance;
});

describe('stage probe enablement', () => {
    it('stays off without a window, and every entry point is safe to call', async () => {
        vi.resetModules();
        (globalThis as { window?: unknown }).window = undefined;
        const probe = await import('./stageProbe');

        expect(probe.isStageProbeEnabled()).toBe(false);
        expect(probe.reportStageProbe()).toBeNull();
        expect(() => {
            probe.beginStageProbe('sonnet');
            probe.probeSpan('x', 5);
            probe.probeCount('y');
            probe.installStageProbeGlobals();
            probe.endStageProbe();
        }).not.toThrow();
    });

    it('is switched on by ?stageProbe=1', async () => {
        const { probe } = await installHarness('?stageProbe=1');
        expect(probe.isStageProbeEnabled()).toBe(true);
    });

    it('lets ?stageProbe=0 win over the dev default, for a clean baseline run', async () => {
        const { probe } = await installHarness('?stageProbe=0');
        expect(probe.isStageProbeEnabled()).toBe(false);
    });

    it('is switched on by the stored flag, so a production build on a phone can be measured', async () => {
        const { probe } = await installHarness('', '1');
        expect(probe.isStageProbeEnabled()).toBe(true);
    });

    it('publishes the console API only when enabled and does so idempotently', async () => {
        const enabled = await installHarness('?stageProbe=1');
        enabled.probe.installStageProbeGlobals();
        enabled.probe.installStageProbeGlobals();
        const target = (globalThis as unknown as { window?: Record<string, unknown> }).window ?? {};
        expect(typeof target.__echoraStageReport).toBe('function');
        expect(typeof target.__echoraStageReset).toBe('function');

        const disabled = await installHarness('?stageProbe=0');
        disabled.probe.installStageProbeGlobals();
        const quietTarget = (globalThis as unknown as { window?: Record<string, unknown> }).window ?? {};
        expect(quietTarget.__echoraStageReport).toBeUndefined();
    });
});

describe('stage probe frame sampling', () => {
    it('classifies long frames and stalls, and reports the worst ones with their time', async () => {
        const { probe, advance } = await installHarness('?stageProbe=1');
        probe.beginStageProbe('sonnet');

        // Six callbacks: the first only establishes the clock, then five deltas are recorded.
        advance(0);
        advance(16);   // 16 ms
        advance(33);   // 17 ms
        advance(51);   // 18 ms
        advance(76);   // 25 ms - over the 20 ms budget
        advance(196);  // 120 ms - a visible freeze

        const report = probe.buildStageProbeReport();
        expect(report.mode).toBe('sonnet');
        expect(report.frames).toBe(5);
        expect(report.longFrames).toBe(2);
        expect(report.stalls).toBe(1);
        expect(report.worstMs).toBe(120);
        expect(report.p50Ms).toBe(18);
        expect(report.p95Ms).toBe(120);
        expect(report.worstStalls).toHaveLength(1);
        expect(report.worstStalls[0].ms).toBe(120);
        expect(report.worstStalls[0].atMs).toBeCloseTo(196, 5);
    });

    it('ignores the gap a backgrounded tab leaves behind instead of reporting a fake freeze', async () => {
        const { probe, advance } = await installHarness('?stageProbe=1');
        probe.beginStageProbe('sonnet');
        advance(0);
        advance(16);
        advance(16 + 30_000);

        const report = probe.buildStageProbeReport();
        expect(report.frames).toBe(1);
        expect(report.stalls).toBe(0);
        expect(report.worstMs).toBe(16);
    });

    it('aggregates spans and counts so a slow frame can be attributed to an operation', async () => {
        const { probe, advance } = await installHarness('?stageProbe=1');
        probe.beginStageProbe('sonnet');
        advance(0);
        advance(16);

        probe.probeSpan('sonnet.sceneBuild', 12.5);
        probe.probeSpan('sonnet.sceneBuild', 4);
        probe.probeCount('sonnet.scene.hit', 3);
        probe.probeSpan('sonnet.sceneBuild', Number.NaN);

        const report = probe.buildStageProbeReport();
        expect(report.counters['sonnet.sceneBuild']).toEqual({
            count: 2,
            totalMs: 16.5,
            maxMs: 12.5,
            perFrame: 2,
        });
        expect(report.counters['sonnet.scene.hit'].count).toBe(3);
        expect(report.counters['sonnet.scene.hit'].totalMs).toBe(0);
    });

    it('starts a fresh session on a mode switch and keeps samples across a paused tab', async () => {
        const { probe, advance } = await installHarness('?stageProbe=1');
        probe.beginStageProbe('sonnet');
        advance(0);
        advance(16);
        advance(32);
        expect(probe.buildStageProbeReport().frames).toBe(2);

        // StrictMode's mount/unmount/mount, or a paused tab: the session survives with its samples.
        probe.endStageProbe();
        advance(64);
        expect(probe.buildStageProbeReport().frames).toBe(2);
        probe.beginStageProbe('sonnet');
        // The first callback after a resume only re-establishes the clock, so the pause itself is
        // never recorded as a frame; the sample after it is.
        advance(80);
        expect(probe.buildStageProbeReport().frames).toBe(2);
        advance(96);
        expect(probe.buildStageProbeReport().frames).toBe(3);

        // A different stage is a different measurement.
        probe.beginStageProbe('diorama');
        const switched = probe.buildStageProbeReport();
        expect(switched.mode).toBe('diorama');
        expect(switched.frames).toBe(0);
    });

    it('stops sampling once the stage unmounts', async () => {
        const { probe, advance } = await installHarness('?stageProbe=1');
        probe.beginStageProbe('diorama');
        advance(0);
        advance(16);
        probe.endStageProbe();
        advance(1000);
        advance(2000);

        const report = probe.buildStageProbeReport();
        expect(report.running).toBe(false);
        expect(report.frames).toBe(1);
    });

    it('resets counters and samples without losing the running session', async () => {
        const { probe, advance } = await installHarness('?stageProbe=1');
        probe.beginStageProbe('sonnet');
        advance(0);
        advance(16);
        probe.probeCount('sonnet.handover');
        probe.resetStageProbe();

        const report = probe.buildStageProbeReport();
        expect(report.mode).toBe('sonnet');
        expect(report.running).toBe(true);
        expect(report.frames).toBe(0);
        expect(report.counters).toEqual({});
    });
});

describe('stage probe clock advance', () => {
    /**
     * The negative control from docs/tempera-lumiere-stall-diagnosis.md, as a permanent test rather
     * than a throwaway one. A stage that forwarded the store's `currentTime` prop published ~5
     * distinct positions across 61 frames, because the media element writes the store about four
     * times a second. Frame cadence was perfectly healthy throughout - which is exactly why this
     * took weeks to find: every frame-time metric said the stage was fine, because a frozen
     * timeline renders cheaply.
     */
    const FRAME_MS = 1000 / 60;
    const HOST_UPDATE_MS = 250;

    /** Drives `frames` frames, publishing the position a store-backed clock would have held. */
    const runStoreClockFrames = async (harness: Harness, frames: number) => {
        for (let index = 0; index < frames; index += 1) {
            const atMs = index * FRAME_MS;
            harness.advance(atMs);
            // The store only changes every HOST_UPDATE_MS, so consecutive frames repeat a position.
            const positionSec = Math.floor(atMs / HOST_UPDATE_MS) * (HOST_UPDATE_MS / 1000);
            harness.probe.probeClock(positionSec, true);
        }
    };

    it('flags the 4 Hz store clock as stalled while every frame-time metric reads healthy', async () => {
        const harness = await installHarness('?stageProbe=1');
        harness.probe.beginStageProbe('tempera');
        await runStoreClockFrames(harness, 61);

        const report = harness.probe.buildStageProbeReport();

        // The numbers from the original diagnosis: 61 frames, 5 distinct positions.
        expect(report.frames).toBe(60);
        expect(report.clockSamples).toBe(61);
        expect(report.clockAdvances).toBe(4);
        expect(report.clockAdvanceRatio).toBeCloseTo(4 / 61, 5);
        expect(report.clockStalled, 'a 4 Hz clock must read as stalled').toBe(true);

        // And the reason this class of bug hid for so long: nothing about the frames looks wrong.
        expect(report.fps, 'the stage really was rendering at 60fps').toBeGreaterThan(50);
        expect(report.longFrames, 'no frame exceeded the 20ms budget').toBe(0);
        expect(report.stalls, 'no frame exceeded 100ms').toBe(0);
        expect(report.worstMs).toBeLessThan(20);
    });

    it('reads a per-frame clock as healthy, which is what the extrapolating stage now does', async () => {
        const harness = await installHarness('?stageProbe=1');
        harness.probe.beginStageProbe('tempera');

        for (let index = 0; index < 61; index += 1) {
            const atMs = index * FRAME_MS;
            harness.advance(atMs);
            // playback/stageClock.ts extrapolates between store reports, so every frame differs.
            harness.probe.probeClock(atMs / 1000, true);
        }

        const report = harness.probe.buildStageProbeReport();
        expect(report.clockAdvances).toBe(60);
        expect(report.clockAdvanceRatio).toBeCloseTo(60 / 61, 5);
        expect(report.clockStalled).toBe(false);
    });

    it('does not accuse a paused stage of stalling, because a frozen clock is correct there', async () => {
        const harness = await installHarness('?stageProbe=1');
        harness.probe.beginStageProbe('tempera');

        for (let index = 0; index < 61; index += 1) {
            harness.advance(index * FRAME_MS);
            harness.probe.probeClock(12.5, false);
        }

        const report = harness.probe.buildStageProbeReport();
        expect(report.clockSamples, 'paused frames are not sampled at all').toBe(0);
        expect(report.clockAdvanceRatio).toBe(0);
        expect(report.clockStalled).toBe(false);
    });

    it('withholds a verdict until half a second of playing frames has been sampled', async () => {
        const harness = await installHarness('?stageProbe=1');
        harness.probe.beginStageProbe('tempera');
        // A seek or a song change holds a position for a few frames legitimately.
        await runStoreClockFrames(harness, 10);

        const report = harness.probe.buildStageProbeReport();
        expect(report.clockSamples).toBe(10);
        expect(report.clockAdvanceRatio).toBeLessThan(0.5);
        expect(report.clockStalled, 'too few samples to judge').toBe(false);
    });

    it('treats rounding noise as the same position rather than an advance', async () => {
        const harness = await installHarness('?stageProbe=1');
        harness.probe.beginStageProbe('tempera');

        for (let index = 0; index < 40; index += 1) {
            harness.advance(index * FRAME_MS);
            // Republished stored prop with float dust on it: not a real advance.
            harness.probe.probeClock(3 + index * 1e-9, true);
        }

        const report = harness.probe.buildStageProbeReport();
        expect(report.clockSamples).toBe(40);
        expect(report.clockAdvances).toBe(0);
        expect(report.clockStalled).toBe(true);
    });

    it('clears the clock samples on reset and on a mode switch, with the frame samples', async () => {
        const harness = await installHarness('?stageProbe=1');
        harness.probe.beginStageProbe('tempera');
        await runStoreClockFrames(harness, 40);
        expect(harness.probe.buildStageProbeReport().clockSamples).toBe(40);

        harness.probe.resetStageProbe();
        expect(harness.probe.buildStageProbeReport().clockSamples).toBe(0);

        await runStoreClockFrames(harness, 20);
        harness.probe.beginStageProbe('lumiere');
        const report = harness.probe.buildStageProbeReport();
        expect(report.mode).toBe('lumiere');
        expect(report.clockSamples, 'a mode switch starts a new session').toBe(0);
    });

    it('is a no-op when the probe is off, like every other entry point', async () => {
        const harness = await installHarness('?stageProbe=0');
        harness.probe.beginStageProbe('tempera');
        await runStoreClockFrames(harness, 61);

        expect(harness.probe.buildStageProbeReport().clockSamples).toBe(0);
    });
});
