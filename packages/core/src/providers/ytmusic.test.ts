import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TRACK_LIMIT, extractYouTubeVideoId, parseYouTubeDuration, resolveYouTubeVideoKind, YouTubeMusicProvider } from './ytmusic';

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

  it('surfaces Google rejection reasons so the UI can explain 401/403 failures', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { errors: [{ reason: 'accessNotConfigured', message: 'YouTube Data API has not been used in project 123 before or it is disabled.' }] },
      }), { status: 403 }))
      // The 502 is retried once, so it needs two responses before it gives up.
      .mockResolvedValueOnce(new Response('upstream unavailable', { status: 502 }))
      .mockResolvedValueOnce(new Response('upstream unavailable', { status: 502 }));
    vi.stubGlobal('fetch', fetch);

    const provider = new YouTubeMusicProvider();
    provider.setAccessToken('token');

    await expect(provider.getProfile()).rejects.toThrow('YouTube API failed: 403 (accessNotConfigured)');
    // A 403 is a durable answer: one attempt, no retry.
    expect(fetch).toHaveBeenCalledTimes(1);

    await expect(provider.getProfile()).rejects.toThrow('YouTube API failed: 502');
    // A 502 is transient: the request is tried twice before it surfaces.
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});


describe('YouTubeMusicProvider caching', () => {
  /** Builds a provider with a stub fetch that answers playlist pages. */
  const setup = (responses: Array<() => Response>, options: ConstructorParameters<typeof YouTubeMusicProvider>[0] = {}) => {
    const fetch = vi.fn();
    for (const response of responses) fetch.mockResolvedValueOnce(response());
    vi.stubGlobal('fetch', fetch);
    const provider = new YouTubeMusicProvider(options);
    provider.setAccessToken('token-a');
    return { fetch, provider };
  };

  const playlistsPage = (items: Array<{ id: string; title: string }>) => () => new Response(JSON.stringify({
    items: items.map(item => ({ id: item.id, snippet: { title: item.title }, contentDetails: { itemCount: 1 } })),
  }));

  it('serves a second getUserPlaylists call from cache', async () => {
    const { fetch, provider } = setup([playlistsPage([{ id: 'p1', title: '第一張' }])]);

    const first = await provider.getUserPlaylists();
    const second = await provider.getUserPlaylists();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('invalidates the cache when the account changes', async () => {
    const { fetch, provider } = setup([
      playlistsPage([{ id: 'p1', title: 'A 的歌單' }]),
      playlistsPage([{ id: 'p2', title: 'B 的歌單' }]),
    ]);

    expect((await provider.getUserPlaylists())[0].id).toBe('p1');
    provider.setAccessToken('token-b');
    // Same request, different account: the cache must not answer for the previous one.
    expect((await provider.getUserPlaylists())[0].id).toBe('p2');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not reuse a cache entry after the TTL expires', async () => {
    const { fetch, provider } = setup([
      playlistsPage([{ id: 'p1', title: '第一張' }]),
      playlistsPage([{ id: 'p1', title: '第一張' }]),
    ]);
    const now = vi.spyOn(Date, 'now');

    now.mockReturnValue(1_000_000);
    await provider.getUserPlaylists();
    now.mockReturnValue(1_000_000 + 60_001);
    await provider.getUserPlaylists();

    expect(fetch).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });

  it('ignores a token change that does not actually change the token', async () => {
    const { fetch, provider } = setup([playlistsPage([{ id: 'p1', title: '第一張' }])]);

    await provider.getUserPlaylists();
    // The store re-applies the same token on every restore; that must not empty the cache.
    provider.setAccessToken('token-a');
    await provider.getUserPlaylists();

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('YouTubeMusicProvider pagination limits', () => {
  it('stops paging once the limit is covered', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (!url.includes('/playlistItems')) return new Response(JSON.stringify({ items: [] }));
      const isFirst = !url.includes('pageToken');
      return new Response(JSON.stringify({
        items: Array.from({ length: 50 }, (_, i) => ({ snippet: { title: `t${i}`, resourceId: { videoId: `${isFirst ? 'v' : 'w'}${String(i).padStart(10, '0')}` } } })),
        nextPageToken: isFirst ? 'page-2' : 'page-3',
      }));
    });
    vi.stubGlobal('fetch', fetch);

    const provider = new YouTubeMusicProvider();
    provider.setAccessToken('token');
    const { tracks, hasMore } = await provider.getPlaylistTracksPage('playlist-1', { limit: 60 });

    // Two pages of 50 cover 60, so the second page is the last one requested - not the third.
    const pages = fetch.mock.calls.filter(([url]) => String(url).includes('/playlistItems'));
    expect(pages).toHaveLength(2);
    expect(String(pages[1][0])).toContain('page-2');
    expect(tracks).toHaveLength(60);
    expect(hasMore).toBe(true);
  });

  it('reports completion when the playlist runs out before the limit', async () => {
    const fetch = vi.fn(async (url: string) => (
      url.includes('/playlistItems')
        ? new Response(JSON.stringify({ items: [
          { snippet: { title: 'a', resourceId: { videoId: 'by4SYYWlhEs' } } },
          { snippet: { title: 'b', resourceId: { videoId: 'ZRtdQ81jPUQ' } } },
        ] }))
        : new Response(JSON.stringify({ items: [] }))
    ));
    vi.stubGlobal('fetch', fetch);

    const provider = new YouTubeMusicProvider();
    provider.setAccessToken('token');
    const { tracks, hasMore } = await provider.getPlaylistTracksPage('playlist-1', { limit: 60 });

    expect(tracks).toHaveLength(2);
    expect(hasMore).toBe(false);
  });

  it('defaults to a bounded number of tracks', async () => {
    // Guards the regression this exists for: the old code walked up to 5,000 tracks in series.
    expect(DEFAULT_TRACK_LIMIT).toBe(300);
  });

  it('keeps getPlaylistTracks returning a bare track array', async () => {
    const fetch = vi.fn(async (url: string) => (
      url.includes('/playlistItems')
        ? new Response(JSON.stringify({ items: [{ snippet: { title: 'Music track', resourceId: { videoId: 'by4SYYWlhEs' } } }] }))
        : new Response(JSON.stringify({ items: [{ id: 'by4SYYWlhEs', snippet: { categoryId: '10' }, contentDetails: { duration: 'PT3M' } }] }))
    ));
    vi.stubGlobal('fetch', fetch);

    const provider = new YouTubeMusicProvider();
    provider.setAccessToken('token');
    const tracks = await provider.getPlaylistTracks('playlist-1');

    expect(Array.isArray(tracks)).toBe(true);
    expect(tracks[0]).toMatchObject({ id: 'by4SYYWlhEs', youtubeVideoKind: 'music' });
  });
});

describe('YouTubeMusicProvider bounded concurrency', () => {
  it('never has more than three metadata requests in flight', async () => {
    // 200 tracks is four `videos.list` batches. The old code sent them one at a time; an unbounded
    // `Promise.all` would send four at once. Both are wrong for a per-user rate limit.
    const trackIds = Array.from({ length: 200 }, (_, index) => `vid${String(index).padStart(8, '0')}`);
    let inFlight = 0;
    let peak = 0;

    const fetch = vi.fn(async (url: string) => {
      if (url.includes('/playlistItems')) {
        return new Response(JSON.stringify({ items: trackIds.map(id => ({ snippet: { title: id, resourceId: { videoId: id } } })) }));
      }
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise(resolve => setTimeout(resolve, 5));
      inFlight -= 1;
      return new Response(JSON.stringify({ items: [] }));
    });
    vi.stubGlobal('fetch', fetch);

    const provider = new YouTubeMusicProvider();
    provider.setAccessToken('token');
    await provider.getPlaylistTracksPage('playlist-1', { limit: 200 });

    expect(peak).toBeGreaterThan(1); // serial was the old behaviour, and it was the complaint
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe('YouTubeMusicProvider diagnostics', () => {
  it('reports metadata failure without failing the playlist load', async () => {
    const onDiagnostic = vi.fn();
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ snippet: { title: 'Track', resourceId: { videoId: 'by4SYYWlhEs' } } }] })))
      .mockResolvedValue(new Response('nope', { status: 403 }));
    vi.stubGlobal('fetch', fetch);

    const provider = new YouTubeMusicProvider({ onDiagnostic });
    provider.setAccessToken('token');
    const tracks = await provider.getPlaylistTracks('playlist-1');

    // The playlist still opens; the tracks are honestly `unknown` rather than guessed as music.
    expect(tracks).toHaveLength(1);
    expect(tracks[0].youtubeVideoKind).toBe('unknown');
    expect(onDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ name: 'youtube_metadata_unavailable' }));
  });

  it('reports truncation so a partial playlist is not silently short', async () => {
    const onDiagnostic = vi.fn();
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: Array.from({ length: 50 }, (_, i) => ({ snippet: { title: `t${i}`, resourceId: { videoId: `v${String(i).padStart(10, '0')}` } } })),
        nextPageToken: 'more',
      })))
      .mockResolvedValue(new Response(JSON.stringify({ items: [] })));
    vi.stubGlobal('fetch', fetch);

    const provider = new YouTubeMusicProvider({ onDiagnostic });
    provider.setAccessToken('token');
    await provider.getPlaylistTracksPage('playlist-1', { limit: 10 });

    expect(onDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ name: 'youtube_tracks_truncated' }));
  });
});
