import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpotifyProvider, SPOTIFY_SEARCH_LIMIT_MAX } from './spotify';

/**
 * The February 2026 Web API changes removed two endpoints Echora was built against and shrank a
 * parameter. These specs pin the request the provider sends and the shape it reads back, because
 * both failures are silent ones: a removed endpoint returns an error the provider swallows into an
 * empty list, and a renamed field reads as `undefined`.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

const providerWith = (fetchMock: ReturnType<typeof vi.fn>) => {
  vi.stubGlobal('fetch', fetchMock);
  const provider = new SpotifyProvider();
  provider.setAccessToken('token');
  return provider;
};

const track = {
  id: 'track-1',
  name: 'Night Signals',
  uri: 'spotify:track:track-1',
  duration_ms: 210_000,
  artists: [{ id: 'artist-1', name: 'Echora Sessions' }],
  album: { id: 'album-1', name: 'Sessions', images: [{ url: 'https://img/cover.jpg', width: 640, height: 640 }] },
};

describe('Spotify provider after the February 2026 changes', () => {
  it('reads a playlist track count from items, not tracks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      items: [{ id: 'p1', name: 'Focus', images: [{ url: 'https://img/p1.jpg' }], items: { total: 42 } }],
    }));
    const provider = providerWith(fetchMock);

    const playlists = await provider.getUserPlaylists();

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.spotify.com/v1/me/playlists?limit=20');
    expect(playlists).toEqual([{
      id: 'p1',
      name: 'Focus',
      coverUrl: 'https://img/p1.jpg',
      trackCount: 42,
      source: 'spotify',
    }]);
  });

  it('reports zero tracks for a playlist whose contents are withheld', async () => {
    // Contents are only served for owned or collaborative playlists; the metadata still arrives.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      items: [{ id: 'p2', name: 'Someone else’s mix', images: [], items: { total: 120 } }],
    }));
    const provider = providerWith(fetchMock);

    const playlists = await provider.getUserPlaylists();

    expect(playlists[0].trackCount).toBe(120);
    expect(playlists[0].coverUrl).toBeUndefined();
  });

  it('requests playlist contents from /items and reads items.items[].item', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      items: [{ item: track }, { item: null }],
    }));
    const provider = providerWith(fetchMock);

    const songs = await provider.getPlaylistTracks('p1');

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.spotify.com/v1/playlists/p1/items?limit=50');
    expect(songs).toHaveLength(1);
    expect(songs[0]).toMatchObject({
      id: 'track-1',
      title: 'Night Signals',
      durationMs: 210_000,
      audioUrl: 'spotify:track:track-1',
      coverUrl: 'https://img/cover.jpg',
      source: 'spotify',
    });
  });

  it('returns an empty list rather than throwing when a playlist is not readable', async () => {
    // A non-owned playlist yields metadata only: no `items` array at all.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'p3', name: 'Public mix' }));
    const provider = providerWith(fetchMock);

    await expect(provider.getPlaylistTracks('p3')).resolves.toEqual([]);
  });

  it('caps a search at the new ceiling of ten results', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ tracks: { items: [track] } }));
    const provider = providerWith(fetchMock);

    await provider.searchTracks('night signals', 50);

    expect(SPOTIFY_SEARCH_LIMIT_MAX).toBe(10);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://api.spotify.com/v1/search?type=track&q=night%20signals&limit=10`,
    );
  });

  it('defaults a search to the ceiling instead of the old default of twenty', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ tracks: { items: [] } }));
    const provider = providerWith(fetchMock);

    await provider.searchTracks('night signals');

    expect(fetchMock.mock.calls[0][0]).toContain('limit=10');
  });

  it('keeps a smaller requested page size, and never sends zero or a fraction', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ tracks: { items: [] } }));
    const provider = providerWith(fetchMock);

    await provider.searchTracks('a', 3);
    expect(fetchMock.mock.calls[0][0]).toContain('limit=3');

    await provider.searchTracks('a', 0);
    expect(fetchMock.mock.calls[1][0]).toContain('limit=1');

    await provider.searchTracks('a', 7.8);
    expect(fetchMock.mock.calls[2][0]).toContain('limit=7');
  });

  it('still reads currently-playing from an unaffected endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      is_playing: true,
      progress_ms: 1000,
      currently_playing_type: 'track',
      item: track,
    }));
    const provider = providerWith(fetchMock);

    const playback = await provider.getCurrentlyPlaying();

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.spotify.com/v1/me/player/currently-playing');
    expect(playback).toMatchObject({ isPlaying: true, progressMs: 1000 });
    expect(playback.song?.title).toBe('Night Signals');
  });
});
