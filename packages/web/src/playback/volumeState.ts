// src/playback/volumeState.ts
//
// Volume and mute are stored apart from the *audible* gain on purpose.
//
// The previous model wrote `volume: 0` when muting and restored `0` on unmute, while
// the playback snapshot persisted `volume` but not `isMuted`. Result: one mute press
// (or one reload after a mute) left the player permanently silent with an icon that
// claimed the opposite, and no volume control existed anywhere to recover.

export const DEFAULT_PLAYBACK_VOLUME = 0.8;
export const MIN_PLAYBACK_VOLUME = 0;
export const MAX_PLAYBACK_VOLUME = 1;
export const VOLUME_STEP = 0.05;

export interface VolumeState {
  volume: number;
  isMuted: boolean;
}

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const clampVolume = (value: unknown): number => {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return DEFAULT_PLAYBACK_VOLUME;
  return Math.min(MAX_PLAYBACK_VOLUME, Math.max(MIN_PLAYBACK_VOLUME, parsed));
};

/** The gain actually applied to the media element / iframe player. */
export const derivePlaybackVolume = (volume: number, isMuted: boolean): number => (
  isMuted ? 0 : clampVolume(volume)
);

/**
 * Persisted volumes are sanitized: a stored 0 is the fingerprint of the old mute bug,
 * and `volume` only ever holds the last audible level - muting must never overwrite it.
 */
export const sanitizeStoredVolume = (value: unknown): number => {
  const parsed = toFiniteNumber(value);
  if (parsed === null || parsed <= MIN_PLAYBACK_VOLUME) return DEFAULT_PLAYBACK_VOLUME;
  return clampVolume(parsed);
};

export const applyVolumeChange = (state: VolumeState, nextVolume: unknown): VolumeState => {
  const parsed = toFiniteNumber(nextVolume);
  if (parsed === null) return state;
  if (parsed <= MIN_PLAYBACK_VOLUME) return { volume: state.volume, isMuted: true };
  return { volume: clampVolume(parsed), isMuted: false };
};

export const applyMuteToggle = (state: VolumeState): VolumeState => (
  { volume: state.volume, isMuted: !state.isMuted }
);

export const applyVolumeNudge = (state: VolumeState, delta: number): VolumeState => (
  applyVolumeChange(state, clampVolume(state.volume) + (toFiniteNumber(delta) ?? 0))
);

export const volumeToPercentLabel = (volume: number, isMuted: boolean): string => (
  `${Math.round(derivePlaybackVolume(volume, isMuted) * 100)}%`
);
