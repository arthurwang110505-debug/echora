import { afterEach, describe, expect, it } from 'vitest';
import {
  getPlaybackClockReading,
  hasPlaybackClock,
  setPlaybackClockElement,
} from './playbackClock';

/** The minimum of HTMLAudioElement the reader touches: one mutable property. */
const fakeElement = (currentTime: number) => ({ currentTime }) as HTMLAudioElement;

afterEach(() => {
  setPlaybackClockElement(null);
});

describe('playback clock', () => {
  it('answers null before any element is registered', () => {
    expect(hasPlaybackClock()).toBe(false);
    expect(getPlaybackClockReading()).toBeNull();
  });

  it('reads the element position, not a cached copy', () => {
    const element = fakeElement(12.5);
    setPlaybackClockElement(element);
    expect(hasPlaybackClock()).toBe(true);
    expect(getPlaybackClockReading()).toBe(12.5);
    // The point of the module: it answers what the element says right now, per call.
    element.currentTime = 12.517;
    expect(getPlaybackClockReading()).toBe(12.517);
  });

  // A remote source (YouTube, Spotify) never registers an element, so the stage must fall back to
  // its prop rather than freezing at zero.
  it('answers null again once the element is unregistered', () => {
    setPlaybackClockElement(fakeElement(4));
    expect(getPlaybackClockReading()).toBe(4);
    setPlaybackClockElement(null);
    expect(getPlaybackClockReading()).toBeNull();
  });

  it('rejects a position that is not a usable number', () => {
    const element = fakeElement(Number.NaN);
    setPlaybackClockElement(element);
    expect(getPlaybackClockReading()).toBeNull();
    element.currentTime = -1;
    expect(getPlaybackClockReading()).toBeNull();
    element.currentTime = Number.POSITIVE_INFINITY;
    expect(getPlaybackClockReading()).toBeNull();
  });

  it('reads 0 before playback starts rather than treating it as missing', () => {
    setPlaybackClockElement(fakeElement(0));
    expect(getPlaybackClockReading()).toBe(0);
  });
});
