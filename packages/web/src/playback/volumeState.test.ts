import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLAYBACK_VOLUME,
  applyMuteToggle,
  applyVolumeChange,
  applyVolumeNudge,
  clampVolume,
  derivePlaybackVolume,
  sanitizeStoredVolume,
  volumeToPercentLabel,
} from './volumeState';

describe('playback volume state', () => {
  it('keeps the last audible level when muting, so unmuting restores sound', () => {
    // Regression: `toggleMute()` used to write `volume: 0`, and unmuting could never
    // recover a level from a stored zero - one mute press left the player permanently silent.
    const muted = applyMuteToggle({ volume: 0.8, isMuted: false });
    expect(muted).toEqual({ volume: 0.8, isMuted: true });
    expect(derivePlaybackVolume(muted.volume, muted.isMuted)).toBe(0);

    const unmuted = applyMuteToggle(muted);
    expect(unmuted).toEqual({ volume: 0.8, isMuted: false });
    expect(derivePlaybackVolume(unmuted.volume, unmuted.isMuted)).toBe(0.8);
  });

  it('treats a drag to zero as mute without destroying the level', () => {
    const zeroed = applyVolumeChange({ volume: 0.65, isMuted: false }, 0);
    expect(zeroed).toEqual({ volume: 0.65, isMuted: true });
    expect(applyVolumeChange(zeroed, 0.4)).toEqual({ volume: 0.4, isMuted: false });
  });

  it('clamps and repairs garbage levels', () => {
    expect(clampVolume(2)).toBe(1);
    expect(clampVolume(-3)).toBe(0);
    expect(clampVolume('0.5')).toBe(0.5);
    expect(clampVolume('abc')).toBe(DEFAULT_PLAYBACK_VOLUME);
    expect(clampVolume(undefined)).toBe(DEFAULT_PLAYBACK_VOLUME);
  });

  it('un-breaks snapshots written by the old mute model', () => {
    expect(sanitizeStoredVolume(0)).toBe(DEFAULT_PLAYBACK_VOLUME);
    expect(sanitizeStoredVolume(-1)).toBe(DEFAULT_PLAYBACK_VOLUME);
    expect(sanitizeStoredVolume('nope')).toBe(DEFAULT_PLAYBACK_VOLUME);
    expect(sanitizeStoredVolume(undefined)).toBe(DEFAULT_PLAYBACK_VOLUME);
    expect(sanitizeStoredVolume(0.25)).toBe(0.25);
    expect(sanitizeStoredVolume(1.5)).toBe(1);
  });

  it('nudges in both directions and stops at the edges', () => {
    expect(applyVolumeNudge({ volume: 0.5, isMuted: false }, 0.05).volume).toBeCloseTo(0.55);
    expect(applyVolumeNudge({ volume: 0.02, isMuted: false }, -0.05)).toEqual({ volume: 0.02, isMuted: true });
    expect(applyVolumeNudge({ volume: 0.99, isMuted: false }, 0.05)).toEqual({ volume: 1, isMuted: false });
    // A nudge while muted unmutes towards the stored level instead of staying silent.
    expect(applyVolumeNudge({ volume: 0.5, isMuted: true }, 0.1)).toEqual({ volume: 0.6, isMuted: false });
  });

  it('formats the audible level for labels, not the stored one', () => {
    expect(volumeToPercentLabel(0.8, false)).toBe('80%');
    expect(volumeToPercentLabel(0.8, true)).toBe('0%');
  });

  it('derives zero only from the mute flag or a real zero', () => {
    expect(derivePlaybackVolume(0.8, true)).toBe(0);
    expect(derivePlaybackVolume(0, false)).toBe(0);
    expect(derivePlaybackVolume(0.4, false)).toBe(0.4);
  });
});
