// src/original-folia-visualizers/island/islandModel.ts
//
// The logic behind the Dynamic Lyrics Island, kept out of the component so it can be tested
// without a DOM: given a wall-clock time and a lyric timeline, what should the island show?
//
// The island answers one question that no existing mode answers: "what am I singing right now?"
// without taking over the screen. Every other visualizer is a stage - full-bleed, built to be
// looked at. This one is a readout, meant to sit in a corner while the user does something else, so
// the design constraint is inverted: the interesting information must survive being small.

// The island is used by two callers that do not share a `Line` type: the visualizer stage
// (packages/core's Line) and the player overlay (packages/web's Line). Rather than converting
// between them for a readout that needs five fields, the island declares the five it reads. Both
// types satisfy this structurally, which is the actual contract.
export interface IslandWord {
  text: string;
  startTime: number;
  endTime: number;
}

export interface IslandLine {
  startTime: number;
  endTime: number;
  fullText: string;
  translation?: string;
  words: IslandWord[];
}

/**
 * The fraction of the current line that has elapsed, 0..1.
 *
 * A line with no duration (a one-shot annotation, or a zero-length instrumental marker) has no
 * meaningful progress; it reads as 0 rather than dividing by zero.
 */
export const lineProgress = (line: IslandLine | null | undefined, timeSeconds: number): number => {
  if (!line) return 0;
  const span = line.endTime - line.startTime;
  if (!Number.isFinite(span) || span <= 0) return 0;
  const elapsed = timeSeconds - line.startTime;
  if (elapsed <= 0) return 0;
  if (elapsed >= span) return 1;
  return elapsed / span;
};

/** How far through a word we are, for the per-syllable wipe. Same zero-duration rule. */
export const wordProgress = (startSeconds: number, endSeconds: number, timeSeconds: number): number => {
  const span = endSeconds - startSeconds;
  if (!Number.isFinite(span) || span <= 0) return timeSeconds >= endSeconds ? 1 : 0;
  if (timeSeconds <= startSeconds) return 0;
  if (timeSeconds >= endSeconds) return 1;
  return (timeSeconds - startSeconds) / span;
};

/**
 * Which words of the line have started, and how far into each we are.
 *
 * The island draws each word as two stacked copies - a dim one and a lit one - and reveals the lit
 * copy with a clip. That is what makes it read as karaoke rather than as a progress bar, and it
 * needs no animation library: the fraction is recomputed from the clock each frame.
 */
export const wordFill = (line: IslandLine | null | undefined, timeSeconds: number): number[] => {
  if (!line || line.words.length === 0) return [];
  return line.words.map(word => wordProgress(word.startTime, word.endTime, timeSeconds));
};

/**
 * The line to display, resolved so the island can never show a stale or future line.
 *
 * `currentLineIndex` is the authoritative answer while playback is inside a line, but it lags at
 * the boundaries (it is computed against the offset lyric clock, the island against the same one),
 * and it is `-1` before the first line. Falling back to a scan makes the boundary behaviour a
 * property of this function instead of something the caller has to remember.
 */
export const resolveIslandLine = (
  lines: IslandLine[],
  currentLineIndex: number,
  timeSeconds: number,
): IslandLine | null => {
  if (lines.length === 0) return null;
  const indexed = lines[currentLineIndex];
  if (indexed) return indexed;

  // Nothing indexed: either before the first line, or in a gap between lines. A gap should keep
  // showing the line that just finished (that is what a listener expects to still be reading); a
  // position before the first line shows nothing.
  if (!Number.isFinite(timeSeconds)) return null;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].startTime <= timeSeconds) return lines[i];
  }
  return null;
};

/**
 * Whether the island should be showing at all.
 *
 * A lyric island whose song has no lyrics is just an empty rounded rectangle, which is worse than
 * nothing: it looks broken. The caller hides it instead.
 */
export const shouldShowIsland = (lines: IslandLine[], hasSong: boolean): boolean =>
  hasSong && lines.length > 0;

/** Clamped 0..1, for the ring that fills with the line. */
export const clampUnit = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
};
