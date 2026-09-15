import { describe, expect, it } from 'vitest';
import type { Line } from '@echora/core';
import {
  adjustLyricsOffset,
  clampLyricsOffset,
  getActiveLyricIndex,
} from './activeLine';

const lines = [
  { startTime: 1000, endTime: 3000, fullText: '第一句', words: [] },
  { startTime: 3000, endTime: 5000, fullText: '第二句', words: [] },
] as Line[];

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
