import { describe, expect, it } from 'vitest';
import type { Line } from '@echora/core';
import {
  adjustLyricsOffset,
  clampLyricsOffset,
  getActiveLyricIndex,
  offsetForLineStart,
  LYRICS_OFFSET_MAX_SECONDS,
} from './activeLine';

const lines = [
  { startTime: 1000, endTime: 3000, fullText: '第一句', words: [] },
  { startTime: 3000, endTime: 5000, fullText: '第二句', words: [] },
] as Line[];

const longSong = Array.from({ length: 120 }, (_, index) => ({
  startTime: index * 2000,
  endTime: index * 2000 + 1800,
  fullText: `line ${index}`,
  words: [],
})) as Line[];

describe('lyrics timing offset', () => {
  it('moves the active lyric line in the expected direction', () => {
    expect(getActiveLyricIndex({ lines, currentTimeSeconds: 2.9 })).toBe(0);
    expect(getActiveLyricIndex({ lines, currentTimeSeconds: 2.9, offsetSeconds: 0.25 })).toBe(1);
    expect(getActiveLyricIndex({ lines, currentTimeSeconds: 3.1, offsetSeconds: -0.25 })).toBe(0);
  });

  it('clamps invalid and out-of-range adjustments', () => {
    expect(clampLyricsOffset(Number.NaN)).toBe(0);
    expect(adjustLyricsOffset(9.875, 0.25)).toBe(10);
    expect(adjustLyricsOffset(-9.875, -0.25)).toBe(-10);
  });
});

describe('getActiveLyricIndex holds the line that has begun', () => {
  it('reports the first line during an intro, before any line starts', () => {
    expect(getActiveLyricIndex({ lines, currentTimeSeconds: 0 })).toBe(0);
    expect(getActiveLyricIndex({ lines, currentTimeSeconds: 0.999 })).toBe(0);
  });

  it('advances exactly on the boundary', () => {
    expect(getActiveLyricIndex({ lines, currentTimeSeconds: 2.999 })).toBe(0);
    expect(getActiveLyricIndex({ lines, currentTimeSeconds: 3 })).toBe(1);
  });

  // The old implementation searched forward for a window containing the time and returned 0 when
  // it found none, so the gap after the last line - and any paused seek past it - jumped back to
  // the first lyric of the song. Holding the last started line is what the stage should show.
  it('holds the last line through the gap after it, and does not rewind to line 0', () => {
    expect(getActiveLyricIndex({ lines, currentTimeSeconds: 5.5 })).toBe(1);
    expect(getActiveLyricIndex({ lines, currentTimeSeconds: 60 })).toBe(1);
    expect(getActiveLyricIndex({ lines, currentTimeSeconds: 60, durationSeconds: 61 })).toBe(1);
  });

  it('holds the tail when a paused seek lands inside it', () => {
    expect(getActiveLyricIndex({ lines, currentTimeSeconds: 4.9 })).toBe(1);
    expect(getActiveLyricIndex({ lines, currentTimeSeconds: 5 })).toBe(1);
  });

  it('picks the latest start on the last line of a long song', () => {
    expect(getActiveLyricIndex({ lines: longSong, currentTimeSeconds: 100 })).toBe(50);
    expect(getActiveLyricIndex({ lines: longSong, currentTimeSeconds: 239.9 })).toBe(119);
  });

  it('is not confused by a line repeated word for word', () => {
    const repeated = [
      { startTime: 0, endTime: 1000, fullText: '同じ', words: [] },
      { startTime: 1000, endTime: 2000, fullText: '同じ', words: [] },
      { startTime: 2000, endTime: 3000, fullText: '同じ', words: [] },
    ] as Line[];
    expect(getActiveLyricIndex({ lines: repeated, currentTimeSeconds: 0.5 })).toBe(0);
    expect(getActiveLyricIndex({ lines: repeated, currentTimeSeconds: 1.5 })).toBe(1);
    expect(getActiveLyricIndex({ lines: repeated, currentTimeSeconds: 2.5 })).toBe(2);
  });

  it('survives an unsorted array by taking the latest start, not the first match', () => {
    const unsorted = [
      { startTime: 5000, endTime: 6000, fullText: 'late', words: [] },
      { startTime: 1000, endTime: 2000, fullText: 'early', words: [] },
      { startTime: 3000, endTime: 4000, fullText: 'middle', words: [] },
    ] as Line[];
    expect(getActiveLyricIndex({ lines: unsorted, currentTimeSeconds: 4 })).toBe(2);
  });

  it('ignores lines with a missing or non-finite start time', () => {
    const broken = [
      { startTime: 0, endTime: 1000, fullText: 'ok', words: [] },
      { startTime: Number.NaN, endTime: 3000, fullText: 'nan', words: [] },
      { startTime: 2000, endTime: 3000, fullText: 'ok 2', words: [] },
    ] as Line[];
    expect(getActiveLyricIndex({ lines: broken, currentTimeSeconds: 2.5 })).toBe(2);
  });

  it('falls back to 0 for an empty list or a non-finite time', () => {
    expect(getActiveLyricIndex({ lines: [], currentTimeSeconds: 12 })).toBe(0);
    expect(getActiveLyricIndex({ lines, currentTimeSeconds: Number.NaN })).toBe(0);
  });

  describe('offsetForLineStart', () => {
    it('puts the clicked line under the playhead', () => {
      // Line starts at 12 s, we are 3 s into the song: the timeline must move 9 s earlier.
      expect(offsetForLineStart(12, 3)).toBeCloseTo(9);
      // And the other way when the line is behind the playhead.
      expect(offsetForLineStart(4, 12)).toBeCloseTo(-8);
      // A correction larger than the limit is clamped, not accepted: ±10 s is where the controls
      // stop, and a gesture must not be able to exceed what the panel can undo.
      expect(offsetForLineStart(4, 19)).toBeCloseTo(-10);
    });

    it('is zero when the line is already in sync', () => {
      expect(offsetForLineStart(8.5, 8.5)).toBe(0);
    });

    it('respects the same limit the arrows and the slider use', () => {
      expect(offsetForLineStart(900, 0)).toBe(LYRICS_OFFSET_MAX_SECONDS);
      expect(offsetForLineStart(0, 900)).toBe(-LYRICS_OFFSET_MAX_SECONDS);
    });

    it('declines to guess from a missing reading', () => {
      expect(offsetForLineStart(Number.NaN, 4)).toBe(0);
      expect(offsetForLineStart(4, Number.NaN)).toBe(0);
    });
  });
});
