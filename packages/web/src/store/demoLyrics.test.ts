import { describe, expect, it } from 'vitest';
import { DEMO_LYRICS, getBundledDemoLyrics } from './demoLyrics';

describe('bundled showcase lyrics', () => {
  it('keeps the three Japanese demo songs keyed by stable catalog ids', () => {
    for (const songId of ['yt_1', 'yt_2', 'yt_3']) {
      const lyrics = DEMO_LYRICS[songId];
      expect(lyrics?.availability).toBeUndefined();
      expect(lyrics?.lines.length).toBeGreaterThan(0);
      expect(lyrics?.lines.some(line => line.words.length > 0)).toBe(true);
    }
  });

  it('keeps the catalog identity separate from the YouTube playback URL', () => {
    expect(DEMO_LYRICS.yt_1.title).toBe('夜に駆ける');
    expect(DEMO_LYRICS.yt_2.title).toBe('First Love');
    expect(DEMO_LYRICS.yt_3.title).toBe('アイドル');
  });

  it('recovers lyrics when a provider replaces the demo id with a video id', () => {
    expect(getBundledDemoLyrics({
      id: 'by4SYYWlhEs',
      title: '夜に駆ける',
      artists: [{ id: 'yoasobi', name: 'YOASOBI' }],
    })?.title).toBe('夜に駆ける');
    expect(getBundledDemoLyrics({
      id: 'o1sUaVJUeB0',
      title: 'First Love',
      artists: [{ id: 'utada', name: 'Utada Hikaru' }],
    })?.title).toBe('First Love');
    expect(getBundledDemoLyrics({
      id: 'ZRtdQ81jPUQ',
      title: 'アイドル',
      artists: [{ id: 'yoasobi', name: 'YOASOBI' }],
    })?.title).toBe('アイドル');
  });
});
