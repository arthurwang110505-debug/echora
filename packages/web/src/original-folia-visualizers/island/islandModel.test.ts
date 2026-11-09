// src/original-folia-visualizers/island/islandModel.test.ts
import { describe, expect, it } from 'vitest';
import type { Line } from '../../types';
import {
  clampUnit,
  lineProgress,
  resolveIslandLine,
  shouldShowIsland,
  wordFill,
  wordProgress,
} from './islandModel';

const line = (startTime: number, endTime: number, fullText = 'x', words: Line['words'] = []): Line => ({
  startTime,
  endTime,
  fullText,
  words,
});

describe('lineProgress', () => {
  it('is 0 before the line and 1 after it', () => {
    expect(lineProgress(line(10, 14), 9)).toBe(0);
    expect(lineProgress(line(10, 14), 15)).toBe(1);
  });

  it('reports the fraction elapsed inside the line', () => {
    expect(lineProgress(line(10, 14), 11)).toBeCloseTo(0.25);
    expect(lineProgress(line(10, 14), 13)).toBeCloseTo(0.75);
  });

  it('declines to divide by a zero-length line', () => {
    expect(lineProgress(line(10, 10), 10)).toBe(0);
    expect(lineProgress(null, 10)).toBe(0);
  });
});

describe('wordProgress', () => {
  it('clamps outside the word', () => {
    expect(wordProgress(5, 6, 4)).toBe(0);
    expect(wordProgress(5, 6, 7)).toBe(1);
    expect(wordProgress(5, 6, 5.5)).toBeCloseTo(0.5);
  });

  it('treats a zero-length word as either not started or done', () => {
    expect(wordProgress(5, 5, 4.9)).toBe(0);
    expect(wordProgress(5, 5, 5)).toBe(1);
  });
});

describe('wordFill', () => {
  it('returns one fraction per word', () => {
    const target = line(0, 4, 'ab', [
      { text: 'a', startTime: 0, endTime: 2 },
      { text: 'b', startTime: 2, endTime: 4 },
    ]);
    expect(wordFill(target, 1)).toEqual([0.5, 0]);
    expect(wordFill(target, 3)).toEqual([1, 0.5]);
  });

  it('is empty when the line carries no words', () => {
    expect(wordFill(line(0, 4), 1)).toEqual([]);
    expect(wordFill(null, 1)).toEqual([]);
  });
});

describe('resolveIslandLine', () => {
  const lines = [line(0, 3), line(3, 6), line(6, 9)];

  it('trusts the indexed line when there is one', () => {
    expect(resolveIslandLine(lines, 1, 4)).toBe(lines[1]);
  });

  it('keeps the last line that started during a gap', () => {
    // Index -1 between lyric blocks: the finished line should stay readable.
    expect(resolveIslandLine(lines, -1, 7)).toBe(lines[2]);
  });

  it('shows nothing before the first line', () => {
    expect(resolveIslandLine([line(10, 12)], -1, 3)).toBeNull();
  });

  it('shows nothing without lines', () => {
    expect(resolveIslandLine([], 0, 3)).toBeNull();
  });
});

describe('shouldShowIsland', () => {
  it('hides an empty or lyric-less song rather than showing a blank pill', () => {
    expect(shouldShowIsland([line(0, 1)], true)).toBe(true);
    expect(shouldShowIsland([], true)).toBe(false);
    expect(shouldShowIsland([line(0, 1)], false)).toBe(false);
  });
});

describe('clampUnit', () => {
  it('bounds non-finite and out-of-range input', () => {
    expect(clampUnit(Number.NaN)).toBe(0);
    expect(clampUnit(-2)).toBe(0);
    expect(clampUnit(3)).toBe(1);
    expect(clampUnit(0.4)).toBe(0.4);
  });
});
