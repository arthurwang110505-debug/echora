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
