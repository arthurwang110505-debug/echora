// src/playback/extrapolatedClock.ts
//
// A continuous clock for playback sources that can only be *sampled*.
//
// Why this exists: `playbackClock.ts` answers 60 times a second for local playback, because it
// reads `<audio>.currentTime` - a number the browser keeps continuously up to date for its own
// rendering. A remote player has no such surface. YouTube's IFrame Player hands back a position
// that is itself only refreshed on its internal schedule (observably ~250 ms), and we *ask* for it
// on a timer anyway. Feeding that straight to the stage means the visualizer draws at 60 fps from a
// clock that steps a handful of times a second, so every per-glyph animation advances in visible
// jumps. That is the same class of bug playbackClock.ts was written to fix for local audio; it just
// has no equivalent for anything remote.
//
// The fix is to treat each reading as a *measurement* and interpolate between them with a
// monotonic wall clock:
//
//   displayed = measuredPosition + (now - measuredAt) / 1000 + transient
//
// `transient` is the interesting part. Taking the newest measurement as the truth is right, but
// swapping the anchor on every sample makes the displayed value jump by however far the prediction
// had drifted, several times a second - which reads as jitter, the very thing being fixed. So when a
// sample disagrees with the prediction, the disagreement is parked in `transient` and released over
// a short window: the display is continuous across the sample, and it converges on the measurement
// without ever moving backwards.
//
// A large disagreement is not drift. It is a seek, a stall or a new track; easing a two-second
// correction over 450 ms would show the wrong lyric line for half a second, so those rebase
// outright.
//
// The module owns no state React can see and nothing subscribes to it: the stage's existing
// requestAnimationFrame loop asks for a reading each frame. The ~10 Hz store writes everything else
// uses (progress text, Media Session, the playback snapshot) are untouched.

/**
 * The largest disagreement treated as drift. Anything bigger is a seek or a stall and rebases.
 * Comfortably above the drift a healthy source shows (tens of milliseconds) and comfortably below
 * the smallest jump a listener would call "skipping somewhere else".
 */
const REBASE_THRESHOLD_SECONDS = 0.75;

/** How long a drift correction takes to release, in seconds. */
const CORRECTION_WINDOW_SECONDS = 0.45;

/**
 * The longest gap the clock will extrapolate through. Beyond this the display holds near the last
 * real measurement instead of free-running.
 *
 * Sized against the real sampling cadence rather than the nominal one: the loop asks every 50 ms,
 * but a backgrounded tab, a busy main thread or a deprioritised callback routinely stretches that to
 * several hundred milliseconds. A ceiling near the sampling interval would clip ordinary playback
 * and turn the smooth clock back into the stepped one it replaced. Only a genuine stall should reach
 * it, and a stall is measured in seconds.
 */
const MAX_RUN_AHEAD_SECONDS = 3;

type Sample = {
  /** Playback position the source reported, in seconds. */
  position: number;
  /** `performance.now()` when the reading was taken. */
  measuredAt: number;
};

let sample: Sample | null = null;
/** Where the transient started when the current correction began. */
let transientFrom = 0;
/** The transient's current value and the value it is easing toward. */
let transient = 0;
let correctionStartedAt = 0;
let rate = 1;

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

const transientAt = (at: number): number => {
  if (correctionStartedAt === 0) return transient;
  const progress = Math.min(1, (at - correctionStartedAt) / 1000 / CORRECTION_WINDOW_SECONDS);
  transient = transientFrom * (1 - progress);
  if (progress >= 1) correctionStartedAt = 0;
  return transient;
};

const rawAt = (at: number): number => {
  const elapsed = (at - sample!.measuredAt) / 1000;
  const ceiling = sample!.position + Math.min(elapsed, MAX_RUN_AHEAD_SECONDS) * rate;
  return Math.min(sample!.position + elapsed * rate, ceiling);
};

const rebase = (position: number, at: number): void => {
  sample = { position: Number.isFinite(position) && position > 0 ? position : 0, measuredAt: at };
  transient = 0;
  transientFrom = 0;
  correctionStartedAt = 0;
};

/**
 * Records a fresh position from the source.
 *
 * `position` is the source's own reading. Callers that poll should pass the value they just
 * received rather than a cached one, so the timestamp and the value describe the same instant.
 */
export const sampleExtrapolatedClock = (position: number, options: { reset?: boolean } = {}): void => {
  if (!Number.isFinite(position) || position < 0) return;
  const at = now();

  if (options.reset || sample === null) {
    rebase(position, at);
    return;
  }

  const predicted = rawAt(at) + transientAt(at);
  const error = position - predicted;
  if (Math.abs(error) > REBASE_THRESHOLD_SECONDS) {
    rebase(position, at);
    return;
  }

  // Adopt the measurement as the new anchor, and park the size of the jump we just avoided as a
  // transient so the displayed value does not move at this instant: the raw term shifts by `error`
  // and the transient starts life at `-error`, cancelling it exactly here and releasing it after.
  rebase(position, at);
  if (Math.abs(error) > 0.0005) {
    transientFrom = -error;
    transient = -error;
    correctionStartedAt = at;
  }
};

export const resetExtrapolatedClock = (position = 0): void => {
  rebase(position, now());
};

/** Drops the sample without starting a new one; the next `sampleExtrapolatedClock` rebases. */
export const clearExtrapolatedClock = (): void => {
  sample = null;
  transient = 0;
  transientFrom = 0;
  correctionStartedAt = 0;
};

/**
 * The playback rate the source is running at. 1 is normal; a paused source is handled by
 * `clearExtrapolatedClock`, not by rate 0, because a frozen clock still has to answer.
 */
export const setExtrapolatedClockRate = (nextRate: number): void => {
  if (!sample) {
    rate = Number.isFinite(nextRate) && nextRate > 0 ? nextRate : 1;
    return;
  }
  // Re-anchor at the current displayed position before switching rates, otherwise the time already
  // elapsed since the last sample gets re-scaled by the new rate and the clock lurches.
  const at = now();
  const displayed = Math.max(0, rawAt(at) + transientAt(at));
  rebase(displayed, at);
  rate = Number.isFinite(nextRate) && nextRate > 0 ? nextRate : 1;
};

/**
 * The position to draw with, or null when nothing has been sampled yet ("no opinion this frame",
 * the same contract `getPlaybackClockReading` uses).
 */
export const readExtrapolatedClock = (): number | null => {
  if (!sample) return null;
  const at = now();
  const value = rawAt(at) + transientAt(at);
  return value >= 0 ? value : 0;
};

/** Test seam: the module holds process-wide state, like `playbackClock`. */
export const __resetExtrapolatedClockForTests = (): void => {
  clearExtrapolatedClock();
  rate = 1;
};
