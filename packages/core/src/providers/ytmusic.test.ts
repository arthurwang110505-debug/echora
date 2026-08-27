import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractYouTubeVideoId, parseYouTubeDuration, resolveYouTubeVideoKind, YouTubeMusicProvider } from './ytmusic';

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

describe('YouTube video metadata helpers', () => {
  it('parses ISO 8601 durations and keeps invalid values unknown', () => {
    expect(parseYouTubeDuration('PT1H2M3.5S')).toBe(3723500);
    expect(parseYouTubeDuration('PT4M12S')).toBe(252000);
    expect(parseYouTubeDuration('')).toBeUndefined();
    expect(parseYouTubeDuration('not-a-duration')).toBeUndefined();
  });

  it('classifies only the official music category as music', () => {
    expect(resolveYouTubeVideoKind('10')).toBe('music');
    expect(resolveYouTubeVideoKind('22')).toBe('video');
    expect(resolveYouTubeVideoKind(undefined)).toBe('unknown');
  });
});

describe('YouTubeMusicProvider metadata and pagination', () => {
  it('maps playlist tracks with official video metadata without guessing missing categories', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{ snippet: { title: 'Music track', channelTitle: 'Artist', resourceId: { videoId: 'by4SYYWlhEs' } } }, { snippet: { title: 'Ordinary video', channelTitle: 'Channel', resourceId: { videoId: 'ZRtdQ81jPUQ' } } }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [
          { id: 'by4SYYWlhEs', snippet: { categoryId: '10' }, contentDetails: { duration: 'PT3M5S' }, status: { embeddable: true } },
          { id: 'ZRtdQ81jPUQ', snippet: { categoryId: '22' }, contentDetails: { duration: 'PT1M' }, status: { embeddable: true } },
        ],
      })));
    vi.stubGlobal('fetch', fetch);

    const provider = new YouTubeMusicProvider();
    provider.setAccessToken('token');
    const tracks = await provider.getPlaylistTracks('playlist-1');

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[0]).toContain('/videos?part=snippet,contentDetails,status');
    expect(tracks).toMatchObject([
      { id: 'by4SYYWlhEs', durationMs: 185000, youtubeVideoKind: 'music' },
      { id: 'ZRtdQ81jPUQ', durationMs: 60000, youtubeVideoKind: 'video' },
    ]);
  });

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
