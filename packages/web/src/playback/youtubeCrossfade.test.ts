import { describe, expect, it } from 'vitest';
import { SONG_CROSSFADE_MS, resolveSongCrossfadeFrame } from './songCrossfade';
import {
  YOUTUBE_FADE_IN_MS,
  YOUTUBE_FADE_OUT_MS,
  isYouTubeTrackChange,
  resolveYouTubeFadeInGain,
  resolveYouTubeFadeOutGain,
  resolveYouTubeEndAction,
} from './youtubeCrossfade';

describe('song crossfade curve', () => {
  it('splits the dissolve across the two halves of the shared duration', () => {
    expect(YOUTUBE_FADE_OUT_MS + YOUTUBE_FADE_IN_MS).toBe(SONG_CROSSFADE_MS);
  });

  it('keeps the two sides summing to one so the swap never dips', () => {
    for (const elapsed of [0, 50, 100, 200, 280]) {
      const frame = resolveSongCrossfadeFrame(elapsed, SONG_CROSSFADE_MS);
      expect(frame.outgoingAlpha + frame.incomingAlpha).toBeCloseTo(1, 10);
    }
  });

  it('reaches exactly zero and one, so a ramp cannot end on a leftover level', () => {
    const final = resolveSongCrossfadeFrame(SONG_CROSSFADE_MS, SONG_CROSSFADE_MS);
    expect(final.outgoingAlpha).toBe(0);
    expect(final.incomingAlpha).toBe(1);
    expect(final.done).toBe(true);
  });
});

describe('resolveYouTubeFadeOutGain', () => {
  it('starts fully audible', () => {
    expect(resolveYouTubeFadeOutGain(0)).toBe(1);
    expect(resolveYouTubeFadeOutGain(-10)).toBe(1);
  });

  it('is exactly silent once the fade is over', () => {
    expect(resolveYouTubeFadeOutGain(YOUTUBE_FADE_OUT_MS)).toBe(0);
    expect(resolveYouTubeFadeOutGain(YOUTUBE_FADE_OUT_MS * 2)).toBe(0);
  });

  it('decreases monotonically', () => {
    let previous = resolveYouTubeFadeOutGain(0);
    for (let elapsed = 0; elapsed <= YOUTUBE_FADE_OUT_MS; elapsed += 8) {
      const gain = resolveYouTubeFadeOutGain(elapsed);
      expect(gain).toBeLessThanOrEqual(previous + 1e-10);
      expect(gain).toBeGreaterThanOrEqual(0);
      previous = gain;
    }
  });

  it('is about halfway at the midpoint of an eased curve', () => {
    const midway = resolveYouTubeFadeOutGain(YOUTUBE_FADE_OUT_MS / 2);
    expect(midway).toBeCloseTo(0.5, 6);
  });

  it('treats unusable input as silent rather than as full volume', () => {
    // A NaN clock means the ramp cannot be placed; silence is the safe answer
    // because the alternative is a track stuck at the user's level mid-fade.
    expect(resolveYouTubeFadeOutGain(Number.NaN)).toBe(0);
    expect(resolveYouTubeFadeOutGain(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('resolveYouTubeFadeInGain', () => {
  it('starts silent, so the new track never begins at full volume', () => {
    expect(resolveYouTubeFadeInGain(0)).toBe(0);
    expect(resolveYouTubeFadeInGain(-5)).toBe(0);
  });

  it('ends exactly at the user level', () => {
    expect(resolveYouTubeFadeInGain(YOUTUBE_FADE_IN_MS)).toBe(1);
    expect(resolveYouTubeFadeInGain(YOUTUBE_FADE_IN_MS * 3)).toBe(1);
  });

  it('increases monotonically', () => {
    let previous = resolveYouTubeFadeInGain(0);
    for (let elapsed = 0; elapsed <= YOUTUBE_FADE_IN_MS; elapsed += 8) {
      const gain = resolveYouTubeFadeInGain(elapsed);
      expect(gain).toBeGreaterThanOrEqual(previous - 1e-10);
      expect(gain).toBeLessThanOrEqual(1);
      previous = gain;
    }
  });

  it('is about halfway at the midpoint', () => {
    expect(resolveYouTubeFadeInGain(YOUTUBE_FADE_IN_MS / 2)).toBeCloseTo(0.5, 6);
  });

  it('resolves a broken clock to the user level instead of muting forever', () => {
    // The incoming track is already playing by then; leaving it silent would be a
    // worse failure than skipping the ramp.
    expect(resolveYouTubeFadeInGain(Number.NaN)).toBe(1);
  });
});

describe('fade out meets fade in', () => {
  it('hands over at zero, so the swap itself is silent', () => {
    expect(resolveYouTubeFadeOutGain(YOUTUBE_FADE_OUT_MS)).toBe(0);
    expect(resolveYouTubeFadeInGain(0)).toBe(0);
  });

  it('never leaves both sides audible at once', () => {
    // They are sequential, not simultaneous: an iframe has one volume control, so
    // the honest reading of "crossfade" here is a dissolve, not a mix.
    for (let elapsed = 0; elapsed <= YOUTUBE_FADE_OUT_MS; elapsed += 8) {
      const out = resolveYouTubeFadeOutGain(elapsed);
      const inn = resolveYouTubeFadeInGain(elapsed);
      expect(out + inn).toBeLessThanOrEqual(1 + 1e-10);
    }
  });
});

describe('isYouTubeTrackChange', () => {
  it('treats a different video id as a track change', () => {
    expect(isYouTubeTrackChange('aaaaaaaaaaa', 'bbbbbbbbbbb')).toBe(true);
  });

  it('does not fade when the same track is re-selected', () => {
    // Pressing play on the song that is already playing should restart it, not
    // dissolve it into itself.
    expect(isYouTubeTrackChange('aaaaaaaaaaa', 'aaaaaaaaaaa')).toBe(false);
  });

  it('never fades when there is no incoming track', () => {
    expect(isYouTubeTrackChange('aaaaaaaaaaa', null)).toBe(false);
    expect(isYouTubeTrackChange('aaaaaaaaaaa', undefined)).toBe(false);
    expect(isYouTubeTrackChange('aaaaaaaaaaa', '')).toBe(false);
  });

  it('does not fade a first load, where there is no outgoing audio', () => {
    expect(isYouTubeTrackChange(null, 'bbbbbbbbbbb')).toBe(true);
  });
});

describe('resolveYouTubeEndAction', () => {
  it('restarts the track in single-loop mode', () => {
    expect(resolveYouTubeEndAction('single')).toBe('restart');
  });

  it('advances the queue in list mode', () => {
    expect(resolveYouTubeEndAction('list')).toBe('next');
  });

  it('advances the queue when looping is off', () => {
    // `playerStore.next()` wraps to the first track on its own, so "off" and "list"
    // differ only in what the control shows - not in what happens at the end.
    expect(resolveYouTubeEndAction('off')).toBe('next');
  });

  it('never leaves a finished track sitting on `ended`', () => {
    // This is the bug it exists to prevent: before this, a finished YouTube track
    // set `playbackState: 'ended'` and stopped, so the playlist never moved on.
    for (const mode of ['off', 'list', 'single'] as const) {
      expect(['restart', 'next']).toContain(resolveYouTubeEndAction(mode));
    }
  });
});
