import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Sparkles } from 'lucide-react';
import { usePlayer } from '../contexts/PlayerContext';
import { useTheme } from '../contexts/ThemeProvider';
import YouTubePlayer from '../components/YouTubePlayer';
import { spotifyClientId } from '../integrations/spotifyAuth';
import { useDialogFocus } from '../hooks/useDialogFocus';
import LyriclessSoundscapeStage from '../components/LyriclessSoundscapeStage';
import { CoverImage, PanelSkeleton, PlayerSkeleton, StageSkeleton } from '../components/LoadingSkeletons';
import { adjustLyricsOffset, getActiveLyricIndex } from '../utils/lyrics/activeLine';
import { lazyWithRetry } from '../utils/recovery';
import { pickAutoVisualizerMode, resolveStageAudioBands, visualizerEnergy } from '../playback/audioBands';
import { sampleLocalAudioBands } from '../playback/localAudioAnalyser';
import { isYouTubeVideo } from '../utils/youtubePlayback';
import { songOffsetKey, useStageStore } from '../store/stageStore';
import { lyricsOriginLabel } from '../playback/lyricsImport';
import PlayerHeader from '../components/player/PlayerHeader';
import QueueDrawer from '../components/player/QueueDrawer';
import TransportBar from '../components/player/TransportBar';
import ImmersiveChrome from '../components/player/ImmersiveChrome';
import ConnectModal from '../components/player/ConnectModal';

const OriginalFoliaVisualizerStage = lazyWithRetry(
  () => import('../components/OriginalFoliaVisualizerStage'),
  'stage-visualizer',
);
const OriginalFoliaTuningPanel = lazyWithRetry(
  () => import('../components/OriginalFoliaTuningPanel'),
  'stage-tuning-panel',
);

export default function Player() {
  const { t } = useTranslation();
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
    importLyricsText,
  } = usePlayer();
  const { currentTheme } = useTheme();

  const activeVisualizer = useStageStore(state => state.activeVisualizer);
  const setActiveVisualizer = useStageStore(state => state.setActiveVisualizer);
  const autoVisualizer = useStageStore(state => state.autoVisualizer);
  const setAutoVisualizer = useStageStore(state => state.setAutoVisualizer);
  const backgroundMode = useStageStore(state => state.backgroundMode);
  const setBackgroundMode = useStageStore(state => state.setBackgroundMode);
  const visualizerTunings = useStageStore(state => state.visualizerTunings);
  const setVisualizerTunings = useStageStore(state => state.setVisualizerTunings);
  const lyricsOffsets = useStageStore(state => state.lyricsOffsets);
  const setStoredLyricsOffset = useStageStore(state => state.setLyricsOffset);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showPlaylistDrawer, setShowPlaylistDrawer] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768);
  const connectModalRef = useRef<HTMLDivElement>(null);
  const closeConnectModal = useCallback(() => setShowConnectModal(false), []);
  useDialogFocus(showConnectModal, connectModalRef, closeConnectModal);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreviewTime, setSeekPreviewTime] = useState<number | null>(null);
  const [showTuning, setShowTuning] = useState(false);
  const [showCalibration, setShowCalibration] = useState(false);
  const [showStageSettings, setShowStageSettings] = useState(false);
  const stageSettingsRef = useRef<HTMLDivElement>(null);
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
      const bands = resolveStageAudioBands({
        isPlaying,
        displayedTime: currentTime,
        liveBands: sampleLocalAudioBands(true),
      });
      const nextMode = pickAutoVisualizerMode(visualizerEnergy(bands));
      if (useStageStore.getState().activeVisualizer !== nextMode) setActiveVisualizer(nextMode);
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

  const lyricsOffsetSeconds = lyricsOffsets[songOffsetKey(currentSong)] || 0;

  useEffect(() => {
    if (displayMode !== 'stage' && !showPlaylistDrawer) return;
    const onPopState = () => {
      if (displayMode === 'stage') void leaveImmersiveStage();
      else setShowPlaylistDrawer(false);
    };
    window.history.pushState({ echoraOverlay: true }, '');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [displayMode, showPlaylistDrawer]);

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
    ? t('player.synced')
    : `${lyricsOffsetSeconds > 0 ? '+' : ''}${t('player.seconds', { value: lyricsOffsetSeconds.toFixed(2) })}`;
  const offsetKey = songOffsetKey(currentSong);
  const adjustStageLyricsOffset = (deltaSeconds: number) => {
    setStoredLyricsOffset(offsetKey, adjustLyricsOffset(lyricsOffsetSeconds, deltaSeconds));
  };
  const resetStageLyricsOffset = () => setStoredLyricsOffset(offsetKey, 0);

  if (!currentSong) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#07090e] text-white gap-5 p-6 selection:bg-[#62f5c4] selection:text-black">
        <div className="w-20 h-20 rounded-3xl bg-[#62f5c4]/10 border border-[#62f5c4]/30 flex items-center justify-center text-4xl shadow-[0_0_30px_rgba(98,245,196,0.2)] animate-pulse">
          <Sparkles aria-hidden="true" className="h-9 w-9 text-[#62f5c4]" />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-bold font-heading text-white">{t('player.noSongTitle')}</h2>
          <p className="text-sm text-slate-400">{t('player.noSongHint')}</p>
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/app')}
            className="px-7 py-3.5 rounded-2xl bg-gradient-to-r from-[#62f5c4] via-teal-300 to-emerald-400 text-black font-extrabold text-sm shadow-[0_10px_30px_rgba(98,245,196,0.25)] hover:brightness-110 btn-spring"
          >
            {t('player.backToExplore')} <ArrowRight aria-hidden="true" className="ml-1.5 inline-block h-4 w-4 align-[-3px]" />
          </button>
          <button
            type="button"
            onClick={() => navigate('/library')}
            className="rounded-2xl border border-white/15 bg-white/[0.06] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/[0.12]"
          >
            {t('player.goToLibrary')}
          </button>
        </div>
      </div>
    );
  }

  const activeArtist = typeof currentSong.artists[0] === 'string'
    ? currentSong.artists[0]
    : currentSong.artists[0]?.name || t('player.unknownArtist');

  const displayedTime = (isSeeking && seekPreviewTime !== null) ? seekPreviewTime : currentTime;
  const displayedLyricsTime = Math.max(0, displayedTime + lyricsOffsetSeconds);
  const queueSources = Array.from(new Set(playlist.map(song => song.source)));
  const queueLabel = queueSources.length > 1 ? t('player.queueMixed') : queueSources[0] === 'ytmusic' ? t('player.queueYt') : queueSources[0] === 'spotify' ? t('player.queueSpotify') : queueSources[0] === 'local' ? t('player.queueLocal') : t('player.queueCurrent');
  const showLyriclessSoundscape = !isLoadingLyrics && !currentLyrics?.lines?.length;
  const lyricsStageStatus = (() => {
    if (isLoadingLyrics || lyricsStatus === 'loading') return { title: t('player.loadingLyrics'), copy: t('player.loadingLyricsHint') };
    if (currentSong.source === 'ytmusic' && !isPlaying && !youtubeError) return { title: playbackState === 'buffering' || playbackState === 'loading' ? t('player.ytPreparing') : t('player.ytWaiting'), copy: t('player.ytWaitingHint') };
    if (currentSong.source === 'local' && !isPlaying && playbackState === 'loading') return { title: t('player.localReady'), copy: t('player.localReadyHint') };
    if (currentLyrics?.lines?.length) {
      const origin = lyricsOriginLabel(currentLyrics.origin);
      const title = currentLyrics.origin === 'upload' ? t('player.lyricsUploaded') : currentLyrics.origin === 'demo-transcript' ? t('player.lyricsTranscript') : t('player.lyricsAvailable');
      return { title, copy: origin ? t('player.lyricsOriginHint', { origin }) : t('player.lyricsOffsetHint') };
    }
    if (localError) return { title: t('player.localPlaybackError'), copy: localError };
    return { title: lyricsStatus === 'instrumental' ? t('player.instrumental') : lyricsStatus === 'error' ? t('player.lyricsError') : t('player.noSyncedLyrics'), copy: lyricsStatus === 'error' ? t('player.lyricsErrorHint') : currentSong.source === 'local' ? t('player.localNoLyricsHint') : t('player.noLyricsHint') };
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

      {displayMode !== 'stage' && (
        <PlayerHeader
          isYouTubeVideoMode={isYouTubeVideoMode}
          displayMode={displayMode}
          showPlaylistDrawer={showPlaylistDrawer}
          activeSource={activeSource}
          spotifyConnected={spotifyConnected}
          youtubeConnected={youtubeConnected}
          onBack={() => navigate('/app')}
          onEnterStage={() => void enterImmersiveStage()}
          onLeaveStage={() => void leaveImmersiveStage()}
          onOpenConnect={() => setShowConnectModal(true)}
          onTogglePlaylist={() => setShowPlaylistDrawer(!showPlaylistDrawer)}
        />
      )}

      {/* Main Content Area */}
      <div className="relative z-30 flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {displayMode === 'full' && showPlaylistDrawer && (
          <QueueDrawer
            playlist={playlist}
            queueLabel={queueLabel}
            currentSong={currentSong}
            isPlaying={isPlaying}
            userPlaylists={userPlaylists}
            activeSource={activeSource}
            spotifyAvailable={spotifyAvailable}
            onClose={() => setShowPlaylistDrawer(false)}
            onPlaySong={(song) => { play(song, playlist); setShowPlaylistDrawer(false); }}
            onSetActiveSource={setActiveSource}
            onLoadPlaylist={(pl) => { pl.source === 'spotify' ? void loadSpotifyPlaylist(pl.id) : void loadYouTubePlaylist(pl.id); setShowPlaylistDrawer(false); }}
          />
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
              {demoMode && <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#b8ffe2]">{currentSong.source === 'local' ? t('player.localDemoBadge') : t('player.demoBadge')}</p>}
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
                <p className="pointer-events-none absolute bottom-6 right-6 z-20 hidden rounded-xl border border-white/10 bg-[#07090e]/80 px-3 py-2 text-[11px] font-semibold text-slate-300 backdrop-blur md:block">{t('player.ytConcealedHint')}</p>
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
                onTuningsChange={(next) => setVisualizerTunings(next)}
              />
            </Suspense>
          )}
          {displayMode === 'stage' && !showTuning && (
            <ImmersiveChrome
              isPlaying={isPlaying}
              showTransport={currentSong.source === 'ytmusic' || currentSong.source === 'local'}
              showStageSettings={showStageSettings}
              settingsRef={stageSettingsRef}
              activeVisualizer={activeVisualizer}
              autoVisualizer={autoVisualizer}
              backgroundMode={backgroundMode}
              lyricsStatusTitle={lyricsStageStatus.title}
              lyricsStatusCopy={lyricsStageStatus.copy}
              lyricsOffsetSeconds={lyricsOffsetSeconds}
              lyricsOffsetLabel={lyricsOffsetLabel}
              origin={currentLyrics?.origin}
              onReturnToPlaylist={() => void returnToPlaylist()}
              onPrev={prev}
              onNext={next}
              onPlayPause={handlePlayPause}
              onToggleSettings={() => setShowStageSettings(value => !value)}
              onCloseSettings={() => setShowStageSettings(false)}
              onVisualizerChange={(mode) => { setAutoVisualizer(false); setActiveVisualizer(mode); }}
              onAutoVisualizerChange={setAutoVisualizer}
              onBackgroundModeChange={setBackgroundMode}
              onOpenTuning={() => { setShowStageSettings(false); setShowTuning(true); }}
              onAdjustOffset={adjustStageLyricsOffset}
              onResetOffset={resetStageLyricsOffset}
              onImportLyrics={importLyricsText}
              onLeaveStage={() => void leaveImmersiveStage()}
            />
          )}

          {/* Bottom controls are intentionally not rendered in immersive mode. */}
          {displayMode !== 'stage' && (
            <TransportBar
              isYouTubeVideoMode={isYouTubeVideoMode}
              isPlaying={isPlaying}
              displayedTime={displayedTime}
              duration={duration}
              isSeeking={isSeeking}
              seekPreviewTime={seekPreviewTime}
              activeVisualizer={activeVisualizer}
              showCalibration={showCalibration}
              lyricsOffsetSeconds={lyricsOffsetSeconds}
              lyricsOffsetLabel={lyricsOffsetLabel}
              origin={currentLyrics?.origin}
              onSeekPreview={setSeekPreviewTime}
              onSeekStart={() => setIsSeeking(true)}
              onSeekCommit={() => {
                if (seekPreviewTime !== null) seek(seekPreviewTime);
                setIsSeeking(false);
                setSeekPreviewTime(null);
              }}
              onPrev={prev}
              onNext={next}
              onPlayPause={handlePlayPause}
              onEnterStage={() => void enterImmersiveStage()}
              onToggleCalibration={() => setShowCalibration(value => !value)}
              onAdjustOffset={adjustStageLyricsOffset}
              onResetOffset={resetStageLyricsOffset}
              onImportLyrics={importLyricsText}
              onToggleTuning={() => setShowTuning(value => !value)}
            />
          )}
        </main>
      </div>

      {showConnectModal && (
        <ConnectModal
          dialogRef={connectModalRef}
          spotifyAvailable={spotifyAvailable}
          activeSource={activeSource}
          spotifyError={spotifyError}
          youtubeError={youtubeError}
          youtubeConnected={youtubeConnected}
          spotifyConnected={spotifyConnected}
          onClose={closeConnectModal}
          onConnectYouTube={() => void connectYouTube()}
          onSwitchYouTube={() => void switchYouTubeAccount()}
          onDisconnectYouTube={() => { disconnectYouTube(); setShowConnectModal(false); }}
          onConnectSpotify={() => void connectSpotify()}
          onDisconnectSpotify={() => { disconnectSpotify(); setShowConnectModal(false); }}
        />
      )}
    </div>
  );
}
