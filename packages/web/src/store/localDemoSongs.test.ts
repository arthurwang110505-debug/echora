import { describe, expect, it } from 'vitest';
import { LOCAL_DEMO_LYRICS, LOCAL_DEMO_SONGS } from './localDemoSongs';

describe('local demo showcase songs', () => {
  it('contains the five uploaded royalty-free tracks', () => {
    expect(LOCAL_DEMO_SONGS).toHaveLength(5);
    expect(LOCAL_DEMO_SONGS.every(song => song.source === 'local')).toBe(true);
    expect(LOCAL_DEMO_SONGS.every(song => song.audioUrl?.startsWith('https://files.manuscdn.com/'))).toBe(true);
    expect(LOCAL_DEMO_SONGS.every(song => (song.durationMs || 0) > 0)).toBe(true);
  });

  it('keeps attribution metadata attached to every track', () => {
    for (const song of LOCAL_DEMO_SONGS) {
      expect(song.attribution.creator).toBeTruthy();
      expect(song.attribution.licenseLabel).toMatch(/Pixabay/);
      expect(song.attribution.sourceUrl).toMatch(/^https:\/\/pixabay\.com\//);
    }
  });

  it('does not claim lyrics that were not supplied or verified', () => {
    expect(Object.keys(LOCAL_DEMO_LYRICS)).toHaveLength(0);
  });
});
