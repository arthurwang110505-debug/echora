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

export const getActiveLyricIndex = ({
  lines,
  currentTimeSeconds,
  durationSeconds,
  offsetSeconds,
}: {
  lines: Line[];
  currentTimeSeconds: number;
  durationSeconds?: number;
  offsetSeconds?: number;
}): number => {
  if (!lines.length || !Number.isFinite(currentTimeSeconds)) return 0;

  const effectiveTime = Math.max(0, currentTimeSeconds + clampLyricsOffset(offsetSeconds ?? 0));
  const index = lines.findIndex((line, lineIndex) => {
    const nextLine = lines[lineIndex + 1];
    const lineStart = line.startTime / 1000;
    const nextStart = nextLine
      ? nextLine.startTime / 1000
      : (durationSeconds || lineStart + 5);
    return effectiveTime >= lineStart && effectiveTime < nextStart;
  });

  return index === -1 ? 0 : index;
};
