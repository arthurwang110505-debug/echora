// src/playback/youtubeCrossfade.ts
//
// The volume half of a song change on an audio source we do not own the samples of.
//
// A local file could be crossfaded in Web Audio by mixing two decoded buffers.
// YouTube gives us one iframe with one `setVolume`, so the honest equivalent is a
// short dissolve: ramp the outgoing track down over the first half, load the
// incoming one, and ramp it up over the second half. The user still hears a fade
// on both sides, which is what a crossfade sounds like; nothing pretends two
// tracks are audible at once.
//
// The shape of the ramp is the same shared curve Sonnet draws with
// (`playback/songCrossfade.ts`), so a track change sounds like the stage looks.

import { SONG_CROSSFADE_MS, resolveSongCrossfadeFrame } from './songCrossfade';

/** How long the outgoing track takes to fall silent before the load. */
export const YOUTUBE_FADE_OUT_MS = Math.round(SONG_CROSSFADE_MS / 2);

/** How long the incoming track takes to reach the user's level after the load. */
export const YOUTUBE_FADE_IN_MS = Math.round(SONG_CROSSFADE_MS / 2);

/** How often the ramp updates the iframe volume. ~30 Hz is smooth and cheap. */
export const YOUTUBE_FADE_STEP_MS = 32;

/**
 * Volume multiplier for an outgoing track `elapsedMs` into the fade.
 *
 * Returns 1 at t=0 and 0 when the fade is over, so the caller can hand the result
 * straight to `setVolume(Math.round(audibleGain * multiplier * 100))`. A fade that
 * has not started is still fully audible, which matters because the first frame of
 * a fade runs before any audio has moved.
 */
export const resolveYouTubeFadeOutGain = (
  elapsedMs: number,
  durationMs: number = YOUTUBE_FADE_OUT_MS,
): number => {
  if (elapsedMs <= 0) return 1;
  // `Infinity` reaches the curve, which resolves it as "finished" - correct for a
  // fade-out (silent). `NaN` cannot be placed on the curve at all; silence is the
  // safe reading because the alternative is a track stuck at full volume.
  if (Number.isNaN(elapsedMs)) return 0;
  // The shared curve already describes this exact direction: `outgoingAlpha` is 1
  // at t=0 and 0 when the dissolve finishes, which is a fade-out. Reading
  // `incomingAlpha` here would start silent and end at full - a fade-in.
  return resolveSongCrossfadeFrame(elapsedMs, durationMs).outgoingAlpha;
};

/**
 * Volume multiplier for the incoming track `elapsedMs` into the fade.
 *
 * Returns 0 at the start and 1 once the fade is over. `elapsedMs <= 0` returns 0
 * rather than 1: before the fade begins the new track must be silent, otherwise
 * the first `loadVideoById` frame plays at full volume.
 */
export const resolveYouTubeFadeInGain = (
  elapsedMs: number,
  durationMs: number = YOUTUBE_FADE_IN_MS,
): number => {
  if (!Number.isFinite(elapsedMs)) return 1;
  if (elapsedMs <= 0) return 0;
  return resolveSongCrossfadeFrame(elapsedMs, durationMs).incomingAlpha;
};

/**
 * Whether a song change is a track change or the same track re-selected.
 *
 * Re-selecting the playing song must not fade anything: the user asked to restart
 * a track, not to swap one. Identity is the video id, because a YouTube `Song.id`
 * can be a watch URL while `audioUrl` holds the bare id.
 */
export const isYouTubeTrackChange = (
  previousVideoId: string | null | undefined,
  nextVideoId: string | null | undefined,
): boolean => Boolean(nextVideoId) && previousVideoId !== nextVideoId;

// --- queue advance on track end ---------------------------------------------

export type YouTubeEndAction = 'restart' | 'next';

/**
 * What a finished track should do next.
 *
 * This mirrors `tickTime` in `playerStore`, which is the app's single definition of
 * "a track reached its end": single loop restarts the current track, every other
 * mode advances. Keeping it here as a value means the iframe callback and the local
 * audio `ended` handler cannot drift apart in meaning, and the branch is testable
 * without mounting a player.
 */
export const resolveYouTubeEndAction = (loopMode: 'off' | 'list' | 'single'): YouTubeEndAction => (
  loopMode === 'single' ? 'restart' : 'next'
);
