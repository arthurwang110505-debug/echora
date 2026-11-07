// src/original-folia-visualizers/sonnet/songHandover.ts
//
// Upstream Folia swaps songs with a dissolve instead of a cut: this holds the outgoing picture for
// `SONNET_SONG_SWAP_MS` while the incoming program builds, so a track change reads as a crossfade
// rather than a blank frame followed by a new picture.
//
// The curve now lives in `src/playback/songCrossfade.ts`, because the YouTube player needs the same
// dissolve and must not import a visualizer module to get it. This file keeps Sonnet's name for it
// so the runtime, the docs and upstream's vocabulary all still line up; there is exactly one
// implementation.

export {
  SONG_CROSSFADE_MS as SONNET_SONG_SWAP_MS,
  resolveSongCrossfadeFrame,
} from '../../playback/songCrossfade';

export type { SongCrossfadeFrame as SonnetHandoverFrame } from '../../playback/songCrossfade';

/**
 * Resolves the dissolve at `elapsedMs` into the swap.
 *
 * Kept as a named export because the runtime and its tests were written against
 * `resolveSonnetHandoverFrame`; it is the shared curve, unchanged.
 */
export { resolveSongCrossfadeFrame as resolveSonnetHandoverFrame } from '../../playback/songCrossfade';
