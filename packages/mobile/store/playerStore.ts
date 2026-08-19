import { create } from 'zustand';
import {
  type Song,
  type LyricData,
  fetchLrcLibLyrics,
  SpotifyProvider,
  YouTubeMusicProvider,
  type Playlist,
} from '@echora/core';

export type DisplayMode = 'stage' | 'full';

interface PlayerState {
  currentSong: Song | null;
  currentLyrics: LyricData | null;
  isLoadingLyrics: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playlist: Song[];
  currentIndex: number;
  loopMode: 'off' | 'list' | 'single';
  displayMode: DisplayMode;
  
  spotifyToken: string | null;
  spotifyProvider: SpotifyProvider;
  ytProvider: YouTubeMusicProvider;
  userPlaylists: Playlist[];
  activeSource: 'spotify' | 'ytmusic' | 'local';

  // Actions
  play: (song: Song, playlist?: Song[]) => void;
  pause: () => void;
  playPause: () => void;
  next: () => void;
  prev: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setPlaylist: (playlist: Song[]) => void;
  setLoopMode: (mode: 'off' | 'list' | 'single') => void;
  setDisplayMode: (mode: DisplayMode) => void;
  setActiveSource: (source: 'spotify' | 'ytmusic' | 'local') => void;
  setSpotifyToken: (token: string | null) => void;
  fetchLyrics: (song: Song) => Promise<void>;
  loadSourcePlaylists: () => Promise<void>;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentSong: null,
  currentLyrics: null,
  isLoadingLyrics: false,
  isPlaying: false,
  currentTime: 0,
  duration: 210,
  volume: 0.8,
  isMuted: false,
  playlist: [],
  currentIndex: 0,
  loopMode: 'list',
  displayMode: 'full',

  spotifyToken: null,
  spotifyProvider: new SpotifyProvider(),
  ytProvider: new YouTubeMusicProvider(),
  userPlaylists: [],
  activeSource: 'spotify',

  play: (song, playlist) => {
    set({
      currentSong: song,
      isPlaying: true,
      currentTime: 0,
      duration: song.durationMs ? Math.round(song.durationMs / 1000) : 210,
      ...(playlist ? { playlist, currentIndex: 0 } : {}),
    });
    get().fetchLyrics(song);
  },

  pause: () => set({ isPlaying: false }),

  playPause: () => {
    const { isPlaying } = get();
    set({ isPlaying: !isPlaying });
  },

  next: () => {
    const { playlist, currentIndex, loopMode } = get();
    if (playlist.length === 0) return;

    let nextIndex = currentIndex + 1;
    if (nextIndex >= playlist.length) {
      nextIndex = loopMode === 'single' ? currentIndex : 0;
    }

    const nextSong = playlist[nextIndex];
    set({ currentIndex: nextIndex, currentSong: nextSong, currentTime: 0 });
    if (nextSong) get().fetchLyrics(nextSong);
  },

  prev: () => {
    const { playlist, currentIndex } = get();
    if (playlist.length === 0) return;

    const prevIndex = currentIndex > 0 ? currentIndex - 1 : playlist.length - 1;
    const prevSong = playlist[prevIndex];
    set({ currentIndex: prevIndex, currentSong: prevSong, currentTime: 0 });
    if (prevSong) get().fetchLyrics(prevSong);
  },

  seek: (time) => set({ currentTime: time }),

  setVolume: (volume) => set({ volume, isMuted: volume === 0 }),

  toggleMute: () => {
    const { isMuted, volume } = get();
    set({ isMuted: !isMuted, volume: isMuted ? volume : 0 });
  },

  setPlaylist: (playlist) => set({ playlist, currentIndex: 0 }),

  setLoopMode: (loopMode) => set({ loopMode }),

  setDisplayMode: (displayMode) => set({ displayMode }),

  setActiveSource: (activeSource) => {
    set({ activeSource });
    get().loadSourcePlaylists();
  },

  setSpotifyToken: (token) => {
    const { spotifyProvider } = get();
    spotifyProvider.setAccessToken(token);
    set({ spotifyToken: token });
    if (token) get().loadSourcePlaylists();
  },

  fetchLyrics: async (song: Song) => {
    set({ isLoadingLyrics: true });
    try {
      const artistName = typeof song.artists[0] === 'string'
        ? (song.artists[0] as unknown as string)
        : song.artists[0]?.name || 'Unknown';

      const lyrics = await fetchLrcLibLyrics({
        trackName: song.title,
        artistName,
        albumName: song.album?.name,
        duration: song.durationMs ? song.durationMs / 1000 : undefined,
      });

      if (lyrics) {
        set({ currentLyrics: lyrics, isLoadingLyrics: false });
      } else {
        set({
          currentLyrics: {
            title: song.title,
            artist: artistName,
            lines: [
              { fullText: `🎵 [正在播放: ${song.title}]`, startTime: 0, endTime: 5000, words: [{ text: song.title, startTime: 0, endTime: 5000 }] },
              { fullText: `🎤 演唱者: ${artistName}`, startTime: 5000, endTime: 12000, words: [{ text: artistName, startTime: 5000, endTime: 12000 }] },
              { fullText: '✨ 沉浸式 Echora AI 流光歌詞模式啟動中', startTime: 12000, endTime: 20000, words: [{ text: '✨ 沉浸式 Echora AI 流光歌詞模式啟動中', startTime: 12000, endTime: 20000 }] },
              { fullText: '🌟 享受全螢幕 iPad & Mobile 隨身音樂舞台', startTime: 20000, endTime: 30000, words: [{ text: '🌟 享受全螢幕 iPad & Mobile 隨身音樂舞台', startTime: 20000, endTime: 30000 }] },
            ],
          },
          isLoadingLyrics: false,
        });
      }
    } catch {
      set({ isLoadingLyrics: false });
    }
  },

  loadSourcePlaylists: async () => {
    const { activeSource, spotifyProvider, ytProvider, spotifyToken } = get();
    if (activeSource === 'spotify' && spotifyToken) {
      const playlists = await spotifyProvider.getUserPlaylists();
      set({ userPlaylists: playlists });
    } else if (activeSource === 'ytmusic') {
      const playlists = await ytProvider.getFeaturedPlaylists();
      set({ userPlaylists: playlists });
    } else {
      set({ userPlaylists: [] });
    }
  },
}));
