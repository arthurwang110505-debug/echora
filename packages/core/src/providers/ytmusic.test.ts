import { describe, expect, it } from 'vitest';
import { extractYouTubeVideoId } from './ytmusic';

describe('extractYouTubeVideoId', () => {
  it('accepts a canonical 11-character video ID', () => {
    expect(extractYouTubeVideoId('by4SYYWlhEs')).toBe('by4SYYWlhEs');
  });

  it('normalizes YouTube watch, Music watch, short, and embed URLs', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=ZRtdQ81jPUQ')).toBe('ZRtdQ81jPUQ');
    expect(extractYouTubeVideoId('https://music.youtube.com/watch?v=o1sUaVJUeB0')).toBe('o1sUaVJUeB0');
    expect(extractYouTubeVideoId('https://youtu.be/by4SYYWlhEs')).toBe('by4SYYWlhEs');
    expect(extractYouTubeVideoId('https://www.youtube.com/embed/ZRtdQ81jPUQ')).toBe('ZRtdQ81jPUQ');
  });

  it('rejects playlist IDs, empty values, and invalid IDs', () => {
    expect(extractYouTubeVideoId('RDCLAK5uy_kL8wQ9d20c5_yytm1')).toBeNull();
    expect(extractYouTubeVideoId('yt_1')).toBeNull();
    expect(extractYouTubeVideoId(undefined)).toBeNull();
  });
});
