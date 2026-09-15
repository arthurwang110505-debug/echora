import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Playlist, Song } from '@echora/core';
import { getYouTubeErrorMessage, usePlayerStore } from './playerStore';

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

describe('getYouTubeErrorMessage', () => {
  it('maps the 403 accessNotConfigured rejection to the enable-API guidance', () => {
    const message = getYouTubeErrorMessage(new Error('YouTube API failed: 403 (accessNotConfigured)'));
    expect(message).toContain('YouTube Data API v3');
    expect(message).not.toContain('YouTube 連線失敗');
  });

  it('maps quota 403 rejections to the daily-quota guidance', () => {
    const message = getYouTubeErrorMessage(new Error('YouTube API failed: 403 (quotaExceeded)'));
    expect(message).toContain('配額');
  });

  it('keeps a generic actionable hint for other 403 rejections', () => {
    const message = getYouTubeErrorMessage(new Error('YouTube API failed: 403'));
    expect(message).toContain('403');
    expect(message).toContain('YouTube Data API v3');
  });

  it('still maps 401 to the re-login guidance and prefixes other errors', () => {
    expect(getYouTubeErrorMessage(new Error('YouTube API failed: 401'))).toContain('授權已失效');
    expect(getYouTubeErrorMessage(new Error('network down'), '歌單讀取失敗')).toBe('歌單讀取失敗：network down');
  });
});
