// src/playback/songCrossfade.ts
//
// The dissolve curve shared by every surface that swaps one piece of audio or
// picture for another.
//
// Upstream Folia changes songs with a dissolve rather than a cut: the outgoing
// picture is held while the incoming program builds, so a track change reads as
// a crossfade instead of a blank frame followed by a new picture. Sonnet's
// runtime has done this since `sonnet/songHandover.ts`; this module is that same
// curve, lifted out so the YouTube player can use it too without importing a
// visualizer module into the player bundle.
//
// The curve stays a pure function on purpose: the shape is testable without a
// WebGL context or an iframe, and the two callers that own the containers only
// ask this module where the dissolve is at a given time.

/**
 * Duration of an outgoing/incoming dissolve on a song change.
 *
 * Matches upstream's `SONNET_SONG_SWAP_MS`. Short enough that a skip still feels
 * immediate, long enough to cover the frame where a new source has not produced
 * audio yet.
 */
export const SONG_CROSSFADE_MS = 560;

export interface SongCrossfadeFrame {
  /** Gain for the material being replaced. */
  outgoingAlpha: number;
  /** Gain for the material being introduced. */
  incomingAlpha: number;
  /** True once the dissolve has finished and the outgoing material can be torn down. */
  done: boolean;
}

const DONE: SongCrossfadeFrame = { outgoingAlpha: 0, incomingAlpha: 1, done: true };

/**
 * Resolves the dissolve at `elapsedMs` into the swap.
 *
 * The two alphas share one eased curve, so they always sum to 1: the frame never
 * dips darker or quieter than either side on its own, which is what a naive pair
 * of independent fades gets wrong.
 *
 * Unusable input resolves to "finished" rather than to a partial state, so a bad
 * clock can only cut the dissolve short, never freeze the outgoing material over
 * the new one.
 */
export const resolveSongCrossfadeFrame = (
  elapsedMs: number,
  durationMs: number = SONG_CROSSFADE_MS,
): SongCrossfadeFrame => {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return DONE;
  if (!Number.isFinite(elapsedMs)) return DONE;
  if (elapsedMs <= 0) return { outgoingAlpha: 1, incomingAlpha: 0, done: false };
  if (elapsedMs >= durationMs) return DONE;

  const t = elapsedMs / durationMs;
  // Smoothstep: zero slope at both ends, so the dissolve does not visibly start or stop.
  const eased = t * t * (3 - 2 * t);
  return { outgoingAlpha: 1 - eased, incomingAlpha: eased, done: false };
};

/**
 * Gain to apply to the *incoming* source at `elapsedMs`, as a multiplier of the
 * user's own volume.
 *
 * A dissolved volume ramp is only honest if it ends exactly on the level the
 * user set: multiplying at the end would leave the player stuck at whatever the
 * last frame computed, so the caller hands this the audible gain each time and
 * the curve returns to 1.0 when it is done.
 */
export const resolveCrossfadeGain = (elapsedMs: number, durationMs: number = SONG_CROSSFADE_MS): number => (
  resolveSongCrossfadeFrame(elapsedMs, durationMs).incomingAlpha
);
