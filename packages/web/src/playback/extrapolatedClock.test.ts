// src/playback/extrapolatedClock.test.ts
//
// A remote player can only be *sampled*, and its own position is coarse. What the stage needs is a
// number that moves every frame, stays honest about where the audio actually is, and never jumps.
// Those three are what these specs pin down.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetExtrapolatedClockForTests,
  clearExtrapolatedClock,
  readExtrapolatedClock,
  sampleExtrapolatedClock,
  setExtrapolatedClockRate,
} from './extrapolatedClock';

let clock = 0;
const advance = (ms: number) => { clock += ms; };

beforeEach(() => {
  clock = 1000;
  vi.stubGlobal('performance', { now: () => clock });
  __resetExtrapolatedClockForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  __resetExtrapolatedClockForTests();
});

describe('extrapolated clock', () => {
  it('has no opinion before the first sample', () => {
    expect(readExtrapolatedClock()).toBeNull();
  });

  it('advances smoothly between samples instead of holding a stepped value', () => {
    sampleExtrapolatedClock(10, { reset: true });

    // The source will not report again for 100 ms; in between the display still has to move.
    advance(16);
    const a = readExtrapolatedClock()!;
    advance(16);
    const b = readExtrapolatedClock()!;

    expect(a).toBeGreaterThan(10);
    expect(b).toBeGreaterThan(a);
    expect(b - a).toBeCloseTo(0.016, 3);
  });

  it('tracks real time one-for-one at rate 1', () => {
    sampleExtrapolatedClock(0, { reset: true });
    advance(1000);

    expect(readExtrapolatedClock()).toBeCloseTo(1, 2);
  });

  it('follows a doubled playback rate', () => {
    sampleExtrapolatedClock(30, { reset: true });
    setExtrapolatedClockRate(2);
    advance(500);

    expect(readExtrapolatedClock()).toBeCloseTo(31, 1);
  });

  it('is continuous across a sample and converges on it', () => {
    sampleExtrapolatedClock(10, { reset: true });
    advance(100);
    sampleExtrapolatedClock(10.1); // agrees with the prediction
    expect(readExtrapolatedClock()).toBeCloseTo(10.1, 2);

    // 100 ms on, the source reports 10.1 again although we had predicted 10.2: it lags by 100 ms.
    advance(100);
    const before = readExtrapolatedClock()!;
    sampleExtrapolatedClock(10.1);
    const after = readExtrapolatedClock()!;

    // The whole point: the value does not move at the instant of the sample.
    expect(after).toBeCloseTo(before, 3);

    // It then converges onto the measurement over the correction window.
    advance(450);
    expect(readExtrapolatedClock()).toBeCloseTo(10.55, 2);
  });

  it('rebases instantly on a seek instead of easing across the song', () => {
    sampleExtrapolatedClock(10, { reset: true });
    advance(100);
    // A jump of a full minute is a seek; easing it would show the wrong lyric for a second.
    sampleExtrapolatedClock(70);

    expect(readExtrapolatedClock()).toBeCloseTo(70, 1);
  });

  it('clamps how far the display may run past the last measurement', () => {
    sampleExtrapolatedClock(55, { reset: true });
    // Nothing measured for ten seconds (a stalled iframe): the display must not free-run to 65.
    advance(10_000);

    expect(readExtrapolatedClock()!).toBeCloseTo(58, 5);
  });

  it('stops advancing once cleared, and rebases on the next sample', () => {
    sampleExtrapolatedClock(20, { reset: true });
    advance(500);
    clearExtrapolatedClock();

    expect(readExtrapolatedClock()).toBeNull();

    sampleExtrapolatedClock(3, { reset: true });
    expect(readExtrapolatedClock()).toBeCloseTo(3, 2);
  });

  it('ignores a non-finite or negative measurement', () => {
    sampleExtrapolatedClock(5, { reset: true });
    advance(100);
    sampleExtrapolatedClock(Number.NaN);
    sampleExtrapolatedClock(-3);

    expect(readExtrapolatedClock()).toBeCloseTo(5.1, 2);
  });
});
