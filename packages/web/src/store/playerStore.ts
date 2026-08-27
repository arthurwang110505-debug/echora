import { create } from 'zustand';
import {
  type Song,
  type LyricData,
  fetchLrcLibLyrics,
  SpotifyProvider,
  YouTubeMusicProvider,
  extractYouTubeVideoId,
  type Playlist,
} from '@echora/core';
import {
  beginSpotifyLogin,
  clearSpotifySession,
  finishSpotifyLogin,
  refreshSpotifySession,
  type SpotifySession,
} from '../integrations/spotifyAuth';
import { beginYouTubeLogin, clearYouTubeSession, finishYouTubeLogin, getStoredYouTubeSession, revokeYouTubeAccessToken, type YouTubeLoginOptions } from '../integrations/youtubeAuth';
import { getBundledDemoLyrics } from './demoLyrics';
import { LOCAL_DEMO_LYRICS, LOCAL_DEMO_SONGS } from './localDemoSongs';
import { recordDiagnostic } from '../lib/diagnostics';
import { isYouTubeVideo } from '../utils/youtubePlayback';

const RECENT_SONGS_STORAGE_KEY = 'echora.recent-songs';
const FAVORITE_SONGS_STORAGE_KEY = 'echora.favorite-songs';
const PLAYBACK_SNAPSHOT_STORAGE_KEY = 'echora.playback-snapshot';
const MAX_RECENT_SONGS = 12;
const LOCAL_DEMO_SONG_BY_ID = new Map(LOCAL_DEMO_SONGS.map(song => [song.id, song]));

const refreshLocalDemoArtwork = (song: Song): Song => (
  song.source === 'local' ? LOCAL_DEMO_SONG_BY_ID.get(song.id) || song : song
);

const refreshLocalDemoArtworkList = (songs: Song[]): Song[] => songs.map(refreshLocalDemoArtwork);

type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error';
type YouTubeConnectionState = 'disconnected' | 'authorizing' | 'syncing' | 'synced' | 'expired' | 'error';

const readRecentSongs = (): Song[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(RECENT_SONGS_STORAGE_KEY) || '[]');
    return Array.isArray(stored) ? refreshLocalDemoArtworkList(stored).slice(0, MAX_RECENT_SONGS) : [];
  } catch {
    return [];
  }
};

const rememberRecentSong = (song: Song, recentSongs: Song[]) => {
  const next = [song, ...recentSongs.filter(item => item.id !== song.id)].slice(0, MAX_RECENT_SONGS);
  if (typeof window !== 'undefined') window.localStorage.setItem(RECENT_SONGS_STORAGE_KEY, JSON.stringify(next));
  return next;
};

const readFavoriteSongs = (): Song[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(FAVORITE_SONGS_STORAGE_KEY) || '[]');
    return Array.isArray(stored) ? refreshLocalDemoArtworkList(stored).slice(0, MAX_RECENT_SONGS) : [];
  } catch {
    return [];
  }
};

const writeFavoriteSongs = (songs: Song[]) => {
  if (typeof window !== 'undefined') window.localStorage.setItem(FAVORITE_SONGS_STORAGE_KEY, JSON.stringify(songs));
};

const readPlaybackSnapshot = (): Pick<PlayerState, 'currentSong' | 'playlist' | 'currentIndex' | 'currentTime' | 'duration' | 'volume'> | null => {
  if (typeof window === 'undefined') return null;
  try {
    const snapshot = JSON.parse(window.localStorage.getItem(PLAYBACK_SNAPSHOT_STORAGE_KEY) || 'null');
    if (!snapshot?.currentSong) return null;
    return {
      ...snapshot,
      currentSong: refreshLocalDemoArtwork(snapshot.currentSong),
      playlist: Array.isArray(snapshot.playlist) ? refreshLocalDemoArtworkList(snapshot.playlist) : [],
    };
  } catch {
    return null;
  }
};

const writePlaybackSnapshot = (state: PlayerState) => {
  if (typeof window === 'undefined' || !state.currentSong) return;
  window.localStorage.setItem(PLAYBACK_SNAPSHOT_STORAGE_KEY, JSON.stringify({
    currentSong: state.currentSong,
    playlist: state.playlist,
    currentIndex: state.currentIndex,
    currentTime: state.currentTime,
    duration: state.duration,
    volume: state.volume,
  }));
};

const getYouTubeErrorMessage = (error: unknown, prefix = 'YouTube 連線失敗') => {
  const message = error instanceof Error ? error.message : String(error || '未知錯誤');
  return message.includes('401')
    ? 'YouTube 授權已失效，請解除連線後重新使用 Google 登入。'
    : `${prefix}：${message}`;
};

export type DisplayMode = 'stage' | 'full';

interface PlayerState {
  currentSong: Song | null;
  currentLyrics: LyricData | null;
  isLoadingLyrics: boolean;
  lyricsStatus: 'loading' | NonNullable<LyricData['availability']>;
  isPlaying: boolean;
  playbackState: PlaybackState;
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
  youtubeConnectionState: YouTubeConnectionState;
  youtubeProfile: { name: string; avatarUrl?: string; channelId?: string } | null;
  spotifyProvider: SpotifyProvider;
  ytProvider: YouTubeMusicProvider;
  userPlaylists: Playlist[];
  selectedPlaylistId: string | null;
  loadedPlaylistId: string | null;
  recentSongs: Song[];
  favoriteSongs: Song[];
  isSyncingLibrary: boolean;
  libraryError: string | null;
  lastLibrarySyncAt: number | null;
  activeSource: 'spotify' | 'ytmusic' | 'local';
  localError: string | null;

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
  setLocalPlaybackState: (playbackState: PlaybackState, isPlaying: boolean) => void;
  setLocalTime: (currentTime: number, duration?: number) => void;
  setLocalPlaybackError: (message: string) => void;
  toggleFavoriteSong: (song: Song) => void;
  restorePlaybackSnapshot: () => void;
  setSpotifyToken: (token: string | null) => void;
  connectSpotify: () => Promise<void>;
  connectYouTube: (options?: YouTubeLoginOptions) => Promise<void>;
  switchYouTubeAccount: () => Promise<void>;
  restoreYouTubeSession: () => Promise<void>;
  disconnectYouTube: () => void;
  restoreSpotifySession: () => Promise<void>;
  disconnectSpotify: () => void;
  syncSpotifyPlayback: () => Promise<void>;
  fetchLyrics: (song: Song) => Promise<void>;
  loadSourcePlaylists: () => Promise<void>;
  loadSpotifyPlaylist: (playlistId: string) => Promise<void>;
  loadYouTubePlaylist: (playlistId: string, options?: { autoplay?: boolean }) => Promise<void>;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentSong: null,
  currentLyrics: null,
  isLoadingLyrics: false,
  lyricsStatus: 'unavailable',
  isPlaying: false,
  playbackState: 'idle',
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
  youtubeConnectionState: 'disconnected',
  youtubeProfile: null,
  spotifyProvider: new SpotifyProvider(),
  ytProvider: new YouTubeMusicProvider(),
  userPlaylists: [],
  selectedPlaylistId: null,
  loadedPlaylistId: null,
  recentSongs: readRecentSongs(),
  favoriteSongs: readFavoriteSongs(),
  isSyncingLibrary: false,
  libraryError: null,
  lastLibrarySyncAt: null,
  activeSource: 'local',
  localError: null,

  play: (song, playlist) => {
    const { spotifyProvider, spotifyToken, currentSong } = get();
    const isSpotifyUnavailable = song.source === 'spotify' && !spotifyToken;
    const isNew = currentSong?.id !== song.id;
    if (isNew) {
      set({ isChangingTrack: true });
      setTimeout(() => set({ isChangingTrack: false }), 700);
    }
    const recentSongs = rememberRecentSong(song, get().recentSongs);
    set({
      currentSong: song,
      activeSource: song.source === 'spotify' || song.source === 'ytmusic' ? song.source : 'local',
      // A newly mounted YouTube IFrame no longer inherits the homepage click gesture.
      // Local audio waits for the HTML5 Audio element to emit `play`, so blocked autoplay is visible.
      isPlaying: song.source === 'ytmusic' || isSpotifyUnavailable ? false : true,
      playbackState: song.source === 'ytmusic' ? 'loading' : isSpotifyUnavailable ? 'error' : 'playing',
      currentTime: 0,
      duration: song.durationMs ? Math.round(song.durationMs / 1000) : 210,
      localError: null,
      recentSongs,
      ...(playlist ? { playlist, currentIndex: 0 } : {}),
    });
    if (isSpotifyUnavailable) {
      set({ spotifyError: 'Spotify 尚未連線，這首示範歌曲目前不可播放。請先設定 Spotify Client ID，或改用 YouTube Music。' });
      recordDiagnostic('play_requested', { source: 'spotify' });
      void get().fetchLyrics(song);
      return;
    }
    if (song.source === 'spotify' && spotifyToken) void spotifyProvider.play(song.audioUrl || `spotify:track:${song.id}`);
    if (song.source === 'local') {
      recordDiagnostic('song_selected', { source: 'local' });
      window.dispatchEvent(new CustomEvent('echora:local-load', { detail: { audioUrl: song.audioUrl, autoplay: true } }));
      void get().fetchLyrics(song);
      return;
    }
    if (song.source === 'ytmusic') {
      recordDiagnostic('song_selected', { source: 'ytmusic' });
      const artist = typeof song.artists[0] === 'string' ? song.artists[0] : song.artists[0]?.name || '';
      const videoId = extractYouTubeVideoId(song.audioUrl || song.id);
      if (videoId) {
        if (song.audioUrl !== videoId) set({ currentSong: { ...song, audioUrl: videoId } });
        set({ youtubeError: null });
        window.dispatchEvent(new CustomEvent('echora:youtube-load', { detail: { videoId, autoplay: true } }));
      } else {
        set({ isPlaying: false, playbackState: 'loading', youtubeError: '正在查找可播放的 YouTube 影片…' });
        void get().ytProvider.searchTracks(`${song.title} ${artist}`).then(results => {
          const resolved = extractYouTubeVideoId(results[0]?.audioUrl || results[0]?.id);
          if (resolved) {
            set({ currentSong: { ...song, audioUrl: resolved }, isPlaying: false, playbackState: 'loading', youtubeError: null });
            window.dispatchEvent(new CustomEvent('echora:youtube-load', { detail: { videoId: resolved, autoplay: true } }));
          } else {
            set({ isPlaying: false, playbackState: 'error', youtubeError: '找不到可嵌入播放的 YouTube 影片。請改選你的私人歌單曲目，或稍後再試。' });
          }
        }).catch(error => set({ isPlaying: false, playbackState: 'error', youtubeError: getYouTubeErrorMessage(error, '搜尋 YouTube 影片失敗') }));
      }
    }
    if (isYouTubeVideo(song)) {
      set({ currentLyrics: null, isLoadingLyrics: false, lyricsStatus: 'unavailable' });
      return;
    }
    get().fetchLyrics(song);
  },

  pause: () => {
    const { spotifyProvider, spotifyToken, currentSong } = get();
    recordDiagnostic('pause_requested', { source: currentSong?.source || 'none' });
    if (currentSong?.source === 'spotify' && spotifyToken) void spotifyProvider.pause();
    set({ isPlaying: false, playbackState: 'paused' });
    if (currentSong?.source === 'ytmusic') window.dispatchEvent(new CustomEvent('echora:youtube-pause'));
    if (currentSong?.source === 'local') window.dispatchEvent(new CustomEvent('echora:local-pause'));
  },

  playPause: () => {
    const { isPlaying } = get();
    if (isPlaying) get().pause();
    else {
      const { spotifyProvider, spotifyToken, currentSong } = get();
      if (currentSong?.source === 'spotify' && !spotifyToken) {
        set({ isPlaying: false, playbackState: 'error', spotifyError: 'Spotify 尚未連線，請改用 YouTube Music 或先完成 Spotify 設定。' });
        return;
      }
      if (currentSong?.source === 'spotify' && spotifyToken) void spotifyProvider.play(currentSong.audioUrl || `spotify:track:${currentSong.id}`);
      if (currentSong?.source === 'ytmusic') {
        recordDiagnostic('play_requested', { source: 'ytmusic' });
        window.dispatchEvent(new CustomEvent('echora:youtube-play'));
        set({ playbackState: 'loading' });
        return;
      }
      if (currentSong?.source === 'local') {
        recordDiagnostic('play_requested', { source: 'local' });
        window.dispatchEvent(new CustomEvent('echora:local-play'));
        set({ playbackState: 'loading', localError: null });
        return;
      }
      set({ isPlaying: true, playbackState: 'playing' });
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
    set({ isChangingTrack: true, currentIndex: nextIndex, currentTime: 0 });
    setTimeout(() => set({ isChangingTrack: false }), 700);
    if (nextSong?.source === 'ytmusic' || nextSong?.source === 'local') get().play(nextSong);
    else if (nextSong) { set({ currentSong: nextSong }); get().fetchLyrics(nextSong); }
  },

  prev: () => {
    const { playlist, currentIndex, spotifyProvider, spotifyToken } = get();
    if (playlist.length === 0) return;
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : playlist.length - 1;
    const prevSong = playlist[prevIndex];
    if (spotifyToken) void spotifyProvider.previous();
    set({ isChangingTrack: true, currentIndex: prevIndex, currentTime: 0 });
    setTimeout(() => set({ isChangingTrack: false }), 700);
    if (prevSong?.source === 'ytmusic' || prevSong?.source === 'local') get().play(prevSong);
    else if (prevSong) { set({ currentSong: prevSong }); get().fetchLyrics(prevSong); }
  },

  seek: (time) => {
    const { spotifyProvider, spotifyToken, currentSong } = get();
    if (spotifyToken) void spotifyProvider.seek(time * 1000);
    if (currentSong?.source === 'ytmusic') window.dispatchEvent(new CustomEvent('echora:youtube-seek', { detail: time }));
    if (currentSong?.source === 'local') window.dispatchEvent(new CustomEvent('echora:local-seek', { detail: { time } }));
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

  setLocalPlaybackState: (playbackState, isPlaying) => set({ playbackState, isPlaying, localError: playbackState === 'error' ? get().localError : null }),

  setLocalTime: (currentTime, duration) => set({
    currentTime: Math.max(0, currentTime),
    ...(typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? { duration } : {}),
  }),

  setLocalPlaybackError: (message) => set({ isPlaying: false, playbackState: 'error', localError: message }),

  toggleFavoriteSong: (song) => {
    const current = get().favoriteSongs;
    const exists = current.some(item => item.source === song.source && item.id === song.id);
    const next = exists
      ? current.filter(item => !(item.source === song.source && item.id === song.id))
      : [song, ...current.filter(item => !(item.source === song.source && item.id === song.id))].slice(0, MAX_RECENT_SONGS);
    writeFavoriteSongs(next);
    set({ favoriteSongs: next });
  },

  restorePlaybackSnapshot: () => {
    const snapshot = readPlaybackSnapshot();
    if (!snapshot?.currentSong) return;
    const activeSource = snapshot.currentSong.source === 'spotify' || snapshot.currentSong.source === 'ytmusic'
      ? snapshot.currentSong.source
      : 'local';
    set({ ...snapshot, activeSource, isPlaying: false, playbackState: 'paused' });
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

  connectYouTube: async (options = {}) => {
    try { set({ youtubeError: null, youtubeConnectionState: 'authorizing' }); await beginYouTubeLogin(options); }
    catch (error) { set({ youtubeConnectionState: 'error', youtubeError: error instanceof Error ? error.message : 'YouTube 登入設定不完整' }); }
  },

  switchYouTubeAccount: async () => {
    get().disconnectYouTube();
    await get().connectYouTube({ selectAccount: true });
  },

  restoreYouTubeSession: async () => {
    const { ytProvider } = get();
    try {
      const session = finishYouTubeLogin() || getStoredYouTubeSession();
      if (!session) {
        ytProvider.setAccessToken(null);
        set({ youtubeToken: null, youtubeConnected: false, youtubeConnectionState: 'disconnected', youtubeError: null, youtubeProfile: null, userPlaylists: [], selectedPlaylistId: null, loadedPlaylistId: null, libraryError: null, isSyncingLibrary: false });
        return;
      }
      ytProvider.setAccessToken(session.accessToken);
      const profile = await ytProvider.getProfile();
      if (!profile) throw new Error('此帳號沒有可供 YouTube Data API 使用的頻道。');
      set({ youtubeToken: session.accessToken, youtubeConnected: true, youtubeConnectionState: 'syncing', youtubeError: null, youtubeProfile: profile, activeSource: 'ytmusic', libraryError: null });
      await get().loadSourcePlaylists();
    } catch (error) {
      clearYouTubeSession();
      ytProvider.setAccessToken(null);
      const message = getYouTubeErrorMessage(error);
      set({ youtubeToken: null, youtubeConnected: false, youtubeConnectionState: message.includes('授權已失效') ? 'expired' : 'error', youtubeProfile: null, userPlaylists: [], selectedPlaylistId: null, loadedPlaylistId: null, libraryError: message, isSyncingLibrary: false, youtubeError: message });
    }
  },

  disconnectYouTube: () => {
    const accessToken = get().youtubeToken;
    void revokeYouTubeAccessToken(accessToken);
    clearYouTubeSession();
    get().ytProvider.setAccessToken(null);
    set({ youtubeToken: null, youtubeConnected: false, youtubeConnectionState: 'disconnected', youtubeError: null, youtubeProfile: null, userPlaylists: [], selectedPlaylistId: null, loadedPlaylistId: null, libraryError: null, isSyncingLibrary: false, lastLibrarySyncAt: null });
  },

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
      playbackState: playback.isPlaying ? 'playing' : 'paused',
      currentTime: playback.progressMs / 1000,
      duration: (playback.song.durationMs || 210000) / 1000,
      ...(isNewSong ? { playlist: [playback.song], currentIndex: 0 } : {}),
    });
    if (isNewSong) await get().fetchLyrics(playback.song);
  },

  fetchLyrics: async (song: Song) => {
    const requestedSongId = song.id;
    // Check bundled demo lyrics first for an instant rich experience. The fallback
    // keeps lyrics when a restored/provider song has replaced the catalog id with
    // a canonical YouTube video id.
    const bundledLyrics = getBundledDemoLyrics(song);
    if (bundledLyrics) {
      if (get().currentSong?.id === requestedSongId) set({ currentLyrics: { ...bundledLyrics, availability: 'available' }, isLoadingLyrics: false, lyricsStatus: 'available' });
      return;
    }

    const artistName = typeof song.artists[0] === 'string'
      ? (song.artists[0] as unknown as string)
      : song.artists[0]?.name || 'Unknown';
    if (song.source === 'local') {
      const lyrics = LOCAL_DEMO_LYRICS[song.id];
      if (get().currentSong?.id === requestedSongId) set({
        currentLyrics: lyrics ? { ...lyrics, availability: 'available' } : { title: song.title, artist: artistName, isWordByWord: false, lines: [], availability: 'unavailable' },
        isLoadingLyrics: false,
        lyricsStatus: lyrics ? 'available' : 'unavailable',
      });
      return;
    }
    // Never leave the previous song's lines on screen while a new request is pending.
    set({ currentLyrics: null, isLoadingLyrics: true, lyricsStatus: 'loading' });
    try {
      const lyrics = await fetchLrcLibLyrics({
        trackName: song.title,
        artistName,
        albumName: song.album?.name,
        duration: song.durationMs ? song.durationMs / 1000 : undefined,
      });

      const resolved = lyrics || { title: song.title, artist: artistName, isWordByWord: false, lines: [], availability: 'unavailable' as const };
      if (get().currentSong?.id === requestedSongId) set({ currentLyrics: resolved, isLoadingLyrics: false, lyricsStatus: resolved.availability || 'available' });
    } catch {
      if (get().currentSong?.id === requestedSongId) set({ currentLyrics: { title: song.title, artist: artistName, isWordByWord: false, lines: [], availability: 'error' }, isLoadingLyrics: false, lyricsStatus: 'error' });
    }
  },

  loadSourcePlaylists: async () => {
    const { activeSource, spotifyProvider, ytProvider, spotifyToken, youtubeToken } = get();
    if (activeSource === 'ytmusic' && youtubeToken) set({ isSyncingLibrary: true, libraryError: null, youtubeConnectionState: 'syncing' });
    try {
      if (activeSource === 'spotify' && spotifyToken) {
        const playlists = await spotifyProvider.getUserPlaylists();
        set({ userPlaylists: playlists, isSyncingLibrary: false, libraryError: null, lastLibrarySyncAt: Date.now() });
      } else if (activeSource === 'ytmusic' && youtubeToken) {
        const playlists = await ytProvider.getUserPlaylists();
        const selectedPlaylistId = get().selectedPlaylistId;
        const nextSelectedPlaylistId = selectedPlaylistId && playlists.some(playlist => playlist.id === selectedPlaylistId)
          ? selectedPlaylistId
          : playlists[0]?.id || null;
        set({ userPlaylists: playlists, selectedPlaylistId: nextSelectedPlaylistId, isSyncingLibrary: false, libraryError: playlists.length ? null : 'YouTube 已登入，但 API 沒有回傳可用歌單。請確認這些歌單存在於同一個 YouTube 帳戶。', lastLibrarySyncAt: Date.now(), youtubeConnectionState: 'synced', youtubeError: playlists.length ? null : 'YouTube 已登入，但 API 沒有回傳可用歌單。請確認這些歌單存在於同一個 YouTube 帳戶。' });
        if (nextSelectedPlaylistId) {
          await get().loadYouTubePlaylist(nextSelectedPlaylistId, { autoplay: false });
        }
      } else {
        set({ userPlaylists: [], isSyncingLibrary: false, libraryError: null });
      }
    } catch (error) {
      const message = getYouTubeErrorMessage(error, '歌單讀取失敗');
      if (message.includes('授權已失效')) {
        clearYouTubeSession();
        ytProvider.setAccessToken(null);
        set({ youtubeToken: null, youtubeConnected: false, youtubeConnectionState: 'expired', youtubeProfile: null, userPlaylists: [], selectedPlaylistId: null, loadedPlaylistId: null, isSyncingLibrary: false, libraryError: message, youtubeError: message });
      } else {
        set({ isSyncingLibrary: false, libraryError: message, youtubeConnectionState: 'error', youtubeError: message });
      }
    }
  },

  loadSpotifyPlaylist: async (playlistId) => {
    const { spotifyProvider, spotifyToken } = get();
    if (!spotifyToken) return;
    const tracks = await spotifyProvider.getPlaylistTracks(playlistId);
    set({ playlist: tracks, currentIndex: 0 });
    if (tracks[0]) get().play(tracks[0], tracks);
  },

  loadYouTubePlaylist: async (playlistId, options = {}) => {
    const { ytProvider, youtubeToken } = get();
    if (!youtubeToken) return;
    const tracks = await ytProvider.getPlaylistTracks(playlistId);
    set({ playlist: tracks, currentIndex: 0, selectedPlaylistId: playlistId, loadedPlaylistId: playlistId });
    if (tracks[0] && options.autoplay !== false) get().play(tracks[0], tracks);
  },
}));

usePlayerStore.subscribe(state => writePlaybackSnapshot(state));
