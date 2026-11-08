import { create } from 'zustand';
import {
  type Song,
  type LyricData,
  fetchLrcLibLyrics,
  SpotifyProvider,
  YouTubeMusicProvider,
  extractYouTubeVideoId,
  fetchAmllDbLyrics,
  readAmllDbIds,
  isYouTubeApiError,
  parseYouTubeApiErrorMessage,
  type Playlist,
} from '@echora/core';
import {
  beginSpotifyLogin,
  clearSpotifySession,
  finishSpotifyLogin,
  refreshSpotifySession,
  type SpotifySession,
} from '../integrations/spotifyAuth';
import { beginYouTubeLogin, clearYouTubeSession, getStoredYouTubeSession, revokeYouTubeAccessToken, type YouTubeLoginOptions } from '../integrations/youtubeAuth';
import { getBundledDemoLyrics } from './demoLyrics';
import { LOCAL_DEMO_LYRICS, LOCAL_DEMO_SONGS } from './localDemoSongs';
import { recordDiagnostic } from '../lib/diagnostics';
import type { YouTubeFailure } from '../lib/youtubeFailure';
import { isYouTubeVideo } from '../utils/youtubePlayback';
import { IDLE_MEDIA_COMMAND, nextMediaCommand, type MediaCommand } from '../playback/mediaCommand';
import { parseUploadedLyrics, readUploadedLyrics, writeUploadedLyrics } from '../playback/lyricsImport';
import {
  DEFAULT_PLAYBACK_VOLUME,
  applyMuteToggle,
  applyVolumeChange,
  applyVolumeNudge,
  sanitizeStoredVolume,
} from '../playback/volumeState';

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
export type YouTubeConnectionState = 'disconnected' | 'authorizing' | 'syncing' | 'synced' | 'expired' | 'error';

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

type PlaybackSnapshot = Pick<PlayerState, 'currentSong' | 'playlist' | 'currentIndex' | 'currentTime' | 'duration' | 'volume' | 'isMuted'>;

const readPlaybackSnapshot = (): PlaybackSnapshot | null => {
  if (typeof window === 'undefined') return null;
  try {
    const snapshot = JSON.parse(window.localStorage.getItem(PLAYBACK_SNAPSHOT_STORAGE_KEY) || 'null');
    if (!snapshot?.currentSong) return null;
    return {
      ...snapshot,
      currentSong: refreshLocalDemoArtwork(snapshot.currentSong),
      playlist: Array.isArray(snapshot.playlist) ? refreshLocalDemoArtworkList(snapshot.playlist) : [],
      // A snapshot written by the old mute model holds `volume: 0` with no mute flag.
      // Restoring that verbatim is a permanently silent player with no way out, so the
      // level is sanitized and the mute flag is the only thing that can silence it.
      volume: sanitizeStoredVolume(snapshot.volume),
      isMuted: snapshot.isMuted === true,
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
    isMuted: state.isMuted,
  }));
};

const SNAPSHOT_THROTTLE_MS = 2000;
let snapshotTimer: ReturnType<typeof setTimeout> | null = null;
let lastSnapshotAt = 0;

const flushPlaybackSnapshot = (state: PlayerState) => {
  lastSnapshotAt = Date.now();
  writePlaybackSnapshot(state);
  if (snapshotTimer) {
    clearTimeout(snapshotTimer);
    snapshotTimer = null;
  }
};

const schedulePlaybackSnapshot = (state: PlayerState) => {
  if (typeof window === 'undefined' || !state.currentSong) return;
  if (!state.isPlaying || state.playbackState === 'paused' || state.playbackState === 'ended') {
    flushPlaybackSnapshot(state);
    return;
  }
  const wait = Math.max(0, SNAPSHOT_THROTTLE_MS - (Date.now() - lastSnapshotAt));
  if (wait === 0) {
    flushPlaybackSnapshot(state);
    return;
  }
  if (snapshotTimer) return;
  snapshotTimer = setTimeout(() => {
    snapshotTimer = null;
    schedulePlaybackSnapshot(usePlayerStore.getState());
  }, wait);
};

/**
 * Whether a failure means "this token is dead and only a fresh sign-in fixes it".
 *
 * Reads the typed error when there is one, and falls back to the message format for anything that
 * still crosses a module boundary as a string. This replaces the old
 * `.includes('授權已失效')` check, which decided whether to delete a user's session by matching a
 * translated sentence - so editing copy could silently change the security behaviour.
 */
export const isYouTubeAuthFailure = (error: unknown): boolean => {
  if (isYouTubeApiError(error)) return error.isAuthFailure;
  const parsed = error instanceof Error ? parseYouTubeApiErrorMessage(error.message) : null;
  return parsed?.status === 401 || parsed?.reason === 'invalid_grant';
};

/**
 * Classifies a failure.
 *
 * Returns a code, not a sentence. The sentence is composed at render time from the i18n bundle, so
 * it can be translated, shortened for a phone, and corrected without touching this function - and
 * so that nothing in the store has to know how long the text will be. `detail` carries only the
 * piece of raw evidence worth showing (a status, Google's reason); it is never a full message.
 */
export const classifyYouTubeFailure = (error: unknown): YouTubeFailure => {
  const message = error instanceof Error ? error.message : String(error || '');
  if (!message) return { code: 'unknown' };

  if (error instanceof Error && error.name === 'AbortError') return { code: 'upstream_unavailable', detail: 'timeout' };

  const status = isYouTubeApiError(error) ? error.status : parseYouTubeApiErrorMessage(message)?.status;
  const reason = (isYouTubeApiError(error) ? error.reason : parseYouTubeApiErrorMessage(message)?.reason ?? null) || null;

  if (status === 401 || reason === 'invalid_grant') return { code: 'auth_expired' };
  if (status === 403) {
    // The reason is the only reliable discriminator: Google returns 403 for a disabled API, an
    // exhausted quota and a Workspace restriction, and the remedy differs for all three.
    const haystack = `${message} ${reason || ''}`;
    if (/accessNotConfigured|SERVICE_DISABLED/i.test(haystack)) return { code: 'api_disabled', detail: reason || undefined };
    if (/quotaExceeded|rateLimitExceeded|dailyLimitExceeded/i.test(haystack)) return { code: 'quota_exceeded', detail: reason || undefined };
    if (/forbidden|insufficientPermissions/i.test(haystack)) return { code: 'account_forbidden', detail: reason || undefined };
    return { code: 'access_denied', detail: reason || undefined };
  }
  // The search proxy's own limiter, not Google's quota: shorter and self-clearing.
  if (status === 429 || /次數過多|search_limited/i.test(message)) return { code: 'search_limited' };
  if (status === 404) return { code: 'no_playable_video' };
  if (status && status >= 500) return { code: 'upstream_unavailable', detail: String(status) };
  if (/尚未登入|no access token/i.test(message)) return { code: 'not_connected' };
  if (/無法載入|無法開啟|載入逾時|net::|Failed to fetch/i.test(message)) return { code: 'upstream_unavailable' };
  if (/找不到可嵌入|no playable/i.test(message)) return { code: 'no_playable_video' };

  return { code: 'unknown', detail: status ? String(status) : undefined };
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
  /** How the local element's audio is wired: analysed (real spectrum) or native (guaranteed sound). */
  localSpectrum: { mode: 'analyser' | 'direct'; reason: string } | null;
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
  youtubeError: YouTubeFailure | null;
  /**
   * When search may be attempted again.
   *
   * Set after the proxy answers 429 (its per-client limit) or the daily quota is visibly spent.
   * Client-side only and deliberately short-lived: it prevents a pointless call on the next click,
   * not an authoritative quota ledger - the proxy is the only thing that knows that.
   */
  youtubeSearchBlockedUntil: number | null;
  /** A video search is in flight. A status, deliberately not an error. */
  youtubeResolving: boolean;
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
  libraryError: YouTubeFailure | null;
  lastLibrarySyncAt: number | null;
  activeSource: 'spotify' | 'ytmusic' | 'local';
  localError: string | null;
  localCommand: MediaCommand;
  youtubeCommand: MediaCommand;

  // Actions
  play: (song: Song, playlist?: Song[]) => void;
  pause: () => void;
  playPause: () => void;
  next: () => void;
  prev: () => void;
  seek: (time: number) => void;
  tickTime: (delta: number) => void;
  setVolume: (volume: number) => void;
  nudgeVolume: (delta: number) => void;
  toggleMute: () => void;
  setLocalSpectrum: (spectrum: { mode: 'analyser' | 'direct'; reason: string } | null) => void;
  setPlaylist: (playlist: Song[]) => void;
  /** Queue edits from the panel's 播放佇列 tab: replace rows *and* keep the playing index. */
  setQueue: (playlist: Song[], currentIndex: number) => void;
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
  importLyricsText: (raw: string) => boolean;
  loadSourcePlaylists: () => Promise<void>;
  loadSpotifyPlaylist: (playlistId: string) => Promise<void>;
  loadYouTubePlaylist: (playlistId: string, options?: { autoplay?: boolean }) => Promise<void>;
}

/**
 * Word-by-word lyrics from AMLL DB, when the song can be identified there.
 *
 * The catch is identity, not transport: the database is keyed by platform ids, and a YouTube library
 * carries none. `readAmllDbIds` reports whichever ids a song does carry, and a song with none
 * returns `null` without a request - guessing an id from a title would fetch another song's lyrics,
 * which is precisely the failure the scorer exists to prevent.
 */
const fetchWordByWordLyrics = async (song: Song) => {
  const lookups = readAmllDbIds(song);
  for (const lookup of lookups) {
    const lyrics = await fetchAmllDbLyrics(lookup);
    // A single-word-per-line document is not an upgrade over LRCLIB's line timing, so only a real
    // word-timed result replaces the fallback.
    if (lyrics?.isWordByWord && lyrics.lines.length) return lyrics;
  }
  return null;
};

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentSong: null,
  currentLyrics: null,
  isLoadingLyrics: false,
  lyricsStatus: 'unavailable',
  isPlaying: false,
  playbackState: 'idle',
  currentTime: 0,
  duration: 210,
  volume: DEFAULT_PLAYBACK_VOLUME,
  isMuted: false,
  localSpectrum: null,
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
  youtubeSearchBlockedUntil: null,
  youtubeResolving: false,
  youtubeConnectionState: 'disconnected',
  youtubeProfile: null,
  spotifyProvider: new SpotifyProvider(),
  // Core cannot import the web diagnostics store, so the sink is injected here. Swallowed data-layer
  // failures become visible in the diagnostic summary instead of only in a debugger.
  ytProvider: new YouTubeMusicProvider({
    onDiagnostic: event => recordDiagnostic(event.name, event.details),
  }),
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
  localCommand: IDLE_MEDIA_COMMAND,
  youtubeCommand: IDLE_MEDIA_COMMAND,

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
      set({ localCommand: nextMediaCommand(get().localCommand, { action: 'load', url: song.audioUrl, autoplay: true }) });
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
        set({ youtubeCommand: nextMediaCommand(get().youtubeCommand, { action: 'load', url: videoId, autoplay: true }) });
      } else {
        // A song with no video ID is a search-dependent play, and search is the one thing with a
        // 100-call daily budget. Guard the three ways it fails before it starts:
        //
        //   1. Nothing to search for. An empty query is a guaranteed wasted call.
        //   2. Already connected but the quota is visibly gone - a 429 from the proxy means "today's
        //      allowance is spent", and retrying cannot help.
        //   3. A previous failure in this session for the identical query. The user pressing the
        //      same song again should not spend another call to learn the same answer.
        const searchQuery = `${song.title} ${artist}`.trim();
        if (!searchQuery) {
          set({ isPlaying: false, playbackState: 'error', youtubeError: { code: 'missing_query' } });
          return;
        }
        const quotaBlockedUntil = get().youtubeSearchBlockedUntil;
        if (quotaBlockedUntil && quotaBlockedUntil > Date.now()) {
          const minutes = Math.max(1, Math.ceil((quotaBlockedUntil - Date.now()) / 60_000));
          set({ isPlaying: false, playbackState: 'error', youtubeError: { code: 'search_limited', detail: String(minutes) } });
          return;
        }
        // A search in progress is not a failure, so it does not go in `youtubeError` - that would
        // make every screen show an error style for a second. `youtubeResolving` is the status.
        set({ isPlaying: false, playbackState: 'loading', youtubeError: null, youtubeResolving: true });
        void get().ytProvider.searchTracks(searchQuery).then(results => {
          const resolved = extractYouTubeVideoId(results[0]?.audioUrl || results[0]?.id);
          if (resolved) {
            set({ currentSong: { ...song, audioUrl: resolved }, isPlaying: false, playbackState: 'loading', youtubeError: null, youtubeResolving: false });
            set({ youtubeCommand: nextMediaCommand(get().youtubeCommand, { action: 'load', url: resolved, autoplay: true }) });
          } else {
            set({ isPlaying: false, playbackState: 'error', youtubeError: { code: 'no_playable_video' }, youtubeResolving: false });
          }
        }).catch(error => {
          // A quota rejection is not a transient error, so it is remembered rather than retried on
          // the next click. Everything else stays a one-off failure.
          const message = error instanceof Error ? error.message : String(error);
          const quotaExhausted = /額度|次數過多|429/.test(message);
          set({
            isPlaying: false,
            playbackState: 'error',
            youtubeError: classifyYouTubeFailure(error),
            youtubeResolving: false,
            ...(quotaExhausted ? { youtubeSearchBlockedUntil: Date.now() + 10 * 60_000 } : {}),
          });
        });
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
    if (currentSong?.source === 'ytmusic') set({ youtubeCommand: nextMediaCommand(get().youtubeCommand, { action: 'pause' }) });
    if (currentSong?.source === 'local') set({ localCommand: nextMediaCommand(get().localCommand, { action: 'pause' }) });
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
        set({ youtubeCommand: nextMediaCommand(get().youtubeCommand, { action: 'play' }) });
        set({ playbackState: 'loading' });
        return;
      }
      if (currentSong?.source === 'local') {
        recordDiagnostic('play_requested', { source: 'local' });
        set({ localCommand: nextMediaCommand(get().localCommand, { action: 'play' }) });
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
    if (currentSong?.source === 'ytmusic') set({ youtubeCommand: nextMediaCommand(get().youtubeCommand, { action: 'seek', time }) });
    if (currentSong?.source === 'local') set({ localCommand: nextMediaCommand(get().localCommand, { action: 'seek', time }) });
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

  // `volume` always keeps the last audible level; only `isMuted` can silence the output.
  setVolume: (volume) => set(applyVolumeChange({ volume: get().volume, isMuted: get().isMuted }, volume)),

  nudgeVolume: (delta) => set(applyVolumeNudge({ volume: get().volume, isMuted: get().isMuted }, delta)),

  toggleMute: () => set(applyMuteToggle({ volume: get().volume, isMuted: get().isMuted })),

  setLocalSpectrum: (localSpectrum) => set({ localSpectrum }),

  setPlaylist: (playlist) => set({ playlist, currentIndex: 0 }),

  setQueue: (playlist, currentIndex) => set({
    playlist,
    currentIndex: playlist.length === 0 ? 0 : Math.min(Math.max(currentIndex, 0), playlist.length - 1),
  }),

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
    set({ youtubeError: null, youtubeConnectionState: 'authorizing' });
    try {
      const result = await beginYouTubeLogin(options);
      if (result.status === 'cancelled') {
        // The user closed the Google popup. That is a choice, not a failure: returning to the
        // previous state silently is the only honest response.
        set({ youtubeConnectionState: get().youtubeConnected ? 'synced' : 'disconnected', youtubeError: null });
        return;
      }
      if (result.status === 'error' || !result.session) {
        set({ youtubeConnectionState: 'error', youtubeError: { code: result.message ? 'unknown' : 'misconfigured', detail: result.message } });
        return;
      }
      // The popup never navigates, so nothing reloads the app for us: adopt the token, then run the
      // same profile-and-playlist sync the redirect flow used to reach through /oauth/youtube/callback.
      get().ytProvider.setAccessToken(result.session.accessToken);
      set({ youtubeToken: result.session.accessToken, youtubeConnectionState: 'syncing' });
      await get().restoreYouTubeSession();
    } catch (error) {
      set({ youtubeConnectionState: 'error', youtubeError: classifyYouTubeFailure(error) });
    }
  },

  switchYouTubeAccount: async () => {
    get().disconnectYouTube();
    await get().connectYouTube({ selectAccount: true });
  },

  restoreYouTubeSession: async () => {
    const { ytProvider } = get();
    try {
      // No URL to read any more: a GIS token lives in memory, so on a fresh page load this is a
      // no-op and the user is simply disconnected. `getStoredYouTubeSession` is kept as the seam a
      // future backend session will fill.
      const session = getStoredYouTubeSession() || (get().youtubeToken ? { accessToken: get().youtubeToken as string, expiresAt: Date.now() + 60_000 } : null);
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
      const failure = classifyYouTubeFailure(error);
      // Only a genuine authorization failure may drop the token. A timeout, a network blip or a
      // quota 403 leaves the session intact - the plan's P1: one flaky moment used to sign the user
      // out, and `expired` was unreachable because this branch also cleared `youtubeConnected`.
      if (isYouTubeAuthFailure(error)) {
        clearYouTubeSession();
        ytProvider.setAccessToken(null);
        set({ youtubeToken: null, youtubeConnected: false, youtubeConnectionState: 'expired', youtubeProfile: null, userPlaylists: [], selectedPlaylistId: null, loadedPlaylistId: null, libraryError: failure, isSyncingLibrary: false, youtubeError: failure });
      } else {
        set({ youtubeConnected: Boolean(get().youtubeToken), youtubeConnectionState: 'error', isSyncingLibrary: false, libraryError: failure, youtubeError: failure });
      }
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
    const uploaded = readUploadedLyrics(song);
    if (uploaded?.lines?.length) {
      if (get().currentSong?.id === requestedSongId) set({ currentLyrics: { ...uploaded, origin: 'upload', availability: 'available' }, isLoadingLyrics: false, lyricsStatus: 'available' });
      return;
    }

    const bundledLyrics = getBundledDemoLyrics(song);
    if (bundledLyrics) {
      if (get().currentSong?.id === requestedSongId) set({ currentLyrics: { ...bundledLyrics, origin: bundledLyrics.origin || 'bundled', availability: 'available' }, isLoadingLyrics: false, lyricsStatus: 'available' });
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
      // Two sources, in this order, and the order is the cost model:
      //
      //   1. LRCLIB - line-timed, free, no proxy, works for every song.
      //   2. AMLL DB - word-timed, CC0, only for songs that carry a platform id.
      //
      // Word-by-word lyrics are a *nicer* result, not a different answer, so the cheap source is
      // asked first and the expensive one only fills a miss. Doing it the other way round would
      // spend a network round trip on every song to upgrade lyrics that were already right.
      const lyrics = await fetchLrcLibLyrics({
        trackName: song.title,
        artistName,
        albumName: song.album?.name,
        duration: song.durationMs ? song.durationMs / 1000 : undefined,
      });

      const wordByWord = lyrics?.lines?.length ? null : await fetchWordByWordLyrics(song);
      const resolved = wordByWord || lyrics || { title: song.title, artist: artistName, isWordByWord: false, lines: [], availability: 'unavailable' as const };
      if (get().currentSong?.id === requestedSongId) set({ currentLyrics: { ...resolved, origin: resolved.origin || 'lrclib' }, isLoadingLyrics: false, lyricsStatus: resolved.availability || 'available' });
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
        set({ userPlaylists: playlists, selectedPlaylistId: nextSelectedPlaylistId, isSyncingLibrary: false, libraryError: playlists.length ? null : { code: 'empty_library' }, lastLibrarySyncAt: Date.now(), youtubeConnectionState: 'synced', youtubeError: playlists.length ? null : { code: 'empty_library' } });
        if (nextSelectedPlaylistId) {
          await get().loadYouTubePlaylist(nextSelectedPlaylistId, { autoplay: false });
        }
      } else {
        set({ userPlaylists: [], isSyncingLibrary: false, libraryError: null });
      }
    } catch (error) {
      const failure = classifyYouTubeFailure(error);
      if (isYouTubeAuthFailure(error)) {
        clearYouTubeSession();
        ytProvider.setAccessToken(null);
        set({ youtubeToken: null, youtubeConnected: false, youtubeConnectionState: 'expired', youtubeProfile: null, userPlaylists: [], selectedPlaylistId: null, loadedPlaylistId: null, isSyncingLibrary: false, libraryError: failure, youtubeError: failure });
      } else {
        set({ isSyncingLibrary: false, libraryError: failure, youtubeConnectionState: 'error', youtubeError: failure });
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

  /**
   * Loads one playlist into the queue.
   *
   * Throws on failure, deliberately. The caller is a navigation decision - "open this playlist"
   * means "go to the player" - and a caller that cannot tell success from failure navigates anyway,
   * onto a player with nothing in it. `Library` catches this and shows the reason in place.
   */
  loadYouTubePlaylist: async (playlistId, options = {}) => {
    const { ytProvider, youtubeToken } = get();
    if (!youtubeToken) {
      const failure: YouTubeFailure = { code: 'not_connected' };
      set({ youtubeError: failure });
      throw new Error('YouTube 尚未連線');
    }
    let tracks;
    try {
      tracks = await ytProvider.getPlaylistTracks(playlistId);
    } catch (error) {
      // Recorded as well as thrown: the player's own UI reads this state, so a failure that the
      // caller swallows still leaves an explanation where the user will look for it.
      set({ youtubeError: classifyYouTubeFailure(error) });
      throw error;
    }
    set({ playlist: tracks, currentIndex: 0, selectedPlaylistId: playlistId, loadedPlaylistId: playlistId, youtubeError: null });
    if (tracks[0] && options.autoplay !== false) get().play(tracks[0], tracks);
  },

  importLyricsText: (raw) => {
    const song = get().currentSong;
    if (!song) return false;
    const artistName = typeof song.artists[0] === 'string' ? song.artists[0] : song.artists[0]?.name || 'Unknown';
    const parsed = parseUploadedLyrics(raw, song.title, artistName);
    if (!parsed?.lines.length) return false;
    writeUploadedLyrics(song, parsed);
    set({ currentLyrics: parsed, isLoadingLyrics: false, lyricsStatus: 'available' });
    return true;
  },
}));

usePlayerStore.subscribe(state => schedulePlaybackSnapshot(state));

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPlaybackSnapshot(usePlayerStore.getState());
  });
}
