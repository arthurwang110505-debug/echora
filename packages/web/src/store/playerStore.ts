import { create } from 'zustand';
import {
  type Song,
  type LyricData,
  fetchLrcLibLyrics,
  SpotifyProvider,
  YouTubeMusicProvider,
  type Playlist,
} from '@echora/core';
import {
  beginSpotifyLogin,
  clearSpotifySession,
  finishSpotifyLogin,
  refreshSpotifySession,
  type SpotifySession,
} from '../integrations/spotifyAuth';
import { beginYouTubeLogin, clearYouTubeSession, finishYouTubeLogin, getStoredYouTubeSession } from '../integrations/youtubeAuth';
import { DEMO_LYRICS } from './demoLyrics';

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
  isChangingTrack: boolean;
  
  // Service integrations
  spotifyToken: string | null;
  spotifyConnected: boolean;
  spotifyError: string | null;
  youtubeToken: string | null;
  youtubeConnected: boolean;
  youtubeError: string | null;
  youtubeProfile: { name: string; avatarUrl?: string; channelId?: string } | null;
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
  tickTime: (delta: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setPlaylist: (playlist: Song[]) => void;
  setLoopMode: (mode: 'off' | 'list' | 'single') => void;
  setDisplayMode: (mode: DisplayMode) => void;
  setActiveSource: (source: 'spotify' | 'ytmusic' | 'local') => void;
  setSpotifyToken: (token: string | null) => void;
  connectSpotify: () => Promise<void>;
  connectYouTube: () => Promise<void>;
  restoreYouTubeSession: () => Promise<void>;
  disconnectYouTube: () => void;
  restoreSpotifySession: () => Promise<void>;
  disconnectSpotify: () => void;
  syncSpotifyPlayback: () => Promise<void>;
  fetchLyrics: (song: Song) => Promise<void>;
  loadSourcePlaylists: () => Promise<void>;
  loadSpotifyPlaylist: (playlistId: string) => Promise<void>;
  loadYouTubePlaylist: (playlistId: string) => Promise<void>;
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
  isChangingTrack: false,
  
  spotifyToken: null,
  spotifyConnected: false,
  spotifyError: null,
  youtubeToken: null,
  youtubeConnected: false,
  youtubeError: null,
  youtubeProfile: null,
  spotifyProvider: new SpotifyProvider(),
  ytProvider: new YouTubeMusicProvider(),
  userPlaylists: [],
  activeSource: 'spotify',

  play: (song, playlist) => {
    const { spotifyProvider, spotifyToken, youtubeToken, currentSong } = get();
    const isNew = currentSong?.id !== song.id;
    if (isNew) {
      set({ isChangingTrack: true });
      setTimeout(() => set({ isChangingTrack: false }), 700);
    }
    set({
      currentSong: song,
      isPlaying: true,
      currentTime: 0,
      duration: song.durationMs ? Math.round(song.durationMs / 1000) : 210,
      ...(playlist ? { playlist, currentIndex: 0 } : {}),
    });
    if (song.source === 'spotify' && spotifyToken) void spotifyProvider.play(song.audioUrl || `spotify:track:${song.id}`);
    if (song.source === 'ytmusic' && youtubeToken) {
      const artist = typeof song.artists[0] === 'string' ? song.artists[0] : song.artists[0]?.name || '';
      const videoId = song.audioUrl || song.id;
      if (videoId.length === 11) {
        window.dispatchEvent(new CustomEvent('echora:youtube-load', { detail: { videoId, autoplay: true } }));
      } else {
        // The bundled demo cards are metadata-only. Resolve them to a real
        // YouTube video before asking the iframe player to load them.
        void get().ytProvider.searchTracks(`${song.title} ${artist}`).then(results => {
          const resolved = results[0]?.audioUrl || results[0]?.id;
          if (resolved && resolved.length === 11) {
            window.dispatchEvent(new CustomEvent('echora:youtube-load', { detail: { videoId: resolved, autoplay: true } }));
          } else {
            set({ youtubeError: '這首示範歌曲沒有可播放的 YouTube 影片，請改選歌單中的歌曲。' });
          }
        });
      }
    }
    get().fetchLyrics(song);
  },

  pause: () => {
    const { spotifyProvider, spotifyToken, currentSong } = get();
    if (spotifyToken) void spotifyProvider.pause();
    if (currentSong?.source === 'ytmusic') window.dispatchEvent(new CustomEvent('echora:youtube-pause'));
    set({ isPlaying: false });
  },

  playPause: () => {
    const { isPlaying } = get();
    if (isPlaying) get().pause();
    else {
      const { spotifyProvider, spotifyToken, currentSong } = get();
      if (spotifyToken) void spotifyProvider.play(currentSong?.audioUrl || (currentSong ? `spotify:track:${currentSong.id}` : undefined));
      if (currentSong?.source === 'ytmusic') window.dispatchEvent(new CustomEvent('echora:youtube-play'));
      set({ isPlaying: true });
    }
  },

  next: () => {
    const { playlist, currentIndex, loopMode, spotifyProvider, spotifyToken } = get();
    if (playlist.length === 0) return;

    let nextIndex = currentIndex + 1;
    if (nextIndex >= playlist.length) {
      nextIndex = loopMode === 'single' ? currentIndex : 0;
    }

    const nextSong = playlist[nextIndex];
    if (spotifyToken) void spotifyProvider.next();
    set({ isChangingTrack: true, currentIndex: nextIndex, currentSong: nextSong, currentTime: 0 });
    setTimeout(() => set({ isChangingTrack: false }), 700);
    if (nextSong) get().fetchLyrics(nextSong);
  },

  prev: () => {
    const { playlist, currentIndex, spotifyProvider, spotifyToken } = get();
    if (playlist.length === 0) return;
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : playlist.length - 1;
    const prevSong = playlist[prevIndex];
    if (spotifyToken) void spotifyProvider.previous();
    set({ isChangingTrack: true, currentIndex: prevIndex, currentSong: prevSong, currentTime: 0 });
    setTimeout(() => set({ isChangingTrack: false }), 700);
    if (prevSong) get().fetchLyrics(prevSong);
  },

  seek: (time) => {
    const { spotifyProvider, spotifyToken, currentSong } = get();
    if (spotifyToken) void spotifyProvider.seek(time * 1000);
    if (currentSong?.source === 'ytmusic') window.dispatchEvent(new CustomEvent('echora:youtube-seek', { detail: time }));
    set({ currentTime: time });
  },

  tickTime: (delta) => {
    const { isPlaying, currentTime, duration, loopMode, next } = get();
    if (!isPlaying) return;
    const newTime = currentTime + delta;
    if (newTime >= duration) {
      if (loopMode === 'single') {
        set({ currentTime: 0 });
      } else {
        next();
      }
    } else {
      set({ currentTime: newTime });
    }
  },

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
    set({ spotifyToken: token, spotifyConnected: Boolean(token), spotifyError: null });
    if (token) get().loadSourcePlaylists();
  },

  connectSpotify: async () => {
    try {
      set({ spotifyError: null });
      await beginSpotifyLogin();
    } catch (error) {
      set({ spotifyError: error instanceof Error ? error.message : 'Spotify 連線設定不完整' });
    }
  },

  connectYouTube: async () => {
    try { set({ youtubeError: null }); await beginYouTubeLogin(); }
    catch (error) { set({ youtubeError: error instanceof Error ? error.message : 'YouTube 登入設定不完整' }); }
  },

  restoreYouTubeSession: async () => {
    try {
      const session = finishYouTubeLogin() || getStoredYouTubeSession();
      const { ytProvider } = get();
      ytProvider.setAccessToken(session?.accessToken || null);
      set({ youtubeToken: session?.accessToken || null, youtubeConnected: Boolean(session), youtubeError: null });
      if (session) {
        const profile = await ytProvider.getProfile();
        set({ youtubeProfile: profile, activeSource: 'ytmusic' });
        await get().loadSourcePlaylists();
      }
    } catch (error) { set({ youtubeError: error instanceof Error ? error.message : 'YouTube 登入失敗' }); }
  },

  disconnectYouTube: () => { clearYouTubeSession(); get().ytProvider.setAccessToken(null); set({ youtubeToken: null, youtubeConnected: false, youtubeError: null, youtubeProfile: null, userPlaylists: [] }); },

  restoreSpotifySession: async () => {
    try {
      let session: SpotifySession | null = await finishSpotifyLogin();
      if (session && session.expiresAt <= Date.now()) session = await refreshSpotifySession(session);
      const { spotifyProvider } = get();
      spotifyProvider.setAccessToken(session?.accessToken || null);
      set({ spotifyToken: session?.accessToken || null, spotifyConnected: Boolean(session), spotifyError: null });
      if (session) {
        await get().loadSourcePlaylists();
        await get().syncSpotifyPlayback();
      }
    } catch (error) {
      set({ spotifyError: error instanceof Error ? error.message : 'Spotify 連線失敗' });
    }
  },

  disconnectSpotify: () => {
    clearSpotifySession();
    get().spotifyProvider.setAccessToken(null);
    set({ spotifyToken: null, spotifyConnected: false, spotifyError: null, userPlaylists: [] });
  },

  syncSpotifyPlayback: async () => {
    const { spotifyToken, spotifyProvider, currentSong } = get();
    if (!spotifyToken) return;
    const playback = await spotifyProvider.getCurrentlyPlaying();
    if (!playback.song) return;
    const isNewSong = currentSong?.id !== playback.song.id;
    if (isNewSong) {
      set({ isChangingTrack: true });
      setTimeout(() => set({ isChangingTrack: false }), 700);
    }
    set({
      currentSong: playback.song,
      isPlaying: playback.isPlaying,
      currentTime: playback.progressMs / 1000,
      duration: (playback.song.durationMs || 210000) / 1000,
      ...(isNewSong ? { playlist: [playback.song], currentIndex: 0 } : {}),
    });
    if (isNewSong) await get().fetchLyrics(playback.song);
  },

  fetchLyrics: async (song: Song) => {
    // Check bundled demo lyrics first for instant rich experience
    if (DEMO_LYRICS[song.id]) {
      set({ currentLyrics: DEMO_LYRICS[song.id], isLoadingLyrics: false });
      return;
    }

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
        // Fallback demo lyrics
        set({
          currentLyrics: {
            title: song.title,
            artist: artistName,
            isWordByWord: true,
            lines: [
              { fullText: `🎵 [正在播放: ${song.title}]`, startTime: 0, endTime: 5000, words: [{ text: song.title, startTime: 0, endTime: 5000 }] },
              { fullText: `🎤 演唱者: ${artistName}`, startTime: 5000, endTime: 12000, words: [{ text: artistName, startTime: 5000, endTime: 12000 }] },
              { fullText: '✨ 沉浸式 Echora 音樂呼吸舞台啟動中', startTime: 12000, endTime: 20000, words: [{ text: '✨', startTime: 12000, endTime: 14000 }, { text: '沉浸式', startTime: 14000, endTime: 16000 }, { text: 'Echora', startTime: 16000, endTime: 18000 }, { text: '音樂呼吸舞台啟動中', startTime: 18000, endTime: 20000 }] },
              { fullText: '🌟 享受全螢幕 iPad & Mobile 隨身音樂舞台', startTime: 20000, endTime: 30000, words: [{ text: '🌟', startTime: 20000, endTime: 22000 }, { text: '享受全螢幕', startTime: 22000, endTime: 25000 }, { text: 'iPad & Mobile', startTime: 25000, endTime: 28000 }, { text: '隨身音樂舞台', startTime: 28000, endTime: 30000 }] },
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
    const { activeSource, spotifyProvider, ytProvider, spotifyToken, youtubeToken } = get();
    try {
      if (activeSource === 'spotify' && spotifyToken) {
        const playlists = await spotifyProvider.getUserPlaylists();
        set({ userPlaylists: playlists });
      } else if (activeSource === 'ytmusic' && youtubeToken) {
        const playlists = await ytProvider.getUserPlaylists();
        set({ userPlaylists: playlists, youtubeError: playlists.length ? null : 'YouTube 已登入，但 API 沒有回傳可用歌單。請確認這些歌單存在於同一個 YouTube 帳戶。' });
      } else {
        set({ userPlaylists: [] });
      }
    } catch (error) {
      set({ userPlaylists: [], youtubeError: error instanceof Error ? `歌單讀取失敗：${error.message}` : '歌單讀取失敗' });
    }
  },

  loadSpotifyPlaylist: async (playlistId) => {
    const { spotifyProvider, spotifyToken } = get();
    if (!spotifyToken) return;
    const tracks = await spotifyProvider.getPlaylistTracks(playlistId);
    set({ playlist: tracks, currentIndex: 0 });
    if (tracks[0]) get().play(tracks[0], tracks);
  },

  loadYouTubePlaylist: async (playlistId) => {
    const { ytProvider, youtubeToken } = get();
    if (!youtubeToken) return;
    const tracks = await ytProvider.getPlaylistTracks(playlistId);
    set({ playlist: tracks, currentIndex: 0 });
    if (tracks[0]) get().play(tracks[0], tracks);
  },
}));
