import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ClipboardList, Pause, Play, Settings2, SkipBack, SkipForward, Smartphone, Sparkles, X } from 'lucide-react';
import { usePlayer } from '../contexts/PlayerContext';
import { useTheme } from '../contexts/ThemeProvider';
import { type Song } from '@echora/core';
import type { Playlist } from '@echora/core';
import YouTubePlayer from '../components/YouTubePlayer';
import { spotifyClientId } from '../integrations/spotifyAuth';
import { useDialogFocus } from '../hooks/useDialogFocus';
import LyriclessSoundscapeStage from '../components/LyriclessSoundscapeStage';
import { CoverImage, PanelSkeleton, PlayerSkeleton, StageSkeleton } from '../components/LoadingSkeletons';
import { adjustLyricsOffset, getActiveLyricIndex, LYRICS_OFFSET_STEP_SECONDS } from '../utils/lyrics/activeLine';
import { lazyWithRetry } from '../utils/recovery';
import { isYouTubeVideo } from '../utils/youtubePlayback';

const OriginalFoliaVisualizerStage = lazyWithRetry(
  () => import('../components/OriginalFoliaVisualizerStage'),
  'stage-visualizer',
);
const OriginalFoliaTuningPanel = lazyWithRetry(
  () => import('../components/OriginalFoliaTuningPanel'),
  'stage-tuning-panel',
);

export default function Player() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    currentSong,
    currentLyrics,
    fetchLyrics,
    isPlaying,
    currentTime,
    duration,
    playPause,
    pause,
    next,
    prev,
    seek,
    displayMode,
    setDisplayMode,
    activeSource,
    setActiveSource,
    spotifyConnected,
    spotifyError,
    connectSpotify,
    disconnectSpotify,
    userPlaylists,
    playlist,
    play,
    loadSpotifyPlaylist,
    youtubeConnected,
    youtubeError,
    connectYouTube,
    switchYouTubeAccount,
    disconnectYouTube,
    loadYouTubePlaylist,
    isChangingTrack,
    isLoadingLyrics,
    lyricsStatus,
    playbackState,
    localError,
  } = usePlayer();
  const { currentTheme } = useTheme();

  const [activeVisualizer, setActiveVisualizer] = useState('classic');
  const [autoVisualizer, setAutoVisualizer] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showPlaylistDrawer, setShowPlaylistDrawer] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768);
  const connectModalRef = useRef<HTMLDivElement>(null);
  const closeConnectModal = useCallback(() => setShowConnectModal(false), []);
  useDialogFocus(showConnectModal, connectModalRef, closeConnectModal);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreviewTime, setSeekPreviewTime] = useState<number | null>(null);
  const [backgroundMode, setBackgroundMode] = useState('latent');
  const [showTuning, setShowTuning] = useState(false);
  const [showCalibration, setShowCalibration] = useState(false);
  const [showStageSettings, setShowStageSettings] = useState(false);
  const stageSettingsRef = useRef<HTMLDivElement>(null);
  const [visualizerTunings, setVisualizerTunings] = useState<Record<string, any>>({});
  const [lyricsOffsetSeconds, setLyricsOffsetSeconds] = useState(0);
  const stageRootRef = useRef<HTMLDivElement>(null);
  const spotifyAvailable = Boolean(spotifyClientId);
  const demoMode = location.state?.demo === true || new URLSearchParams(location.search).get('demo') === '1';
  const isYouTubeVideoMode = isYouTubeVideo(currentSong);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('youtube') !== 'error') return;
    setActiveSource('ytmusic');
    setShowConnectModal(true);
    params.delete('youtube');
    const nextQuery = params.toString();
    window.history.replaceState({}, document.title, `${location.pathname}${nextQuery ? `?${nextQuery}` : ''}${location.hash}`);
  }, [location.hash, location.pathname, location.search]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setHasHydrated(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    // Snapshots intentionally omit lyric payloads; recover them after the route
    // hydrates so a direct /player visit never falls into the lyricless stage.
    if (!hasHydrated || !currentSong || currentLyrics || isLoadingLyrics) return;
    if (isYouTubeVideo(currentSong)) return;
    void fetchLyrics(currentSong);
  }, [currentSong, currentLyrics, fetchLyrics, hasHydrated, isLoadingLyrics]);

  useEffect(() => {
    if (isYouTubeVideoMode && displayMode === 'stage') setDisplayMode('full');
  }, [displayMode, isYouTubeVideoMode, setDisplayMode]);

  const handlePlayPause = () => {
    // Playback must not reset a user-selected Folia renderer. YouTube transport
    // state and visualizer state are independent; only an explicit fallback action
    // may change the active mode.
    if (isPlaying) pause();
    else playPause();
  };

  const enterImmersiveStage = async () => {
    setDisplayMode('stage');
    setShowCalibration(false);
    setShowStageSettings(false);
    const element = stageRootRef.current;
    if (element && document.fullscreenElement !== element) {
      try { await element.requestFullscreen(); } catch { /* iOS Safari may reject programmatic fullscreen. */ }
    }
    try {
      const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> };
      await orientation.lock?.('landscape');
    } catch { /* orientation lock is unavailable on some mobile browsers. */ }
  };

  const leaveImmersiveStage = async () => {
    setDisplayMode('full');
    setShowStageSettings(false);
    setShowCalibration(false);
    setShowTuning(false);
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { /* browser already exited fullscreen */ }
    }
  };

  useEffect(() => {
    if (!autoVisualizer) return;
    const timer = window.setInterval(() => {
      if (!isPlaying) return;
      const energy = (Math.sin(currentTime * 5.2) + Math.sin(currentTime * 3.1 + 1) + 2) / 4;
      const next = energy > 0.72 ? 'claddagh' : energy > 0.45 ? 'cadenza' : 'classic';
      setActiveVisualizer(current => current === next ? current : next);
    }, 500);
    return () => window.clearInterval(timer);
  }, [autoVisualizer, currentTime, isPlaying]);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && displayMode === 'stage') setDisplayMode('full');
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [displayMode, setDisplayMode]);

  useEffect(() => {
    if (!showStageSettings) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!stageSettingsRef.current?.contains(event.target as Node)) setShowStageSettings(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowStageSettings(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showStageSettings]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !event.repeat && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        handlePlayPause();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlePlayPause]);

  useEffect(() => {
    setLyricsOffsetSeconds(0);
  }, [currentSong?.id]);

  const returnToPlaylist = async () => {
    // Keep the user in the player and reveal the playlist surface they asked for.
    // The previous implementation navigated home, which made the "← 歌單" control feel broken.
    setShowPlaylistDrawer(true);
    await leaveImmersiveStage();
  };

  // Use the same offset-aware clock for the player chrome and every visualizer mode.
  const activeLineIndex = useMemo(() => {
    const playbackTime = (isSeeking && seekPreviewTime !== null) ? seekPreviewTime : currentTime;
    return getActiveLyricIndex({
      lines: currentLyrics?.lines || [],
      currentTimeSeconds: playbackTime,
      durationSeconds: duration,
      offsetSeconds: lyricsOffsetSeconds,
    });
  }, [currentLyrics, currentTime, isSeeking, seekPreviewTime, duration, lyricsOffsetSeconds]);

  if (!currentSong && !hasHydrated) {
    return <PlayerSkeleton />;
  }

  const lyricsOffsetLabel = lyricsOffsetSeconds === 0
    ? '已同步'
    : `${lyricsOffsetSeconds > 0 ? '+' : ''}${lyricsOffsetSeconds.toFixed(2)} 秒`;
  const adjustStageLyricsOffset = (deltaSeconds: number) => {
    setLyricsOffsetSeconds(value => adjustLyricsOffset(value, deltaSeconds));
  };

  if (!currentSong) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#07090e] text-white gap-5 p-6 selection:bg-[#62f5c4] selection:text-black">
        <div className="w-20 h-20 rounded-3xl bg-[#62f5c4]/10 border border-[#62f5c4]/30 flex items-center justify-center text-4xl shadow-[0_0_30px_rgba(98,245,196,0.2)] animate-pulse">
          <Sparkles aria-hidden="true" className="h-9 w-9 text-[#62f5c4]" />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-bold font-heading text-white">尚未選擇播放歌曲</h2>
          <p className="text-sm text-slate-400">挑選一首喜愛的曲目，開啟 Echora 音樂呼吸舞台</p>
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/app')}
            className="px-7 py-3.5 rounded-2xl bg-gradient-to-r from-[#62f5c4] via-teal-300 to-emerald-400 text-black font-extrabold text-sm shadow-[0_10px_30px_rgba(98,245,196,0.25)] hover:brightness-110 btn-spring"
          >
            返回主頁探索歌曲 <ArrowRight aria-hidden="true" className="ml-1.5 inline-block h-4 w-4 align-[-3px]" />
          </button>
          <button
            type="button"
            onClick={() => navigate('/library')}
            className="rounded-2xl border border-white/15 bg-white/[0.06] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/[0.12]"
          >
            前往我的音樂庫
          </button>
        </div>
      </div>
    );
  }

  const activeArtist = typeof currentSong.artists[0] === 'string'
    ? currentSong.artists[0]
    : currentSong.artists[0]?.name || 'Unknown Artist';

  const displayedTime = (isSeeking && seekPreviewTime !== null) ? seekPreviewTime : currentTime;
  const displayedLyricsTime = Math.max(0, displayedTime + lyricsOffsetSeconds);
  const queueSources = Array.from(new Set(playlist.map(song => song.source)));
  const queueLabel = queueSources.length > 1 ? '混合服務佇列' : queueSources[0] === 'ytmusic' ? 'YouTube Music 佇列' : queueSources[0] === 'spotify' ? 'Spotify 佇列' : queueSources[0] === 'local' ? '本機展示佇列' : '目前播放佇列';
  const getSourceLabel = (source: Song['source']) => source === 'ytmusic' ? 'YT Music' : source === 'spotify' ? 'Spotify' : '本機音檔';
  const showLyriclessSoundscape = !isLoadingLyrics && !currentLyrics?.lines?.length;
  const lyricsStageStatus = (() => {
    if (isLoadingLyrics || lyricsStatus === 'loading') return { title: '正在載入歌詞', copy: '準備完成後，舞台會顯示同步歌詞或說明為何無法取得。' };
    if (currentSong.source === 'ytmusic' && !isPlaying && !youtubeError) return { title: playbackState === 'buffering' || playbackState === 'loading' ? 'YouTube 正在準備播放' : '等待你在 YouTube 開始播放', copy: '請在原生播放器按下播放鍵，開始有聲播放與歌詞同步。' };
    if (currentSong.source === 'local' && !isPlaying && playbackState === 'loading') return { title: '本機音檔已準備', copy: '按下播放即可在不登入 YouTube Music 的情況下體驗 Echora 展示舞台。' };
    if (currentLyrics?.lines?.length) return currentSong.source === 'local'
      ? { title: '展示轉錄歌詞', copy: '這些歌詞是依對應展示音檔轉錄的同步草稿；若有些微偏移，可用下方「提前／同步／延後」微調。' }
      : { title: '同步歌詞可用', copy: '若文字與音樂有偏移，可用下方「提前／同步／延後」微調。' };
    if (localError) return { title: '本機音檔播放失敗', copy: localError };
    return { title: lyricsStatus === 'instrumental' ? '這是一首純音樂內容' : lyricsStatus === 'error' ? '歌詞暫時無法載入' : '這首歌目前沒有同步歌詞', copy: lyricsStatus === 'error' ? '請稍後重試或繼續使用真實播放時間與視覺舞台。' : currentSong.source === 'local' ? '這首展示音檔尚未附帶可核對的同步歌詞，之後可匯入 .lrc 或 .vtt。' : '你可以繼續播放、選擇其他曲目，或使用視覺舞台。' };
  })();

  return (
    <div
      ref={stageRootRef}
      className={`echora-immersive-stage relative flex h-screen w-full select-none flex-col overflow-hidden font-sans transition-colors duration-700 ${isYouTubeVideoMode ? 'bg-[#07090e]' : 'ambient-grain'}`}
      style={{ backgroundColor: isYouTubeVideoMode ? '#07090e' : (currentTheme.backgroundColor || '#07090e') }}
    >
      {/* Dynamic Music-Reactive Blurred Backdrop with 800ms Crossfade */}
      {!isYouTubeVideoMode && <div
        className={`absolute inset-0 z-0 overflow-hidden pointer-events-none transition-all duration-700 ${
          isChangingTrack ? 'opacity-30 scale-105 blur-2xl' : 'opacity-100 scale-100'
        }`}
      >
        {/* Background Artwork Field */}
        <div
          className="absolute inset-0 bg-cover bg-center filter blur-[90px] opacity-25 scale-125 transition-all duration-700"
          style={{ backgroundImage: `url(${currentSong.coverUrl})` }}
        />

        {/* Ambient Floating Glow Blobs (Pauses smoothly when playback paused) */}
        <div className={`absolute inset-0 opacity-40 blur-3xl ${!isPlaying ? 'paused-motion' : ''}`}>
          <div
            className="absolute -top-40 -left-40 w-[40rem] h-[40rem] rounded-full animate-blob-1"
            style={{ background: currentTheme.accentColor || '#62f5c4' }}
          />
          <div
            className="absolute -bottom-40 -right-40 w-[40rem] h-[40rem] rounded-full animate-blob-2"
            style={{ background: currentTheme.primaryColor || '#6366f1' }}
          />
        </div>
      </div>}

      {/* Top Navigation Header — not rendered in immersive mode so it cannot become a hidden tab stop. */}
      {displayMode !== 'stage' && <header className="relative z-20 flex flex-wrap items-center justify-between gap-3 px-3 py-3 glass-panel border-b border-white/[0.08] sm:px-5 sm:py-3.5 md:flex-nowrap md:gap-0 md:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-5">
          <button
            onClick={() => navigate('/app')}
            className="min-h-11 min-w-11 shrink-0 rounded-2xl bg-white/[0.05] p-2.5 text-white backdrop-blur-md btn-spring hover:bg-white/[0.12]"
            title="返回主頁"
            aria-label="返回主頁"
          >
                          <ArrowLeft aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />

          </button>

          {/* App Brand Tag */}
          <div className="hidden sm:flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#62f5c4] via-teal-400 to-indigo-500 text-xs font-black text-black shadow-[0_0_12px_rgba(98,245,196,0.3)]">F</span>
            <span className="font-heading text-sm font-extrabold tracking-wider text-white">ECHORA STAGE</span>
          </div>

          {/* Responsive Segmented Mode Controller */}
          <div className="flex min-w-0 flex-1 rounded-2xl border border-white/[0.08] bg-white/[0.06] p-1 backdrop-blur-md sm:flex-none">
            <button
              onClick={() => void leaveImmersiveStage()}
              className="min-h-11 min-w-0 flex-1 rounded-xl px-2 py-1.5 text-[11px] font-bold text-black shadow-md transition-all duration-200 btn-spring bg-gradient-to-r from-[#62f5c4] to-teal-400 sm:flex-none sm:px-4 sm:text-xs"
            >
              <Smartphone aria-hidden="true" className="mr-1.5 inline-block h-4 w-4 align-[-3px]" />播放器
            </button>
            {!isYouTubeVideoMode && <button
              onClick={() => void enterImmersiveStage()}
              className="min-h-11 min-w-0 flex-1 rounded-xl px-2 py-1.5 text-[11px] font-bold text-slate-400 transition-all duration-200 btn-spring hover:text-white sm:flex-none sm:px-4 sm:text-xs"
            >
              <Sparkles aria-hidden="true" className="mr-1.5 inline-block h-4 w-4 align-[-3px]" />進入 Stage
            </button>}
          </div>
        </div>

        {/* Music Source Connector & Playlist Drawer Toggle */}
        <div className="flex w-full min-w-0 items-center gap-2 md:w-auto md:gap-3">
          <button
            onClick={() => setShowConnectModal(true)}
            className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl border border-[#62f5c4]/30 bg-[#62f5c4]/15 px-2 py-1.5 text-[11px] font-bold text-[#62f5c4] transition-all btn-spring hover:bg-[#62f5c4]/25 sm:flex-none sm:px-4 sm:text-xs"
          >
            <span className={`w-2 h-2 rounded-full ${(activeSource === 'spotify' ? spotifyConnected : youtubeConnected) ? 'bg-[#62f5c4] shadow-[0_0_8px_#62f5c4]' : 'bg-slate-500'} `} />
            <span className="hidden sm:inline">{activeSource === 'spotify' ? (spotifyConnected ? 'Spotify 已連線' : '我的音樂') : (youtubeConnected ? 'YouTube 已連線' : '我的音樂')}</span>
            <span className="sm:hidden">{activeSource === 'spotify' ? (spotifyConnected ? 'Spotify' : '音樂') : (youtubeConnected ? 'YouTube' : '音樂')}</span>
          </button>

          {displayMode === 'full' && (
            <button
              onClick={() => setShowPlaylistDrawer(!showPlaylistDrawer)}
              className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-bold transition-all btn-spring ${
                showPlaylistDrawer
                  ? 'border-white/20 bg-white/15 text-white shadow-sm'
                  : 'border-white/10 bg-white/[0.05] text-slate-400 hover:text-white'
              }`}
              title={showPlaylistDrawer ? '關閉歌單' : '開啟歌單'}
              aria-label={showPlaylistDrawer ? '關閉歌單' : '開啟歌單'}
              aria-expanded={showPlaylistDrawer}
            >
              <ClipboardList aria-hidden="true" className="h-4 w-4" />
              <span>歌單</span>
            </button>
          )}
        </div>
      </header>}

      {/* Main Content Area */}
      <div className="relative z-30 flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {/* Playlist drawer: overlay on mobile, fixed-width column on desktop. */}
        {displayMode === 'full' && showPlaylistDrawer && (
          <>
            <button
              type="button"
              aria-label="關閉歌單面板"
              className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] md:hidden"
              onClick={() => setShowPlaylistDrawer(false)}
            />
            <aside
              className="echora-queue fixed inset-y-0 left-0 z-50 flex h-full w-screen min-w-0 flex-col gap-4 overflow-hidden border-r border-white/10 bg-[#0d111a]/95 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] shadow-2xl drawer-slide-left md:relative md:inset-auto md:z-auto md:h-full md:w-96 md:min-w-96 md:flex-shrink-0 md:bg-transparent md:px-5 md:pb-5 md:pt-5 md:shadow-none"
              aria-label="播放清單與歌單"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-extrabold text-white">播放清單</p>
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{playlist.length} 首 · {queueLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPlaylistDrawer(false)}
                  className="min-h-11 min-w-11 rounded-xl border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
                  aria-label="關閉歌單面板"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>

              {/* Source Switcher */}
              <div className="flex rounded-2xl border border-white/10 bg-white/[0.05] p-1">
                {(['spotify', 'ytmusic', 'local'] as const).map(src => (
                  <button
                    type="button"
                    key={src}
                    onClick={() => setActiveSource(src)}
                    disabled={src === 'spotify' && !spotifyAvailable}
                    aria-label={`切換來源至 ${src === 'spotify' ? 'Spotify' : src === 'ytmusic' ? 'YouTube Music' : '本機展示'}`}
                    title={src === 'spotify' && !spotifyAvailable ? 'Spotify 尚未啟用，無法作為播放來源' : undefined}
                    aria-pressed={activeSource === src}
                    className={`min-h-11 min-w-0 flex-1 rounded-xl py-2 text-xs font-bold transition-all duration-200 btn-spring disabled:cursor-not-allowed disabled:opacity-50 ${
                      activeSource === src
                        ? 'bg-gradient-to-r from-[#62f5c4] to-teal-400 text-black shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {src === 'spotify' ? spotifyAvailable ? 'Spotify' : 'Spotify 鎖定' : src === 'ytmusic' ? 'YT Music' : '本地'}
                  </button>
                ))}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto space-y-5 pr-1">
                <div>
                  <h4 className="mb-2.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-400 font-mono">目前佇列</h4>
                  <div className="space-y-1.5">
                    {playlist.map((songItem: Song) => {
                      const isItemActive = currentSong.id === songItem.id;
                      const itemState = isItemActive ? (isPlaying ? '，播放中' : '，目前選取') : '';
                      return (
                        <button
                          type="button"
                          key={songItem.id}
                          onClick={() => { play(songItem, playlist); setShowPlaylistDrawer(false); }}
                          aria-current={isItemActive ? 'true' : undefined}
                          aria-label={`${songItem.title}，${getSourceLabel(songItem.source)}${itemState}`}
                          className={`flex w-full min-w-0 items-center gap-3 rounded-2xl border p-2.5 text-left transition-all duration-200 btn-spring ${
                            isItemActive
                              ? 'border-[#62f5c4]/40 bg-[#62f5c4]/15 text-[#62f5c4] shadow-md'
                              : 'border-transparent text-slate-200 hover:bg-white/[0.06]'
                          }`}
                        >
                          <CoverImage src={songItem.coverUrl} alt={songItem.title} wrapperClassName="h-11 w-11 shrink-0 rounded-xl" className="h-11 w-11 rounded-xl object-cover shadow-sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold">{songItem.title}</p>
                            <p className="mt-0.5 truncate text-[11px] text-slate-400">{typeof songItem.artists[0] === 'string' ? songItem.artists[0] : songItem.artists[0]?.name}</p>
                            <span className="mt-1 inline-flex rounded-full border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[9px] font-bold text-slate-400">{getSourceLabel(songItem.source)}</span>
                          </div>
                          {isItemActive && isPlaying && (
                            <div className="flex shrink-0 items-end gap-0.5 pr-1" aria-label="播放中">
                              <span className="equalizer-bar" /><span className="equalizer-bar" /><span className="equalizer-bar" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {userPlaylists.length > 0 && (
                  <div>
                    <h4 className="mb-2.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-400 font-mono">我的歌單</h4>
                    <div className="space-y-1.5">
                      {userPlaylists.map((pl: Playlist) => (
                        <button
                          type="button"
                          key={pl.id}
                          onClick={() => { pl.source === 'spotify' ? void loadSpotifyPlaylist(pl.id) : void loadYouTubePlaylist(pl.id); setShowPlaylistDrawer(false); }}
                          className="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-transparent p-2.5 text-left text-slate-200 transition-all btn-spring hover:bg-white/[0.06]"
                        >
                          <CoverImage src={pl.coverUrl} alt={pl.name} wrapperClassName="h-11 w-11 shrink-0 rounded-xl" className="h-11 w-11 rounded-xl object-cover shadow-sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold">{pl.name}</p>
                            <p className="mt-0.5 text-[10px] text-slate-400">{pl.trackCount || 0} 首歌曲</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </>
        )}

        {/* Center Hero Stage View */}
        <main className={`min-h-0 min-w-0 flex-1 flex flex-col justify-between overflow-hidden relative z-10 ${displayMode === 'stage' ? 'p-0' : 'p-4 sm:p-6 md:p-8'}`}>
          {/* Track Header Card — not rendered in immersive mode so it cannot become a hidden tab stop. */}
          {displayMode !== 'stage' && <div className="flex items-center gap-4 sm:gap-5 z-10 glass-card p-3.5 sm:p-4 rounded-3xl border border-white/10 w-fit backdrop-blur-2xl shadow-xl transition-all">
            <div className="relative">
              <CoverImage
                src={currentSong.coverUrl}
                alt={currentSong.title}
                wrapperClassName="w-14 h-14 rounded-2xl sm:w-16 sm:h-16"
                className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover shadow-2xl transition-all duration-500 ${
                  isPlaying ? 'scale-100' : 'scale-95 opacity-80'
                }`}
              />
              {isPlaying && (
                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#62f5c4] flex items-center justify-center shadow-[0_0_10px_#62f5c4]">
                  <span className="w-2 h-2 rounded-full bg-black animate-pulse" />
                </div>
              )}
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl font-extrabold font-heading tracking-tight text-white drop-shadow-md truncate max-w-xs sm:max-w-md">
                {currentSong.title}
              </h1>
              <p className="text-xs sm:text-sm text-[#62f5c4] font-semibold mt-0.5">
                {activeArtist} {currentSong.album?.name ? `• ${currentSong.album.name}` : ''}
              </p>
              {demoMode && <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#b8ffe2]">{currentSong.source === 'local' ? 'Echora 本機音檔展示 · 不需登入或 YouTube' : 'Echora 展示模式 · 不需登入即可體驗'}</p>}
            </div>
          </div>}

          {/* Echora Kinetic Lyrics Animation Stage */}
          {isYouTubeVideoMode ? (
            <div className="flex min-h-0 flex-1 items-center justify-center px-0 py-4 sm:px-4 sm:py-6">
              <YouTubePlayer videoMode />
            </div>
          ) : (
            <>
              {currentSong.source === 'ytmusic' && <YouTubePlayer immersive={displayMode === 'stage'} concealed={displayMode === 'full' && showPlaylistDrawer} />}
              {displayMode === 'full' && showPlaylistDrawer && currentSong.source === 'ytmusic' && (
                <p className="pointer-events-none absolute bottom-6 right-6 z-20 hidden rounded-xl border border-white/10 bg-[#07090e]/80 px-3 py-2 text-[11px] font-semibold text-slate-300 backdrop-blur md:block">選歌時已隱藏 YouTube 播放器；關閉歌單側欄後即可操作。</p>
              )}
            </>
          )}
          {!isYouTubeVideoMode && <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {isLoadingLyrics ? (
              <StageSkeleton />
            ) : showLyriclessSoundscape ? (
              <LyriclessSoundscapeStage
                coverUrl={currentSong.coverUrl}
                songTitle={currentSong.title}
                songArtist={activeArtist}
                displayedTime={displayedLyricsTime}
                isPlaying={isPlaying}
                theme={currentTheme}
              />
            ) : (
              <Suspense fallback={<StageSkeleton />}>
                <OriginalFoliaVisualizerStage
                  lines={currentLyrics?.lines || []}
                  activeLineIndex={activeLineIndex}
                  displayedTime={displayedLyricsTime}
                  isPlaying={isPlaying}
                  theme={currentTheme}
                  visualizerMode={activeVisualizer}
                  coverUrl={currentSong.coverUrl}
                  songTitle={currentSong.title}
                  songArtist={activeArtist}
                  onSeekLine={seek}
                  backgroundMode={backgroundMode}
                  visualizerTunings={visualizerTunings}
                  isPlayerChromeHidden={false}
                  settingsOpen={displayMode === 'stage' && (showStageSettings || showTuning)}
                />
              </Suspense>
            )}
          </div>}

          {showTuning && (
            <Suspense fallback={<PanelSkeleton />}>
              <OriginalFoliaTuningPanel
                mode={activeVisualizer}
                autoMode={autoVisualizer}
                onAutoModeChange={setAutoVisualizer}
                onModeChange={(nextMode) => { setAutoVisualizer(false); setActiveVisualizer(nextMode); }}
                onClose={() => setShowTuning(false)}
                backgroundMode={backgroundMode}
                onBackgroundModeChange={setBackgroundMode}
                tunings={visualizerTunings}
                onTuningsChange={setVisualizerTunings}
              />
            </Suspense>
          )}
          {displayMode === 'stage' && !showTuning && (
            <div className="fixed inset-x-0 bottom-0 z-[70] flex items-center justify-center gap-2 border-t border-white/10 bg-[#07090e]/80 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:rounded-2xl sm:border sm:p-2" role="group" aria-label="沉浸播放控制">
              <span id="immersive-playback-status" className="sr-only" aria-live="polite">{isPlaying ? '目前播放中' : '目前已暫停'}</span>
              <button
                type="button"
                onClick={() => void returnToPlaylist()}
                className="min-h-11 min-w-11 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20"
                aria-label="返回歌單選擇頁"
              >
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />歌單
              </button>
              {(currentSong.source === 'ytmusic' || currentSong.source === 'local') && (
                <>
                  <button type="button" onClick={prev} className="min-h-11 min-w-11 rounded-xl border border-white/15 bg-black/35 px-2.5 py-2 text-white/80 hover:bg-white/10 hover:text-white" aria-label="上一首"><SkipBack aria-hidden="true" className="h-4 w-4" /></button>
              <button
                type="button"
                onClick={handlePlayPause}
                className="inline-flex min-h-11 min-w-[4.75rem] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#62f5c4] to-teal-400 px-3 py-2 text-xs font-extrabold text-black shadow-lg transition hover:brightness-110 active:scale-95"
                aria-label={isPlaying ? '暫停音訊' : '播放音訊'}
                aria-pressed={isPlaying}
                aria-describedby="immersive-playback-status"
                title={isPlaying ? '暫停音訊' : '播放音訊'}
              >
                {isPlaying ? <Pause aria-hidden="true" className="h-4 w-4" fill="currentColor" /> : <Play aria-hidden="true" className="h-4 w-4" fill="currentColor" />}
                <span>{isPlaying ? '暫停' : '播放'}</span>
              </button>
                  <button type="button" onClick={next} className="min-h-11 min-w-11 rounded-xl border border-white/15 bg-black/35 px-2.5 py-2 text-white/80 hover:bg-white/10 hover:text-white" aria-label="下一首"><SkipForward aria-hidden="true" className="h-4 w-4" /></button>
                </>
              )}
              <div ref={stageSettingsRef} className="relative">
                <button
                  type="button"
                  onClick={() => setShowStageSettings(value => !value)}
                  className={`min-h-11 min-w-11 rounded-xl border px-3 py-2 text-xs font-bold transition ${showStageSettings ? 'border-[#62f5c4]/45 bg-[#62f5c4]/15 text-[#b8ffe2]' : 'border-white/15 bg-black/35 text-white/80 hover:text-white'}`}
                  aria-label="開啟沉浸舞台設定"
                  aria-expanded={showStageSettings}
                  aria-controls="immersive-settings"
                >
                  <Settings2 aria-hidden="true" className="mr-1.5 inline-block h-4 w-4 align-[-3px]" />設定
                </button>
                {showStageSettings && (
                  <div id="immersive-settings" role="dialog" aria-label="沉浸舞台設定" className="fixed inset-x-3 bottom-[max(4.5rem,calc(env(safe-area-inset-bottom)+4.5rem))] z-[80] max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-2xl border border-white/10 bg-[#111720]/95 p-3 text-left shadow-2xl backdrop-blur-2xl sm:absolute sm:inset-x-auto sm:bottom-[calc(100%+0.75rem)] sm:right-0 sm:max-h-[calc(100vh-2rem)] sm:w-[min(88vw,22rem)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-extrabold text-white">沉浸舞台設定</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-500">只在需要時展開</p>
                      </div>
                      <button type="button" onClick={() => setShowStageSettings(false)} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="關閉沉浸舞台設定"><X aria-hidden="true" className="h-4 w-4" /></button>
                    </div>
                    <div className="mt-3 rounded-xl border border-[#62f5c4]/20 bg-[#62f5c4]/[0.06] px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9ff9d7]">舞台動畫</p>
                          <p className="mt-1 text-xs font-bold text-white">先選擇你要觀看的 Folia 舞台</p>
                        </div>
                        <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0 text-[#62f5c4]" />
                      </div>
                      <select
                        value={activeVisualizer}
                        disabled={autoVisualizer}
                        onChange={(event) => { setAutoVisualizer(false); setActiveVisualizer(event.target.value); }}
                        aria-label="選擇舞台動畫"
                        className="mt-3 min-h-11 w-full rounded-xl border border-white/15 bg-[#0b1218] px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#62f5c4] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {[
                          ['classic', 'Classic'], ['cadenza', 'Cadenza'], ['partita', 'Partita'], ['fume', 'Fume'], ['monet', 'Monet'],
                          ['cappella', 'Cappella'], ['pendolo', 'Pendolo'], ['sonnet', 'Sonnet'], ['claddagh', 'Claddagh'], ['diorama', 'Diorama'], ['tilt', 'Tilt'],
                        ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      <label className="mt-3 flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-300">
                        <span>跟隨音樂自動切換舞台</span>
                        <input type="checkbox" checked={autoVisualizer} onChange={(event) => setAutoVisualizer(event.target.checked)} aria-label="跟隨音樂自動切換舞台" className="h-5 w-5 accent-[#62f5c4]" />
                      </label>
                      <label className="mt-3 block text-[11px] font-semibold text-slate-300">背景效果
                        <select value={backgroundMode} onChange={(event) => setBackgroundMode(event.target.value)} aria-label="選擇背景效果" className="mt-1.5 min-h-11 w-full rounded-xl border border-white/15 bg-[#0b1218] px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#62f5c4]">
                          {['latent', 'common', 'fluid', 'monet', 'nomand', 'sora', 'url'].map((value) => <option key={value} value={value}>{value === 'common' ? 'Geometric' : value === 'url' ? 'Image URL' : value[0].toUpperCase() + value.slice(1)}</option>)}
                        </select>
                      </label>
                      <button type="button" onClick={() => { setShowStageSettings(false); setShowTuning(true); }} className="mt-3 min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-left text-xs font-bold text-slate-200 hover:bg-white/10">開啟進階舞台調校</button>
                    </div>
                    <div className="mt-3 rounded-xl border border-white/10 bg-black/15 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">歌詞狀態</p>
                      <p className="mt-1 text-xs font-semibold text-white">{lyricsStageStatus.title}</p>
                      <p className="mt-1 text-[11px] leading-5 text-slate-400">{lyricsStageStatus.copy}</p>
                    </div>
                    <div className="mt-3 rounded-xl border border-white/10 bg-black/15 px-3 py-2">
                      <div className="flex flex-col gap-2.5">
                        <div>
                          <p className="text-xs font-bold text-white">歌詞對齊</p>
                          <p className="mt-0.5 text-[11px] text-slate-400">每次 {LYRICS_OFFSET_STEP_SECONDS.toFixed(2)} 秒 · 目前 <span className="font-semibold text-[#b8ffe2]">{lyricsOffsetLabel}</span></p>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <button type="button" onClick={() => adjustStageLyricsOffset(-LYRICS_OFFSET_STEP_SECONDS)} className="min-h-11 rounded-lg border border-white/15 bg-white/10 px-2 py-2 text-[11px] font-bold text-white hover:bg-white/20" aria-label={`歌詞提前 ${LYRICS_OFFSET_STEP_SECONDS.toFixed(2)} 秒`}>提前</button>
                          <button type="button" onClick={() => setLyricsOffsetSeconds(0)} className="min-h-11 rounded-lg border border-[#62f5c4]/25 bg-[#62f5c4]/10 px-2 py-2 text-[11px] font-bold text-[#b8ffe2]" aria-label="重設歌詞同步">同步</button>
                          <button type="button" onClick={() => adjustStageLyricsOffset(LYRICS_OFFSET_STEP_SECONDS)} className="min-h-11 rounded-lg border border-white/15 bg-white/10 px-2 py-2 text-[11px] font-bold text-white hover:bg-white/20" aria-label={`歌詞延後 ${LYRICS_OFFSET_STEP_SECONDS.toFixed(2)} 秒`}>延後</button>
                        </div>
                      </div>
                    </div>
                    <button type="button" onClick={() => void leaveImmersiveStage()} className="mt-3 min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-left text-xs font-bold text-slate-200 hover:bg-white/10">退出全螢幕，回到雙欄</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bottom controls are intentionally not rendered in immersive mode. */}
          {displayMode !== 'stage' && <div className={`z-20 glass-panel p-4 sm:p-5 md:p-6 rounded-3xl border border-white/15 shadow-2xl space-y-3.5 ${isYouTubeVideoMode ? 'flex justify-center' : ''}`}>

            {/* Interactive Progress Bar */}
            <div className="space-y-1.5">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={displayedTime}
                aria-label={`播放進度，目前 ${formatTime(displayedTime)}，全長 ${formatTime(duration)}`}
                onMouseDown={() => setIsSeeking(true)}
                onTouchStart={() => setIsSeeking(true)}
                onChange={e => setSeekPreviewTime(Number(e.target.value))}
                onMouseUp={() => {
                  if (seekPreviewTime !== null) seek(seekPreviewTime);
                  setIsSeeking(false);
                  setSeekPreviewTime(null);
                }}
                onTouchEnd={() => {
                  if (seekPreviewTime !== null) seek(seekPreviewTime);
                  setIsSeeking(false);
                  setSeekPreviewTime(null);
                }}
                className="w-full echora-slider h-2 rounded-lg"
              />
              <div className="flex justify-between text-[11px] font-mono text-slate-400 px-1 font-semibold">
                <span className={isSeeking ? 'text-[#62f5c4] font-bold' : ''}>
                  {formatTime(displayedTime)}
                </span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Primary playback controls and secondary stage controls */}
            <div className={`flex flex-col items-center gap-4 md:flex-row ${isYouTubeVideoMode ? 'justify-center' : 'justify-between'}`}>
              {!isYouTubeVideoMode && <div className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2 md:w-auto">
                <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">目前舞台</p><p className="text-xs font-extrabold text-[#b8ffe2]">{activeVisualizer}</p></div>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => void enterImmersiveStage()} className="min-h-11 shrink-0 rounded-xl bg-[#62f5c4] px-3 py-2 text-xs font-extrabold text-black transition hover:brightness-110" aria-label="進入沉浸舞台">Stage</button>
                  <button type="button" onClick={() => setShowCalibration(value => !value)} className={`min-h-11 shrink-0 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${showCalibration ? 'border-[#62f5c4]/50 bg-[#62f5c4]/20 text-[#62f5c4]' : 'border-white/10 bg-white/[0.05] text-slate-300 hover:text-white'}`} aria-expanded={showCalibration} aria-controls="desktop-calibration" aria-label={showCalibration ? '關閉更多播放設定' : '開啟更多播放設定'}>更多</button>
                </div>
              </div>}

              {/* Media Controls */}
              <div className="flex items-center gap-5 sm:gap-6">
                <button
                  type="button"
                  onClick={prev}
                  className="min-h-11 min-w-11 rounded-full p-3 hover:bg-white/10 btn-spring text-white text-lg"
                  aria-label="上一首"
                >
                  <SkipBack aria-hidden="true" className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={handlePlayPause}
                  className={`min-h-14 min-w-14 rounded-full p-4 bg-gradient-to-r from-[#62f5c4] to-teal-400 text-black shadow-xl hover:scale-105 btn-spring text-xl font-bold ${
                    isPlaying ? 'playing-pulse-glow' : ''
                  }`}
                  aria-label={isPlaying ? '暫停音訊' : '播放音訊'}
                  aria-pressed={isPlaying}
                >
                  {isPlaying ? <Pause aria-hidden="true" className="h-6 w-6" fill="currentColor" /> : <Play aria-hidden="true" className="h-6 w-6" fill="currentColor" />}
                </button>
                <button
                  type="button"
                  onClick={next}
                  className="min-h-11 min-w-11 rounded-full p-3 hover:bg-white/10 btn-spring text-white text-lg"
                  aria-label="下一首"
                >
                  <SkipForward aria-hidden="true" className="h-5 w-5" />
                </button>
              </div>
            </div>
            {!isYouTubeVideoMode && showCalibration && <div id="desktop-calibration" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-3"><div><p className="text-xs font-bold text-white">歌詞對齊</p><p className="mt-0.5 text-[11px] text-slate-400">每次調整 {LYRICS_OFFSET_STEP_SECONDS.toFixed(2)} 秒 · 目前 <span className="font-semibold text-[#b8ffe2]">{lyricsOffsetLabel}</span></p></div><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => adjustStageLyricsOffset(-LYRICS_OFFSET_STEP_SECONDS)} className="rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-2 text-[11px] font-bold text-slate-300 hover:text-white">提前 {LYRICS_OFFSET_STEP_SECONDS.toFixed(2)} 秒</button><button type="button" onClick={() => setLyricsOffsetSeconds(0)} className="rounded-lg border border-[#62f5c4]/25 bg-[#62f5c4]/10 px-2.5 py-2 text-[11px] font-bold text-[#b8ffe2]">同步回原點</button><button type="button" onClick={() => adjustStageLyricsOffset(LYRICS_OFFSET_STEP_SECONDS)} className="rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-2 text-[11px] font-bold text-slate-300 hover:text-white">延後 {LYRICS_OFFSET_STEP_SECONDS.toFixed(2)} 秒</button><button type="button" onClick={() => setShowTuning(value => !value)} className="rounded-xl border border-white/[0.12] bg-white/[0.05] px-3 py-2 text-xs font-bold text-slate-300 hover:text-white">視覺與舞台設定</button></div></div>}
          </div>}
        </main>
      </div>

      {/* Spotify OAuth Connection Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 modal-backdrop-enter" role="dialog" aria-modal="true" aria-labelledby="player-connect-title" aria-describedby="player-connect-copy">
          <div ref={connectModalRef} tabIndex={-1} className="glass-panel p-6 md:p-8 rounded-3xl w-full max-w-md space-y-5 text-white shadow-2xl border border-white/15 modal-panel-enter">
            <div className="flex justify-between items-center">
              <h3 id="player-connect-title" className="text-xl font-bold font-heading">連線 Spotify / YouTube Music</h3>
              <button
                type="button"
                onClick={closeConnectModal}
                aria-label="關閉連線視窗"
                className="text-slate-400 hover:text-white text-lg p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            <p id="player-connect-copy" className="text-xs text-slate-300 leading-relaxed">
              使用官方 OAuth 登入後，Echora 會同步可用的播放狀態、播放控制與個人歌單；你的密碼永遠不會經過 Echora。按 Escape 可關閉此視窗。
            </p>
            {spotifyError && (
              <p className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs leading-5 text-rose-200">
                {spotifyError}<br />請確認 Spotify App 的 Redirect URI 已正確設定。
              </p>
            )}
            {!spotifyAvailable && <p className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">Spotify 尚未取得開發者權限或設定 Client ID，因此目前不可登入與測試；這不是播放故障。</p>}
            {youtubeError && (
              <p className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs leading-5 text-rose-200">
                {youtubeError}
              </p>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closeConnectModal}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-slate-300 transition-colors"
              >
                取消
              </button>
              {activeSource === 'ytmusic' ? (youtubeConnected ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => void switchYouTubeAccount()} className="rounded-xl border border-[#ff7180]/35 bg-[#ff3d57]/10 px-4 py-2.5 text-xs font-extrabold text-[#ffb0b8] transition hover:bg-[#ff3d57]/20">切換帳號</button>
                  <button type="button" onClick={() => { disconnectYouTube(); setShowConnectModal(false); }} className="rounded-xl border border-rose-400/25 px-4 py-2.5 text-xs font-extrabold text-rose-200 transition hover:bg-rose-500/20">登出 YouTube</button>
                </div>
              ) : (
                <button onClick={() => void connectYouTube()} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#ff4b5c] to-[#ff1744] text-white text-xs font-extrabold shadow-lg hover:brightness-110 btn-spring">使用 Google 登入 YouTube</button>
              )) : !spotifyAvailable ? (
                <button disabled className="cursor-not-allowed rounded-xl border border-amber-300/20 bg-amber-300/10 px-5 py-2.5 text-xs font-extrabold text-amber-100">Spotify 尚未啟用</button>
              ) : spotifyConnected ? (
                <button
                  onClick={() => { disconnectSpotify(); setShowConnectModal(false); }}
                  className="px-5 py-2.5 rounded-xl border border-rose-400/25 text-rose-200 hover:bg-rose-500/20 text-xs font-extrabold transition-all"
                >
                  解除連線
                </button>
              ) : (
                <button
                  onClick={() => void connectSpotify()}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#62f5c4] to-teal-400 text-black text-xs font-extrabold shadow-lg hover:brightness-110 btn-spring"
                >
                  使用 Spotify 登入
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
