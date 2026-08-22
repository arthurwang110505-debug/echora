import { describe, expect, it } from 'vitest';
import { LOCAL_DEMO_LYRICS, LOCAL_DEMO_SONGS } from './localDemoSongs';

describe('local demo showcase songs', () => {
  it('contains the five uploaded royalty-free tracks', () => {
    expect(LOCAL_DEMO_SONGS).toHaveLength(5);
    expect(LOCAL_DEMO_SONGS.every(song => song.source === 'local')).toBe(true);
    expect(LOCAL_DEMO_SONGS.every(song => song.audioUrl?.startsWith('https://files.manuscdn.com/'))).toBe(true);
    expect(LOCAL_DEMO_SONGS.every(song => (song.durationMs || 0) > 0)).toBe(true);
    expect(LOCAL_DEMO_SONGS.every(song => song.coverUrl?.startsWith('/covers/') && song.coverUrl?.endsWith('.webp'))).toBe(true);
  });

  it('keeps attribution metadata attached to every track', () => {
    for (const song of LOCAL_DEMO_SONGS) {
      expect(song.attribution.creator).toBeTruthy();
      expect(song.attribution.licenseLabel).toMatch(/Pixabay/);
      expect(song.attribution.sourceUrl).toMatch(/^https:\/\/pixabay\.com\//);
    }
  });

  it('maps every local track to matching exhibition lyric data', () => {
    const songIds = LOCAL_DEMO_SONGS.map(song => song.id).sort();
    expect(Object.keys(LOCAL_DEMO_LYRICS).sort()).toEqual(songIds);

    for (const song of LOCAL_DEMO_SONGS) {
      const lyrics = LOCAL_DEMO_LYRICS[song.id];
      expect(lyrics?.availability).toBe('available');
      expect(lyrics?.lines.length).toBeGreaterThan(0);
      expect(lyrics?.lines.some(line => line.words.length > 1)).toBe(true);
    }
  });
});
