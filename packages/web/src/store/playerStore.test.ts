import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Playlist, Song } from '@echora/core';
import { classifyYouTubeFailure, isYouTubeAuthFailure, usePlayerStore } from './playerStore';

const musicTrack: Song = {
  id: 'by4SYYWlhEs',
  title: '同步後的歌曲',
  artists: [{ id: 'artist-1', name: '同步歌手' }],
  source: 'ytmusic',
  audioUrl: 'by4SYYWlhEs',
  youtubeVideoKind: 'music',
};

const playlist: Playlist = {
  id: 'yt-playlist-1',
  name: '我的 YouTube 歌單',
  source: 'ytmusic',
  trackCount: 1,
};

afterEach(() => { vi.unstubAllGlobals(); });

beforeEach(() => {
  vi.stubGlobal('window', {
    dispatchEvent: vi.fn(),
    localStorage: { getItem: vi.fn().mockReturnValue(null), setItem: vi.fn() },
  });
  vi.stubGlobal('CustomEvent', class {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  });
  usePlayerStore.setState({
    activeSource: 'ytmusic',
    youtubeToken: 'token',
    youtubeConnected: true,
    userPlaylists: [],
    selectedPlaylistId: null,
    loadedPlaylistId: null,
    playlist: [],
    currentSong: null,
    currentLyrics: null,
    isLoadingLyrics: false,
    ytProvider: {
      getUserPlaylists: vi.fn().mockResolvedValue([playlist]),
      getPlaylistTracks: vi.fn().mockResolvedValue([musicTrack]),
      searchTracks: vi.fn(),
    } as any,
  });
});

describe('YouTube playlist loading', () => {
  it('auto-selects and preloads the first synced playlist without autoplay', async () => {
    await usePlayerStore.getState().loadSourcePlaylists();

    const state = usePlayerStore.getState();
    expect(state.selectedPlaylistId).toBe('yt-playlist-1');
    expect(state.loadedPlaylistId).toBe('yt-playlist-1');
    expect(state.playlist).toEqual([musicTrack]);
    expect(state.currentSong).toBeNull();
    expect(state.isSyncingLibrary).toBe(false);
  });

  it('keeps explicit playlist selection autoplay behavior for Library', async () => {
    await usePlayerStore.getState().loadYouTubePlaylist('yt-playlist-1');

    const state = usePlayerStore.getState();
    expect(state.selectedPlaylistId).toBe('yt-playlist-1');
    expect(state.loadedPlaylistId).toBe('yt-playlist-1');
    expect(state.currentSong).toEqual(musicTrack);
  });
});

describe('classifyYouTubeFailure', () => {
  // The classifier returns a *code*, so these assertions are about behaviour rather than wording:
  // the same failure must pick the same remedy no matter how the copy is later rewritten.
  it('separates a disabled API from an exhausted quota, because the remedies differ', () => {
    expect(classifyYouTubeFailure(new Error('YouTube API failed: 403 (accessNotConfigured)')).code).toBe('api_disabled');
    expect(classifyYouTubeFailure(new Error('YouTube API failed: 403 (quotaExceeded)')).code).toBe('quota_exceeded');
    expect(classifyYouTubeFailure(new Error('YouTube API failed: 403 (dailyLimitExceeded)')).code).toBe('quota_exceeded');
  });

  it('recognises a Workspace restriction', () => {
    expect(classifyYouTubeFailure(new Error('YouTube API failed: 403 (forbidden)')).code).toBe('account_forbidden');
  });

  it('falls back to a generic access denial for an unclassified 403', () => {
    expect(classifyYouTubeFailure(new Error('YouTube API failed: 403')).code).toBe('access_denied');
  });

  it('treats 401 as an expired authorization', () => {
    const failure = classifyYouTubeFailure(new Error('YouTube API failed: 401'));
    expect(failure.code).toBe('auth_expired');
    expect(isYouTubeAuthFailure(new Error('YouTube API failed: 401'))).toBe(true);
  });

  it('distinguishes the proxy rate limit from the daily quota', () => {
    // Different recoveries: one clears in a minute, the other at midnight Pacific.
    expect(classifyYouTubeFailure(new Error('搜尋次數過多，請 30 秒後再試。')).code).toBe('search_limited');
    expect(classifyYouTubeFailure(new Error('YouTube API failed: 429')).code).toBe('search_limited');
  });

  it('classifies transient upstream failures as retryable', () => {
    expect(classifyYouTubeFailure(new Error('YouTube API failed: 502')).code).toBe('upstream_unavailable');
    expect(classifyYouTubeFailure(new Error('Failed to fetch')).code).toBe('upstream_unavailable');
    expect(classifyYouTubeFailure(new Error('Google Identity Services 載入逾時')).code).toBe('upstream_unavailable');
  });

  it('carries the status as detail without composing a sentence', () => {
    const failure = classifyYouTubeFailure(new Error('YouTube API failed: 502'));
    expect(failure.detail).toBe('502');
    // Never a translated sentence: detail is evidence, and copy lives in the i18n bundle.
    expect(failure.detail).not.toMatch(/[一-龥]/);
  });

  it('never returns an empty code for an unknown error', () => {
    expect(classifyYouTubeFailure(new Error('something odd')).code).toBe('unknown');
    expect(classifyYouTubeFailure(null).code).toBe('unknown');
    expect(classifyYouTubeFailure('').code).toBe('unknown');
  });

  it('does not mistake a timeout for an authorization failure', () => {
    // This is the bug the P1 item was about: a transient failure used to sign the user out.
    expect(isYouTubeAuthFailure(new Error('YouTube API failed: 502'))).toBe(false);
    expect(isYouTubeAuthFailure(new Error('搜尋次數過多'))).toBe(false);
  });
});

describe('loadYouTubePlaylist failure contract', () => {
  /**
   * The bug this pins down: `loadYouTubePlaylist` used to swallow its own errors, so `Library`
   * awaited it, saw success, and navigated to the player - where nothing was loaded and the
   * explanation had been left behind on the page the user just left. A caller cannot decide whether
   * to navigate if it cannot tell success from failure.
   */
  it('rejects instead of resolving when the provider fails', async () => {
    const failing = { getPlaylistTracks: vi.fn().mockRejectedValue(new Error('YouTube API failed: 403 (quotaExceeded)')) };
    usePlayerStore.setState({ ytProvider: failing as never, youtubeToken: 'token' });

    await expect(usePlayerStore.getState().loadYouTubePlaylist('playlist-1')).rejects.toThrow();

    // The reason is still recorded where the player's own UI reads it.
    expect(usePlayerStore.getState().youtubeError).toMatchObject({ code: 'quota_exceeded' });
  });

  it('rejects when there is no token rather than silently doing nothing', async () => {
    usePlayerStore.setState({ youtubeToken: null });
    await expect(usePlayerStore.getState().loadYouTubePlaylist('playlist-1')).rejects.toThrow();
    expect(usePlayerStore.getState().youtubeError).toMatchObject({ code: 'not_connected' });
  });

  it('resolves and clears the error when the load succeeds', async () => {
    const empty = { getPlaylistTracks: vi.fn().mockResolvedValue([]) };
    usePlayerStore.setState({ ytProvider: empty as never, youtubeToken: 'token', youtubeError: { code: 'quota_exceeded' } });

    await usePlayerStore.getState().loadYouTubePlaylist('playlist-1', { autoplay: false });

    expect(usePlayerStore.getState().youtubeError).toBeNull();
    expect(usePlayerStore.getState().loadedPlaylistId).toBe('playlist-1');
  });

  it('explains an empty Spotify queue instead of showing one without a reason', async () => {
    // Since February 2026 the Web API only serves a playlist's contents to its owner or a
    // collaborator; opening anyone else's playlist comes back as an empty array, not an error.
    const spotifyProvider = { getPlaylistTracks: vi.fn().mockResolvedValue([]) };
    usePlayerStore.setState({ activeSource: 'spotify', spotifyToken: 'token', spotifyProvider: spotifyProvider as never, spotifyError: null });

    await usePlayerStore.getState().loadSpotifyPlaylist('someone-elses-playlist');

    expect(usePlayerStore.getState().playlist).toEqual([]);
    expect(usePlayerStore.getState().spotifyError).toContain('只提供');
  });

  it('clears the previous reason when a readable Spotify playlist loads', async () => {
    const spotifyTrack: Song = { ...musicTrack, id: 'track-1', source: 'spotify', audioUrl: 'spotify:track:track-1' };
    // A non-empty playlist also starts playback, so the provider needs its playback call too.
    const spotifyProvider = {
      getPlaylistTracks: vi.fn().mockResolvedValue([spotifyTrack]),
      play: vi.fn().mockResolvedValue(true),
    };
    usePlayerStore.setState({
      activeSource: 'spotify',
      spotifyToken: 'token',
      spotifyProvider: spotifyProvider as never,
      spotifyError: '這個歌單讀不到曲目。',
    });

    await usePlayerStore.getState().loadSpotifyPlaylist('my-own-playlist');

    expect(usePlayerStore.getState().playlist).toEqual([spotifyTrack]);
    expect(usePlayerStore.getState().spotifyError).toBeNull();
  });
});
