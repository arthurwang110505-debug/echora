import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayerStore } from './playerStore';
import { DEFAULT_PLAYBACK_VOLUME } from '../playback/volumeState';
import { derivePlaybackVolume } from '../playback/volumeState';

const SNAPSHOT_KEY = 'echora.playback-snapshot';

const store = () => usePlayerStore.getState();

/**
 * The store is the only place that decides what "muted" means for every surface, so the
 * regression is asserted here as well as in the pure module: a stored zero must never be
 * able to survive into an audible zero with a "not muted" icon.
 */
describe('playerStore volume & mute', () => {
  beforeEach(() => {
    const items = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => { items.set(key, value); },
        removeItem: (key: string) => { items.delete(key); },
      },
    });
    usePlayerStore.setState({ volume: DEFAULT_PLAYBACK_VOLUME, isMuted: false, currentSong: null, playlist: [], currentTime: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the level across mute / unmute', () => {
    store().setVolume(0.42);
    store().toggleMute();
    expect(store().volume).toBeCloseTo(0.42);
    expect(derivePlaybackVolume(store().volume, store().isMuted)).toBe(0);

    store().toggleMute();
    expect(store().isMuted).toBe(false);
    expect(derivePlaybackVolume(store().volume, store().isMuted)).toBeCloseTo(0.42);
  });

  it('records a drag to zero as mute without erasing the level', () => {
    store().setVolume(0.7);
    store().setVolume(0);
    expect(store().isMuted).toBe(true);
    expect(store().volume).toBeCloseTo(0.7);
    store().setVolume(0.3);
    expect(store().isMuted).toBe(false);
  });

  it('nudges from the keyboard without unmuting into silence', () => {
    store().setVolume(0.5);
    store().nudgeVolume(0.1);
    expect(store().volume).toBeCloseTo(0.6);
    store().toggleMute();
    store().nudgeVolume(0.1);
    expect(store().volume).toBeCloseTo(0.7);
    expect(store().isMuted).toBe(false);
  });

  it('restores a snapshot written by the old mute model with audible volume', () => {
    (window as unknown as { localStorage: Storage }).localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({
      currentSong: { id: 'x', title: 'Old mute snapshot', artists: [], source: 'local', audioUrl: '/a.mp3', durationMs: 1000 },
      playlist: [],
      currentIndex: 0,
      currentTime: 12,
      duration: 200,
      volume: 0,
    }));

    store().restorePlaybackSnapshot();
    expect(store().volume).toBeCloseTo(DEFAULT_PLAYBACK_VOLUME);
    expect(store().isMuted).toBe(false);
    expect(derivePlaybackVolume(store().volume, store().isMuted)).toBeGreaterThan(0);
  });

  it('persists the mute flag instead of a zeroed level', () => {
    const read = () => JSON.parse((window as unknown as { localStorage: Storage }).localStorage.getItem(SNAPSHOT_KEY) || '{}');
    usePlayerStore.setState({ currentSong: { id: 'persist-x', title: 'Persist', artists: [], source: 'local', audioUrl: '/a.mp3', durationMs: 1000 } });
    store().setVolume(0.9);
    store().toggleMute();
    store().setLocalTime(1, 100);
    expect(read().isMuted).toBe(true);
    expect(read().volume).toBeCloseTo(0.9);
  });

  it('exposes the audio routing decision for the settings read-out', () => {
    store().setLocalSpectrum({ mode: 'analyser', reason: 'cors-allowlist' });
    expect(store().localSpectrum).toEqual({ mode: 'analyser', reason: 'cors-allowlist' });
    store().setLocalSpectrum(null);
    expect(store().localSpectrum).toBeNull();
  });
});
