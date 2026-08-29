import { describe, expect, it } from 'vitest';
import { LOCAL_DEMO_LYRICS, LOCAL_DEMO_SONGS, refineTranscriptSegments } from './localDemoSongs';

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

  it('refines a coarse transcript without moving its outer time boundary', () => {
    const refined = refineTranscriptSegments([[10, 20, '第一句。第二句。第三句。']]);
    expect(refined.length).toBeGreaterThan(1);
    expect(refined[0][0]).toBe(10);
    expect(refined[refined.length - 1][1]).toBe(20);
    for (let index = 1; index < refined.length; index += 1) {
      expect(refined[index][0]).toBeGreaterThanOrEqual(refined[index - 1][1]);
    }
  });

  it('glues leading punctuation onto the previous line instead of leaving a lone mark', () => {
    const refined = refineTranscriptSegments([
      [8.88, 19.42, '遠回りばかりして'],
      [19.42, 29.68, '。ため息を数えてた。'],
    ]);
    expect(refined.some(segment => segment[2] === '。')).toBe(false);
    expect(refined[0][2]).toContain('して。');
    expect(refined[1][2].startsWith('。')).toBe(false);
  });

  it('keeps the creator-confirmed Stardust hook and corrected Sun timing boundary', () => {
    const stardustText = LOCAL_DEMO_LYRICS['demo-stardust-pop-idol'].lines.map(line => line.fullText).join(' ');
    expect(stardustText).toContain('STARDUST POP IDOL');
    expect(stardustText).not.toContain('STARDOM POP IDOL');

    const sunLines = LOCAL_DEMO_LYRICS['demo-sun-beneath-a-song'].lines;
    const sparkIndex = sunLines.findIndex(line => line.fullText.startsWith('Each'));
    const nextLine = sunLines.find(line => line.fullText.startsWith('A gentle truth'));
    expect(sunLines[sparkIndex]?.startTime).toBe(69100);
    expect(nextLine?.startTime).toBe(81280);
  });

  it('maps every local track to matching exhibition lyric data', () => {
    const songIds = LOCAL_DEMO_SONGS.map(song => song.id).sort();
    expect(Object.keys(LOCAL_DEMO_LYRICS).sort()).toEqual(songIds);

    for (const song of LOCAL_DEMO_SONGS) {
      const lyrics = LOCAL_DEMO_LYRICS[song.id];
      expect(lyrics?.availability).toBe('available');
      expect(lyrics?.lines.length).toBeGreaterThan(0);
      expect(lyrics?.lines.some(line => line.words.length > 1)).toBe(true);
      for (const line of lyrics?.lines ?? []) {
        expect(line.startTime).toBeLessThanOrEqual(line.endTime);
        let previousWordEnd = line.startTime;
        for (const word of line.words) {
          expect(word.startTime).toBeGreaterThanOrEqual(line.startTime);
          expect(word.endTime).toBeLessThanOrEqual(line.endTime);
          expect(word.startTime).toBeGreaterThanOrEqual(previousWordEnd);
          expect(word.endTime).toBeGreaterThanOrEqual(word.startTime);
          previousWordEnd = word.endTime;
        }
      }
    }
  });
});
