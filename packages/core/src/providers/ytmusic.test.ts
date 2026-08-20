import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractYouTubeVideoId, YouTubeMusicProvider } from './ytmusic';

afterEach(() => { vi.unstubAllGlobals(); });

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

describe('YouTubeMusicProvider pagination', () => {
  it('collects every returned playlist page before mapping the shared library', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{ id: 'first', snippet: { title: '第一頁', thumbnails: { medium: { url: 'https://example.com/1.jpg' } } }, contentDetails: { itemCount: 1 } }],
        nextPageToken: 'next-page',
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{ id: 'second', snippet: { title: '第二頁' }, contentDetails: { itemCount: 2 } }],
      })));
    vi.stubGlobal('fetch', fetch);

    const provider = new YouTubeMusicProvider();
    provider.setAccessToken('token');
    const playlists = await provider.getUserPlaylists();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(playlists).toMatchObject([{ id: 'first', trackCount: 1 }, { id: 'second', trackCount: 2 }]);
  });
});
