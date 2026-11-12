// src/playback/stageFallback.ts
//
// Which stage the player mounts when the song has no lyrics.
//
// Without lyrics the scene directors have nothing to animate, so the player swaps the whole stage
// for the soundscape (cover art, particles, waveform). That swap is a *replacement*, not an
// overlay: the selected visualizer never mounts, so a mode that could still say something useful
// is silently dropped.
//
// 靈動詞島 is exactly that case. It is a readout rather than a scene, and with no lyrics it draws a
// card explaining why. Picking Island on a lyric-less song used to show the soundscape instead,
// which reads as "the mode does not work" - the opposite of the truth.
//
// Kept out of Player.tsx as a pure function so the rule can be tested without mounting a page that
// owns a YouTube player, an audio element and a websocket-free OBS publisher.

export interface StageFallbackInput {
  isLoadingLyrics: boolean;
  /** Number of resolved lyric lines. Zero means the song has no lyrics. */
  lineCount: number;
  visualizerMode: string;
}

/** Visualizer modes that still carry meaning without lyrics, and so are exempt from the swap. */
const LYRICLESS_EXEMPT_MODES: ReadonlySet<string> = new Set(['island']);

/**
 * Whether the player should replace the visualizer stage with the soundscape.
 *
 * True only when the lyrics have finished loading, the song has none, and the selected mode has
 * nothing to say on its own.
 */
export const shouldShowLyriclessSoundscape = ({
  isLoadingLyrics,
  lineCount,
  visualizerMode,
}: StageFallbackInput): boolean => {
  if (isLoadingLyrics) return false;
  if (lineCount > 0) return false;
  return !LYRICLESS_EXEMPT_MODES.has(visualizerMode);
};
