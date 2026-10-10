// src/utils/stageProbe.ts
//
// Echora's stage probe: the measurement half of the visualizer engine.
//
// Upstream Folia measures its stages with dedicated probes under `dev/probes` plus a single-worker
// Playwright runner, because "a render count is only attributable on a machine that is not
// otherwise busy". Echora runs on phones and tablets, so its equivalent has to be something the
// user can switch on in the real app, on the real device, and read back afterwards.
//
// What it measures (mode-agnostic, so every stage is covered without per-mode work):
//   - main-thread frame cadence: p50/p95/p99 frame time, frames over 20 ms, stalls over 100 ms
//   - timeline advance: how often the position the stage publishes actually moves (see below)
//   - named counters and durations that the engines report (scene builds, handovers, resizes, ...)
//
// Frame cadence alone cannot see the failure this repository has actually hit twice. rAF keeps
// firing at 60 fps while the stage is frozen, so a timeline-driven mode reading a 4 Hz clock
// reports a healthy p95 and zero stalls - every frame was cheap, because every frame drew the same
// thing. `probeClock` closes that gap: the stage hands it the position it published, and the report
// says what fraction of frames moved that position on. ~1.0 is a per-frame clock; ~0.07 is the 4 Hz
// bug from docs/tempera-lumiere-stall-diagnosis.md, which is what `clockStalled` flags.
//
// Enable it with `?stageProbe=1` in the URL, or `localStorage.setItem('echora.stageProbe', '1')`.
// It is also on in dev builds. Read the result with `__echoraStageReport()` in the console.
//
// Cost when disabled: every entry point is a single boolean check. When enabled the sampler adds
// one rAF callback per frame and two `performance.now()` calls; it never allocates per frame.

export interface StageProbeCounter {
    count: number;
    totalMs: number;
    maxMs: number;
}

export interface StageProbeStall {
    atMs: number;
    ms: number;
}

export interface StageProbeReport {
    mode: string | null;
    running: boolean;
    durationMs: number;
    frames: number;
    fps: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    worstMs: number;
    /** Frames slower than a 60 fps budget (20 ms). */
    longFrames: number;
    /** Frames slower than 100 ms: the ones that read as a freeze. */
    stalls: number;
    worstStalls: StageProbeStall[];
    /**
     * Frames where the stage published a timeline position while playing. Paused frames are not
     * counted: a frozen clock is correct behaviour when nothing is playing, and including them
     * would make every pause look like a stall.
     */
    clockSamples: number;
    /** Of those samples, how many moved the position on from the previous one. */
    clockAdvances: number;
    /**
     * `clockAdvances / clockSamples`, or 0 when there are no playing samples. ~1 for a clock read
     * per frame; ~0.07 for the 4 Hz store clock that made the timeline-driven modes read as stuck.
     */
    clockAdvanceRatio: number;
    /**
     * True when enough playing frames were sampled to judge and the ratio is still below
     * `STAGE_PROBE_MIN_CLOCK_ADVANCE_RATIO`: frames are arriving but the timeline is not moving.
     */
    clockStalled: boolean;
    counters: Record<string, StageProbeCounter & { perFrame: number }>;
}

/** Frames at or above this are dropped work for a 60 fps stage. */
export const STAGE_PROBE_LONG_FRAME_MS = 20;
/** Frames at or above this read as a freeze rather than as jank. */
export const STAGE_PROBE_STALL_MS = 100;

/** 60 s of frames at 60 fps. Beyond that the oldest samples are overwritten. */
const FRAME_RING_SIZE = 3600;
const MAX_REPORTED_STALLS = 8;
const STORAGE_KEY = 'echora.stageProbe';

/**
 * Below this fraction of playing frames advancing the timeline, the stage is stalled. Set halfway
 * between the two behaviours it has to tell apart: a clock read once per frame sits at ~1.0, and a
 * stage deliberately capped to 30 fps still sits at ~1.0 because the sampler counts published
 * positions rather than rAF ticks. The 4 Hz store clock that caused the original stall sits at
 * ~0.07. Halfway is 0.5 - generous enough that a legitimately coarse clock is not accused, and an
 * order of magnitude above the real failure.
 */
export const STAGE_PROBE_MIN_CLOCK_ADVANCE_RATIO = 0.5;

/**
 * Do not judge a stall on a handful of frames: a seek, a song change or the first frames after a
 * mount all hold a position briefly and legitimately. Half a second at 60 fps is enough to tell a
 * transient from a stuck clock.
 */
export const STAGE_PROBE_CLOCK_STALL_MIN_SAMPLES = 30;

/**
 * Two published positions closer than this are the same position. Playback clocks are floats
 * derived from `performance.now()`, so an advancing clock never repeats a value exactly, but a
 * stage that republishes a stored prop does - and rounding noise should not read as an advance.
 */
const CLOCK_ADVANCE_EPSILON_SEC = 1e-4;

export const stageNow = (): number => (
    typeof performance !== 'undefined' ? performance.now() : Date.now()
);

let enabledCache: boolean | null = null;

const readParam = (): string | null => {
    if (typeof window === 'undefined') return null;
    try {
        const search = new URLSearchParams(window.location.search);
        return search.get('stageProbe');
    } catch {
        return null;
    }
};

/**
 * Opt-in resolution, in priority order:
 *   1. `?stageProbe=0`  -> off, even in dev (a clean baseline run)
 *   2. `?stageProbe=1`  -> on
 *   3. localStorage `echora.stageProbe` = '1' -> on, so a production build on a phone can be
 *      measured without editing the URL every time
 *   4. dev builds       -> on
 */
export const isStageProbeEnabled = (): boolean => {
    if (enabledCache !== null) return enabledCache;
    if (typeof window === 'undefined') {
        enabledCache = false;
        return enabledCache;
    }
    const param = readParam();
    if (param === '0') {
        enabledCache = false;
        return enabledCache;
    }
    if (param === '1') {
        enabledCache = true;
        return enabledCache;
    }
    try {
        if (window.localStorage?.getItem(STORAGE_KEY) === '1') {
            enabledCache = true;
            return enabledCache;
        }
    } catch {
        // Private mode / disabled storage: fall through to the build-time default.
    }
    enabledCache = Boolean(import.meta.env?.DEV);
    return enabledCache;
};

interface ProbeState {
    mode: string | null;
    running: boolean;
    startedAt: number;
    /** Whether `lastFrameAt` holds a real sample; `0` is a valid clock reading, not a sentinel. */
    hasClock: boolean;
    lastFrameAt: number;
    rafId: number | null;
    frames: number;
    frameRing: Float64Array;
    ringIndex: number;
    ringFilled: number;
    longFrames: number;
    stalls: number;
    worstStalls: StageProbeStall[];
    clockSamples: number;
    clockAdvances: number;
    /** Whether `lastClockPosition` holds a real sample; `0` is a valid position, not a sentinel. */
    hasLastClock: boolean;
    lastClockPosition: number;
    counters: Map<string, StageProbeCounter>;
}

const createState = (): ProbeState => ({
    mode: null,
    running: false,
    startedAt: 0,
    hasClock: false,
    lastFrameAt: 0,
    rafId: null,
    frames: 0,
    frameRing: new Float64Array(FRAME_RING_SIZE),
    ringIndex: 0,
    ringFilled: 0,
    longFrames: 0,
    stalls: 0,
    worstStalls: [],
    clockSamples: 0,
    clockAdvances: 0,
    hasLastClock: false,
    lastClockPosition: 0,
    counters: new Map(),
});

let state: ProbeState = createState();

const resetStats = (mode: string | null) => {
    state = createState();
    state.mode = mode;
};

const recordFrameDelta = (deltaMs: number) => {
    const atMs = state.frames > 0 ? stageNow() - state.startedAt : 0;
    state.frames += 1;
    state.frameRing[state.ringIndex] = deltaMs;
    state.ringIndex = (state.ringIndex + 1) % FRAME_RING_SIZE;
    state.ringFilled = Math.min(state.ringFilled + 1, FRAME_RING_SIZE);
    if (deltaMs >= STAGE_PROBE_LONG_FRAME_MS) state.longFrames += 1;
    if (deltaMs >= STAGE_PROBE_STALL_MS) {
        state.stalls += 1;
        state.worstStalls.push({ atMs, ms: deltaMs });
        // Keep the report bounded: sort descending by duration, keep the top N.
        state.worstStalls.sort((a, b) => b.ms - a.ms);
        if (state.worstStalls.length > MAX_REPORTED_STALLS) state.worstStalls.length = MAX_REPORTED_STALLS;
    }
};

const tick = () => {
    if (!state.running) return;
    const now = stageNow();
    if (state.hasClock) {
        const delta = now - state.lastFrameAt;
        // A backgrounded tab pauses rAF; when it resumes the first delta spans the whole pause and
        // would be reported as an enormous stall. Anything past a second is not a frame, skip it.
        if (delta > 0 && delta < 1000) recordFrameDelta(delta);
    }
    state.hasClock = true;
    state.lastFrameAt = now;
    state.rafId = window.requestAnimationFrame(tick);
};

/**
 * Starts (or restarts) a measurement session for a stage. Safe to call on every mode change:
 * the same mode is a no-op, a different mode resets the samples and re-labels the session.
 */
export const beginStageProbe = (mode: string): void => {
    if (!isStageProbeEnabled() || typeof window === 'undefined') return;
    const sameMode = state.mode === mode;
    if (state.running) {
        if (sameMode) return;
        // A mode switch starts a new session: samples from two stages would average into a number
        // that describes neither.
        resetStats(mode);
        state.running = true;
        state.startedAt = stageNow();
        state.hasClock = false;
        state.lastFrameAt = 0;
        return;
    }
    // Suspended (paused tab, or StrictMode's mount/unmount/mount) with samples already in hand:
    // resume the same session rather than throwing the warm-up away.
    if (!sameMode) resetStats(mode);
    state.mode = mode;
    if (state.frames === 0) state.startedAt = stageNow();
    state.hasClock = false;
    state.lastFrameAt = 0;
    state.running = true;
    state.rafId = window.requestAnimationFrame(tick);
};

export const endStageProbe = (): void => {
    if (!state.running) return;
    state.running = false;
    if (state.rafId !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(state.rafId);
    }
    state.rafId = null;
};

export const resetStageProbe = (): void => {
    const mode = state.mode;
    const running = state.running;
    resetStats(mode);
    state.running = running;
    state.startedAt = stageNow();
    state.hasClock = false;
    state.lastFrameAt = 0;
};

/**
 * Records a measured duration under a name. Engines call this around their expensive work
 * (scene builds, layout passes, handovers) so the report says which operation is responsible
 * for a slow frame instead of only that the frame was slow.
 */
export const probeSpan = (name: string, ms: number): void => {
    if (!isStageProbeEnabled() || !Number.isFinite(ms)) return;
    const entry = state.counters.get(name) ?? { count: 0, totalMs: 0, maxMs: 0 };
    entry.count += 1;
    entry.totalMs += ms;
    if (ms > entry.maxMs) entry.maxMs = ms;
    state.counters.set(name, entry);
};

/** Records an occurrence (no duration attached). */
export const probeCount = (name: string, amount = 1): void => {
    if (!isStageProbeEnabled() || !Number.isFinite(amount)) return;
    const entry = state.counters.get(name) ?? { count: 0, totalMs: 0, maxMs: 0 };
    entry.count += amount;
    state.counters.set(name, entry);
};

/**
 * Records the timeline position a stage published for this frame.
 *
 * This is the metric that separates "the stage is slow" from "the stage is stuck", and the two look
 * identical to a frame-time sampler: a frozen timeline renders cheaply, so it reports a good p95 and
 * no stalls while the picture never changes. Call it once per published frame with the position the
 * renderer was actually handed, and with whether playback is running - paused frames are skipped,
 * because a clock that does not move while nothing is playing is correct, not stalled.
 *
 * Costs one comparison and two increments per frame when enabled, and nothing when disabled.
 */
export const probeClock = (positionSec: number, playing: boolean): void => {
    if (!isStageProbeEnabled() || !playing || !Number.isFinite(positionSec)) return;
    state.clockSamples += 1;
    if (!state.hasLastClock) {
        // The first sample establishes the baseline; it cannot have advanced from nothing.
        state.hasLastClock = true;
        state.lastClockPosition = positionSec;
        return;
    }
    if (Math.abs(positionSec - state.lastClockPosition) >= CLOCK_ADVANCE_EPSILON_SEC) {
        state.clockAdvances += 1;
        state.lastClockPosition = positionSec;
    }
};

const percentile = (sorted: Float64Array, length: number, fraction: number): number => {
    if (length === 0) return 0;
    const index = Math.min(length - 1, Math.max(0, Math.round(fraction * (length - 1))));
    return sorted[index];
};

export const buildStageProbeReport = (): StageProbeReport => {
    const length = state.ringFilled;
    const samples = state.frameRing.slice(0, length);
    const sorted = samples.slice().sort();
    const totalMs = samples.reduce((sum, value) => sum + value, 0);
    const frames = state.frames;
    const counters: StageProbeReport['counters'] = {};
    state.counters.forEach((entry, name) => {
        counters[name] = {
            ...entry,
            perFrame: frames > 0 ? entry.count / frames : 0,
        };
    });

    const clockSamples = state.clockSamples;
    const clockAdvanceRatio = clockSamples > 0 ? state.clockAdvances / clockSamples : 0;
    const clockStalled = (
        clockSamples >= STAGE_PROBE_CLOCK_STALL_MIN_SAMPLES
        && clockAdvanceRatio < STAGE_PROBE_MIN_CLOCK_ADVANCE_RATIO
    );

    return {
        mode: state.mode,
        running: state.running,
        durationMs: state.running && state.startedAt > 0 ? stageNow() - state.startedAt : totalMs,
        frames,
        fps: frames > 0 && totalMs > 0 ? (frames / totalMs) * 1000 : 0,
        p50Ms: percentile(sorted, length, 0.5),
        p95Ms: percentile(sorted, length, 0.95),
        p99Ms: percentile(sorted, length, 0.99),
        worstMs: length > 0 ? sorted[length - 1] : 0,
        longFrames: state.longFrames,
        stalls: state.stalls,
        worstStalls: state.worstStalls.slice(),
        clockSamples: state.clockSamples,
        clockAdvances: state.clockAdvances,
        clockAdvanceRatio: clockAdvanceRatio,
        clockStalled: clockStalled,
        counters,
    };
};

const formatMs = (value: number) => `${value.toFixed(1)}ms`;

/** Prints a compact summary and returns the raw report (null when the probe is off). */
export const reportStageProbe = (): StageProbeReport | null => {
    if (!isStageProbeEnabled()) return null;
    const report = buildStageProbeReport();
    const counterRows = Object.entries(report.counters)
        .sort((a, b) => b[1].totalMs - a[1].totalMs)
        .map(([name, entry]) => ({
            counter: name,
            count: entry.count,
            'total (ms)': Number(entry.totalMs.toFixed(1)),
            'max (ms)': Number(entry.maxMs.toFixed(1)),
            'per frame': Number(entry.perFrame.toFixed(3)),
        }));

    const summary = {
        mode: report.mode,
        running: report.running,
        frames: report.frames,
        fps: Number(report.fps.toFixed(1)),
        p50: formatMs(report.p50Ms),
        p95: formatMs(report.p95Ms),
        p99: formatMs(report.p99Ms),
        worst: formatMs(report.worstMs),
        'frames >20ms': report.longFrames,
        'stalls >100ms': report.stalls,
        // The verdict that a frame-time summary cannot give: frames are arriving, but is the
        // timeline moving? Reported as a ratio and as a count so "5 advances across 61 frames" reads
        // the way it did when this bug was first diagnosed by hand.
        'clock advanced': report.clockSamples > 0
            ? `${report.clockAdvances}/${report.clockSamples} (${(report.clockAdvanceRatio * 100).toFixed(0)}%)`
            : 'no playing frames sampled',
    };

    // The probe is a developer tool: the console is its output surface.
    console.log('[echora stage probe]', summary);
    if (report.clockStalled) {
        console.warn(
            `[echora stage probe] STALLED: ${report.mode ?? 'stage'} advanced the timeline on only `
            + `${report.clockAdvances} of ${report.clockSamples} playing frames `
            + `(${(report.clockAdvanceRatio * 100).toFixed(0)}%, expected ~100%) while rendering `
            + `${report.frames} frames at ${report.fps.toFixed(1)} fps. The stage is drawing, but the `
            + 'clock it reads is not moving per frame - see docs/tempera-lumiere-stall-diagnosis.md.',
        );
    }
    if (counterRows.length > 0) console.table(counterRows);
    if (report.worstStalls.length > 0) {
        console.log('[echora stage probe] worst stalls', report.worstStalls.map(
            stall => `${stall.ms.toFixed(0)}ms at t+${(stall.atMs / 1000).toFixed(1)}s`,
        ));
    }

    return report;
};

interface StageProbeGlobals {
    __echoraStageReport?: () => StageProbeReport | null;
    __echoraStageReset?: () => void;
    __echoraStageProbe?: {
        begin: (mode: string) => void;
        end: () => void;
        enabled: () => boolean;
    };
}

/** Publishes the console API. Idempotent, and a no-op unless the probe is enabled. */
export const installStageProbeGlobals = (): void => {
    if (!isStageProbeEnabled() || typeof window === 'undefined') return;
    const target = window as Window & StageProbeGlobals;
    target.__echoraStageReport = reportStageProbe;
    target.__echoraStageReset = resetStageProbe;
    target.__echoraStageProbe = {
        begin: beginStageProbe,
        end: endStageProbe,
        enabled: isStageProbeEnabled,
    };
};
