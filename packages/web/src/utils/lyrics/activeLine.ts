import type { Line } from '@echora/core';

export const LYRICS_OFFSET_MIN_SECONDS = -10;
export const LYRICS_OFFSET_MAX_SECONDS = 10;
export const LYRICS_OFFSET_STEP_SECONDS = 0.25;

export const clampLyricsOffset = (offsetSeconds: number): number => {
  if (!Number.isFinite(offsetSeconds)) return 0;
  return Math.max(
    LYRICS_OFFSET_MIN_SECONDS,
    Math.min(LYRICS_OFFSET_MAX_SECONDS, Number(offsetSeconds.toFixed(2)))
  );
};

export const adjustLyricsOffset = (offsetSeconds: number, deltaSeconds: number): number =>
  clampLyricsOffset(offsetSeconds + deltaSeconds);

/**
 * The offset that puts `lineStartSeconds` under the playhead right now.
 *
 * Dragging a slider is guesswork ("a bit earlier, a bit later"); pointing at the line that *should*
 * be highlighted says the answer outright. Used by the "tap a lyric to re-sync" gesture, which is
 * the only part of the offset controls that reads as a correction rather than a preference.
 */
export const offsetForLineStart = (lineStartSeconds: number, playbackSeconds: number): number => {
  if (!Number.isFinite(lineStartSeconds) || !Number.isFinite(playbackSeconds)) return 0;
  return clampLyricsOffset(lineStartSeconds - playbackSeconds);
};

/**
 * The line whose start is the latest one at or before `effectiveTime`.
 *
 * This is a scan from the end rather than a scan from the start: playback moves forward, so the
 * answer is almost always the last line, and a `findIndex` from the top walks half the song to
 * get there every single call. Upstream uses the same shape (findLatestActiveLineIndex).
 *
 * Lines are not guaranteed to be sorted by every provider, so the loop cannot be a binary search
 * over the array as given; it stops at the first line that starts early enough and then takes the
 * last of any run that starts at the same instant.
 */
const latestLineStartingAtOrBefore = (lines: Line[], effectiveTime: number): number => {
  let best = -1;
  let bestStart = -Infinity;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const start = lines[index]?.startTime;
    if (!Number.isFinite(start)) continue;
    const startSeconds = start / 1000;
    if (startSeconds > effectiveTime) continue;
    // First candidate wins unless an earlier line in the array starts later.
    if (startSeconds > bestStart) {
      best = index;
      bestStart = startSeconds;
    }
    // Nothing before this point can start later than a line that already explains the time, and
    // in the common (sorted) case the very first hit is the answer.
    if (bestStart === effectiveTime) break;
  }
  return best;
};

export const getActiveLyricIndex = ({
  lines,
  currentTimeSeconds,
  offsetSeconds,
}: {
  lines: Line[];
  currentTimeSeconds: number;
  /** Unused: the answer no longer depends on where the song ends. Kept for callers. */
  durationSeconds?: number;
  offsetSeconds?: number;
}): number => {
  if (!lines.length || !Number.isFinite(currentTimeSeconds)) return 0;

  const effectiveTime = Math.max(0, currentTimeSeconds + clampLyricsOffset(offsetSeconds ?? 0));
  const index = latestLineStartingAtOrBefore(lines, effectiveTime);

  // Before the first line starts (an intro, or a negative offset): stay on the first line, which is
  // what the previous start-scanning implementation reported for `time < lines[0].startTime`.
  if (index === -1) return 0;

  // Deliberately no "has this line's window closed?" check. The window only decides whether a
  // *later* line has started, and the scan above already answered that: the index this returns is
  // the last line that has begun, so it holds through the gap after the last lyric, a coda, or a
  // paused seek past the final line. The old implementation had to synthesise an end (`duration`,
  // or start + 5 s) because it searched forward for a window containing the time, and its miss
  // branch returned 0 - which threw the end of every song back to its first line.
  return index;
};
