import { describe, expect, it } from 'vitest';
import { shouldShowLyriclessSoundscape } from './stageFallback';

describe('shouldShowLyriclessSoundscape', () => {
  const base = { isLoadingLyrics: false, lineCount: 0, visualizerMode: 'classic' };

  it('swaps in the soundscape when a scene director has no lyrics', () => {
    expect(shouldShowLyriclessSoundscape(base)).toBe(true);
  });

  it('keeps the stage while lyrics are still loading', () => {
    // Otherwise the soundscape flashes for a beat on every song, before the lyrics arrive.
    expect(shouldShowLyriclessSoundscape({ ...base, isLoadingLyrics: true })).toBe(false);
  });

  it('keeps the stage when the song has lyrics', () => {
    expect(shouldShowLyriclessSoundscape({ ...base, lineCount: 12 })).toBe(false);
  });

  it('keeps the island mounted on a song with no lyrics', () => {
    // The island is a readout, not a scene: it explains the empty state instead of disappearing.
    // This is the regression. Without the exemption, picking Island drew the soundscape and the
    // user concluded the mode was broken.
    expect(shouldShowLyriclessSoundscape({ ...base, visualizerMode: 'island' })).toBe(false);
  });

  it('still swaps for the island once lyrics exist', () => {
    // The exemption only covers the no-lyrics case; with lyrics the island is a normal mode.
    expect(shouldShowLyriclessSoundscape({ ...base, visualizerMode: 'island', lineCount: 5 })).toBe(false);
    // ...and other modes keep the stage with lyrics too, so the pair stays symmetric.
    expect(shouldShowLyriclessSoundscape({ ...base, visualizerMode: 'classic', lineCount: 5 })).toBe(false);
  });

  it('treats every scene director the same', () => {
    for (const mode of ['classic', 'cadenza', 'tempera', 'lumiere', 'partita', 'fume', 'monet', 'cappella', 'pendolo', 'sonnet', 'claddagh', 'diorama', 'tilt']) {
      expect(shouldShowLyriclessSoundscape({ ...base, visualizerMode: mode })).toBe(true);
    }
  });
});
