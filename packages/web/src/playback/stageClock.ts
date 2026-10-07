// src/playback/stageClock.ts
//
// The stage's clock: turns a COARSE playback position into a PER-FRAME one.
//
// Why this module exists
// ----------------------
// Echora's playback position lives in the player store, and the store is only written when the
// media source reports in:
//
//   * local `<audio>`   -> the `timeupdate` event, which the HTML spec fires every 15-250 ms and
//                          Chrome fires about 4x/second (components/LocalAudioController.tsx)
//   * YouTube Music     -> a 100 ms poll of the iframe API (components/YouTubePlayer.tsx)
//   * landing preview   -> a 100 ms interval (components/landing/LiveStage.tsx)
//   * OBS overlay       -> a 5 Hz clock message (obs/protocol.ts)
//
// The visualizer stages render at display rate and derive their whole composition from one
// MotionValue: `createTemperaPixiRuntime.renderFrame` and `createLumierePixiRuntime.renderFrame`
// both start with `const time = this.options.currentTime.get()` and pick the paragraph, the shot,
// the camera pose and the transition phase from it. Feeding that MotionValue straight from a store
// field means the picture is recomputed 60 times a second against a timeline that only moves 4
// times a second - the stage holds still for ~250 ms and then jumps. Upstream Folia does not have
// this problem because its `usePlaybackVisualizerBridge` reads `audioElement.currentTime` INSIDE
// its requestAnimationFrame loop, so the clock it publishes is already per-frame.
//
// The OBS overlay already solved exactly this for a 5 Hz feed with `resolveObsStageTime`
// ("this is what makes a 5 Hz feed drive a 60 fps stage"), but it was wired only to the overlay,
// through the stage's optional `timeProvider` prop. `LiveStage`'s own comment even assumed the
// player path had it ("the stage interpolates between frames itself"). This is that interpolation,
// shared by every host, with the same semantics the overlay uses: advance with wall-clock time
// while playing, hold while paused, clamp to the duration when it is known.

/** What the host knows at the moment it reports a position. */
export interface StageClockSample {
    /** Playback position in seconds, as the host reports it. */
    timeSec: number;
    /** Whether the media is advancing. A paused stage must never extrapolate. */
    playing: boolean;
    /** Total length in seconds; `0`/`undefined`/non-finite means unknown. */
    durationSec?: number;
    /** Playback rate; `1` when the host has no rate control. */
    playbackRate?: number;
}

/**
 * How far ahead of the last reported position the clock may run, in SECONDS OF WALL-CLOCK TIME.
 *
 * The cap is what keeps a stalled source honest: if `timeupdate` stops arriving (a buffering
 * element, a backgrounded tab, a source that paused without telling us), an uncapped clock would
 * keep marching and the lyrics would drift away from the audio. 0.75 s is about three times the
 * worst `timeupdate` gap, so a healthy source never reaches it, and a stalled one freezes instead
 * of drifting. The bound is applied before the playback rate, so it always means "no more than
 * three quarters of a second of real time past the last report", whatever the rate is.
 */
export const STAGE_CLOCK_MAX_EXTRAPOLATION_SEC = 0.75;

const isFiniteNumber = (value: unknown): value is number => (
    typeof value === 'number' && Number.isFinite(value)
);

const resolveDuration = (durationSec: number | undefined): number => (
    isFiniteNumber(durationSec) && durationSec > 0 ? durationSec : 0
);

const resolveRate = (playbackRate: number | undefined): number => (
    isFiniteNumber(playbackRate) && playbackRate > 0 ? playbackRate : 1
);

export interface StageClock {
    /**
     * Hands the clock the newest position the host has. Call it on every host render: it is a
     * handful of comparisons, and it re-anchors only when something actually moved.
     */
    update(sample: StageClockSample, nowMs: number): void;
    /** The position to publish this frame, in seconds. Call it once per animation frame. */
    read(nowMs: number): number;
    /** The last sample the clock was given, for diagnostics. */
    readonly anchor: { timeSec: number; anchoredAtMs: number; playing: boolean };
}

/**
 * A per-frame clock built on top of a coarse one.
 *
 * Re-anchoring deliberately compares the reported POSITION rather than the identity of the sample
 * object: between two `timeupdate` events the host re-renders (the store notifies on every write,
 * and the player re-renders for many other reasons) while the position it reports is unchanged.
 * Re-anchoring on those renders would restart the extrapolation every time and put the staircase
 * straight back.
 *
 * A fresh anchor can land a few milliseconds BEHIND the extrapolated value, because a media
 * element's own clock does not advance at exactly wall-clock speed. That snap is bounded by one
 * extrapolation interval and is not visible next to the 250 ms freeze it replaces; smoothing it
 * away would mean publishing a position the audio does not actually have.
 */
export const createStageClock = (): StageClock => {
    let timeSec = 0;
    let anchoredAtMs = 0;
    let playing = false;
    let durationSec = 0;
    let playbackRate = 1;
    let anchored = false;

    return {
        update(sample, nowMs) {
            const nextTime = isFiniteNumber(sample.timeSec) && sample.timeSec > 0 ? sample.timeSec : 0;
            const nextPlaying = Boolean(sample.playing);
            durationSec = resolveDuration(sample.durationSec);
            playbackRate = resolveRate(sample.playbackRate);

            const moved = !anchored || nextTime !== timeSec || nextPlaying !== playing;
            timeSec = nextTime;
            playing = nextPlaying;
            if (moved) {
                anchoredAtMs = nowMs;
                anchored = true;
            }
        },

        read(nowMs) {
            // A paused stage shows one held picture: extrapolating here would make the frame drift
            // while the audio is stopped, and the runtimes only re-render on demand when paused.
            if (!playing) return timeSec;
            const elapsedSec = Math.min(
                Math.max(0, (nowMs - anchoredAtMs) / 1000),
                STAGE_CLOCK_MAX_EXTRAPOLATION_SEC,
            );
            const advanced = timeSec + elapsedSec * playbackRate;
            const clamped = durationSec > 0 ? Math.min(durationSec, advanced) : advanced;
            return clamped < 0 ? 0 : clamped;
        },

        get anchor() {
            return { timeSec, anchoredAtMs, playing };
        },
    };
};
