import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayer } from '../contexts/PlayerContext';
import { useTheme } from '../contexts/ThemeProvider';
import { type Song, type Line } from '@echora/core';
import type { Playlist } from '@echora/core';
import OriginalFoliaVisualizerStage from '../components/OriginalFoliaVisualizerStage';
import YouTubePlayer from '../components/YouTubePlayer';
import OriginalFoliaTuningPanel from '../components/OriginalFoliaTuningPanel';
import { spotifyClientId } from '../integrations/spotifyAuth';

export default function Player() {
  const navigate = useNavigate();
  const {
    currentSong,
    currentLyrics,
    isPlaying,
    currentTime,
    duration,
    playPause,
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
    disconnectYouTube,
    loadYouTubePlaylist,
    isChangingTrack,
    isLoadingLyrics,
    lyricsStatus,
    playbackState,
  } = usePlayer();
  const { currentTheme } = useTheme();

  const [activeVisualizer, setActiveVisualizer] = useState('classic');
  const [autoVisualizer, setAutoVisualizer] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showPlaylistDrawer, setShowPlaylistDrawer] = useState(true);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreviewTime, setSeekPreviewTime] = useState<number | null>(null);
  const [backgroundMode, setBackgroundMode] = useState('latent');
  const [showTuning, setShowTuning] = useState(false);
  const [visualizerTunings, setVisualizerTunings] = useState<Record<string, any>>({});
  const [lyricsOffsetSeconds, setLyricsOffsetSeconds] = useState(0);
  const stageRootRef = useRef<HTMLDivElement>(null);
  const spotifyAvailable = Boolean(spotifyClientId);

  const enterImmersiveStage = async () => {
    setDisplayMode('stage');
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !event.repeat && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        playPause();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playPause]);

  useEffect(() => {
    const recoverVisualizer = () => setActiveVisualizer('classic');
    window.addEventListener('echora:visualizer-recover', recoverVisualizer);
    return () => window.removeEventListener('echora:visualizer-recover', recoverVisualizer);
  }, []);

  useEffect(() => {
    setLyricsOffsetSeconds(0);
  }, [currentSong?.id]);

  const returnToPlaylist = async () => {
    await leaveImmersiveStage();
    navigate('/');
  };

  // Active line index calculation with natural breath pause tolerance
  const activeLineIndex = useMemo(() => {
    if (!currentLyrics?.lines || currentLyrics.lines.length === 0) return 0;
    const playbackTime = (isSeeking && seekPreviewTime !== null) ? seekPreviewTime : currentTime;
    const effectiveTime = Math.max(0, playbackTime + lyricsOffsetSeconds);

    const idx = currentLyrics.lines.findIndex((l: Line, i: number) => {
      const nextLine = currentLyrics.lines[i + 1];
      const lineTimeSec = l.startTime / 1000;
      const nextTimeSec = nextLine ? nextLine.startTime / 1000 : (duration || lineTimeSec + 5);
      return effectiveTime >= lineTimeSec && effectiveTime < nextTimeSec;
    });

    return idx !== -1 ? idx : 0;
  }, [currentLyrics, currentTime, isSeeking, seekPreviewTime, duration, lyricsOffsetSeconds]);

  if (!currentSong) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#07090e] text-white gap-5 p-6 selection:bg-[#62f5c4] selection:text-black">
        <div className="w-20 h-20 rounded-3xl bg-[#62f5c4]/10 border border-[#62f5c4]/30 flex items-center justify-center text-4xl shadow-[0_0_30px_rgba(98,245,196,0.2)] animate-pulse">
          ✨
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-bold font-heading text-white">尚未選擇播放歌曲</h2>
          <p className="text-sm text-slate-400">挑選一首喜愛的曲目，開啟 Echora 音樂呼吸舞台</p>
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="px-7 py-3.5 rounded-2xl bg-gradient-to-r from-[#62f5c4] via-teal-300 to-emerald-400 text-black font-extrabold text-sm shadow-[0_10px_30px_rgba(98,245,196,0.25)] hover:brightness-110 btn-spring"
          >
            返回主頁探索歌曲 →
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

  return (
    <div
      ref={stageRootRef}
      className="relative w-full h-screen overflow-hidden font-sans select-none flex flex-col transition-colors duration-700 ambient-grain"
      style={{ backgroundColor: currentTheme.backgroundColor || '#07090e' }}
    >
      {/* Dynamic Music-Reactive Blurred Backdrop with 800ms Crossfade */}
      <div
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
      </div>

      {/* Top Navigation Header */}
      <header className={`relative z-20 items-center justify-between px-5 md:px-8 py-3.5 glass-panel border-b border-white/[0.08] ${displayMode === 'stage' ? 'hidden' : 'flex'}`}>
        <div className="flex items-center gap-3 md:gap-5">
          <button
            onClick={() => navigate('/')}
            className="p-2.5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.12] btn-spring backdrop-blur-md text-white border border-white/10"
            title="返回主頁"
            aria-label="返回主頁"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* App Brand Tag */}
          <div className="hidden sm:flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#62f5c4] via-teal-400 to-indigo-500 text-xs font-black text-black shadow-[0_0_12px_rgba(98,245,196,0.3)]">F</span>
            <span className="font-heading text-sm font-extrabold tracking-wider text-white">ECHORA STAGE</span>
          </div>

          {/* Responsive Segmented Mode Controller */}
          <div className="flex p-1 rounded-2xl bg-white/[0.06] border border-white/[0.08] backdrop-blur-md">
            <button
              onClick={() => void leaveImmersiveStage()}
              className={`px-3 md:px-4 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 btn-spring ${
                displayMode === 'full'
                  ? 'bg-gradient-to-r from-[#62f5c4] to-teal-400 text-black shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📱 雙欄模式
            </button>
            <button
              onClick={() => void enterImmersiveStage()}
              className={`px-3 md:px-4 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 btn-spring ${
                displayMode === 'stage'
                  ? 'bg-gradient-to-r from-[#62f5c4] to-teal-400 text-black shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ✨ 沉浸舞台
            </button>
          </div>
        </div>

        {/* Music Source Connector & Playlist Drawer Toggle */}
        <div className="flex items-center gap-2 md:gap-3">
          <button
            onClick={() => setShowConnectModal(true)}
            className="flex items-center gap-2 px-3 md:px-4 py-1.5 rounded-2xl bg-[#62f5c4]/15 border border-[#62f5c4]/30 hover:bg-[#62f5c4]/25 text-[#62f5c4] text-xs font-bold transition-all btn-spring"
          >
            <span className={`w-2 h-2 rounded-full ${(activeSource === 'spotify' ? spotifyConnected : youtubeConnected) ? 'bg-[#62f5c4] shadow-[0_0_8px_#62f5c4]' : 'bg-slate-500'} `} />
            <span className="hidden sm:inline">{activeSource === 'spotify' ? (spotifyConnected ? 'Spotify 已連線' : '連線 Spotify') : (youtubeConnected ? 'YouTube 已連線' : '連線 YouTube')}</span>
            <span className="sm:hidden">{activeSource === 'spotify' ? (spotifyConnected ? 'Spotify' : '連線') : (youtubeConnected ? 'YouTube' : '連線')}</span>
          </button>

          {displayMode === 'full' && (
            <button
              onClick={() => setShowPlaylistDrawer(!showPlaylistDrawer)}
              className={`p-2.5 rounded-2xl text-xs border transition-all btn-spring ${
                showPlaylistDrawer
                  ? 'bg-white/15 border-white/20 text-white shadow-sm'
                  : 'bg-white/[0.05] border-white/10 text-slate-400 hover:text-white'
              }`}
              title="側邊欄開關"
            >
              📋
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="relative z-10 flex-1 flex overflow-hidden">
        {/* Studio Playlist Drawer */}
        {displayMode === 'full' && showPlaylistDrawer && (
          <aside className="w-80 md:w-96 h-full glass-panel border-r border-white/10 flex flex-col p-4 md:p-5 gap-4 transition-all duration-300 drawer-enter">
            {/* Source Switcher */}
            <div className="flex rounded-2xl bg-white/[0.05] p-1 border border-white/10">
              {(['spotify', 'ytmusic', 'local'] as const).map(src => (
                <button
                  key={src}
                  onClick={() => setActiveSource(src)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all duration-200 btn-spring ${
                    activeSource === src
                      ? 'bg-gradient-to-r from-[#62f5c4] to-teal-400 text-black shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {src === 'spotify' ? 'Spotify' : src === 'ytmusic' ? 'YT Music' : '本地'}
                </button>
              ))}
            </div>

            {/* Playlists & Queue */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div>
                <h4 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest mb-2.5 font-mono">
                  當前播放佇列 ({playlist.length})
                </h4>
                <div className="space-y-1.5">
                  {playlist.map((songItem: Song) => {
                    const isItemActive = currentSong.id === songItem.id;
                    return (
                      <div
                        key={songItem.id}
                        onClick={() => play(songItem, playlist)}
                        className={`flex items-center gap-3.5 p-2.5 rounded-2xl cursor-pointer transition-all duration-200 btn-spring ${
                          isItemActive
                            ? 'bg-[#62f5c4]/15 border border-[#62f5c4]/40 text-[#62f5c4] shadow-md'
                            : 'hover:bg-white/[0.06] text-slate-200 border border-transparent'
                        }`}
                      >
                        <img src={songItem.coverUrl} alt={songItem.title} className="w-11 h-11 rounded-xl object-cover shadow-sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate">{songItem.title}</p>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {typeof songItem.artists[0] === 'string' ? songItem.artists[0] : songItem.artists[0]?.name}
                          </p>
                        </div>
                        {isItemActive && isPlaying && (
                          <div className="flex items-end gap-0.5 h-3.5 pr-1">
                            <span className="equalizer-bar" />
                            <span className="equalizer-bar" />
                            <span className="equalizer-bar" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {userPlaylists.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest mb-2.5 font-mono">
                    我的歌單
                  </h4>
                  <div className="space-y-1.5">
                    {userPlaylists.map((pl: Playlist) => (
                      <button
                        type="button"
                        key={pl.id}
                        onClick={() => pl.source === 'spotify' ? void loadSpotifyPlaylist(pl.id) : void loadYouTubePlaylist(pl.id)}
                        className="flex w-full items-center gap-3.5 p-2.5 rounded-2xl hover:bg-white/[0.06] cursor-pointer text-left text-slate-200 transition-all btn-spring"
                      >
                        <img src={pl.coverUrl} alt={pl.name} className="w-11 h-11 rounded-xl object-cover shadow-sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate">{pl.name}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{pl.trackCount || 0} 首歌曲</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Center Hero Stage View */}
        <main className={`flex-1 h-full flex flex-col justify-between overflow-hidden relative z-10 ${displayMode === 'stage' ? 'p-0' : 'p-4 sm:p-6 md:p-8'}`}>
          {/* Track Header Card */}
          <div className={`${displayMode === 'stage' ? 'hidden' : 'flex'} items-center gap-4 sm:gap-5 z-10 glass-card p-3.5 sm:p-4 rounded-3xl border border-white/10 w-fit backdrop-blur-2xl shadow-xl transition-all`}>
            <div className="relative">
              <img
                src={currentSong.coverUrl}
                alt={currentSong.title}
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
            </div>
          </div>

          {/* Echora Kinetic Lyrics Animation Stage */}
          <YouTubePlayer immersive={displayMode === 'stage'} />
          {currentSong.source === 'ytmusic' && !isPlaying && !youtubeError && (
            <div className="pointer-events-none absolute inset-x-8 bottom-36 z-20 text-center" role="status">
              <span className="rounded-full border border-[#62f5c4]/25 bg-[#111720]/85 px-4 py-2 text-xs font-semibold text-[#b8ffe2] shadow-xl backdrop-blur-xl">{playbackState === 'buffering' || playbackState === 'loading' ? 'YouTube 正在準備播放…' : '請在下方 YouTube 播放器按下原生播放鍵以開始有聲播放'}</span>
            </div>
          )}
          {!isLoadingLyrics && currentLyrics && currentLyrics.lines.length === 0 && (
            <div className="pointer-events-none absolute inset-x-8 top-1/2 z-20 -translate-y-1/2 text-center" role="status">
              <div className="mx-auto max-w-sm rounded-2xl border border-white/15 bg-[#111720]/85 px-5 py-4 text-sm text-slate-200 shadow-2xl backdrop-blur-xl">
                <p className="font-bold text-white">{lyricsStatus === 'instrumental' ? '這是一首純音樂內容' : lyricsStatus === 'error' ? '歌詞暫時無法載入' : '這首歌目前沒有可取得的同步歌詞'}</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">{lyricsStatus === 'instrumental' ? '你仍可使用真實播放時間、視覺舞台與曲目控制。' : lyricsStatus === 'error' ? '請稍後重試或繼續使用真實播放時間與視覺舞台。' : 'Echora 不會把歌曲標題與作者當作歌詞顯示。你仍可使用真實播放時間與視覺舞台。'}</p>
              </div>
            </div>
          )}
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
          />

          {showTuning && (
            <OriginalFoliaTuningPanel
              mode={activeVisualizer}
              autoMode={autoVisualizer}
              onAutoModeChange={setAutoVisualizer}
              onModeChange={setActiveVisualizer}
              onClose={() => setShowTuning(false)}
              backgroundMode={backgroundMode}
              onBackgroundModeChange={setBackgroundMode}
              tunings={visualizerTunings}
              onTuningsChange={setVisualizerTunings}
            />
          )}
          {displayMode === 'stage' && !showTuning && (
            <div className="fixed inset-x-0 bottom-0 z-[70] flex items-center justify-center gap-2 border-t border-white/10 bg-[#07090e]/80 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:rounded-2xl sm:border sm:p-2">
              <button
                type="button"
                onClick={() => void returnToPlaylist()}
                className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20"
                aria-label="返回歌單選擇頁"
              >
                ← 歌單
              </button>
              <button
                type="button"
                onClick={() => void leaveImmersiveStage()}
                className="rounded-xl border border-[#62f5c4]/35 bg-[#62f5c4]/15 px-3 py-2 text-xs font-bold text-[#b8ffe2] hover:bg-[#62f5c4]/25"
                aria-label="退出沉浸舞台"
              >
                退出全螢幕
              </button>
              {currentSong.source === 'ytmusic' && (
                <button
                  type="button"
                  onClick={playPause}
                  className="rounded-xl bg-gradient-to-r from-[#62f5c4] to-teal-400 px-3 py-2 text-xs font-extrabold text-black shadow-lg"
                  aria-label={isPlaying ? '暫停 YouTube 音訊' : '播放 YouTube 音訊'}
                >
                  {isPlaying ? '暫停' : '播放音訊'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowTuning(true)}
                className="rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-xs font-bold text-white/80 hover:text-white"
                aria-label="開啟舞台設定"
              >
                ⚙
              </button>
            </div>
          )}

          {/* Bottom controls are intentionally absent in immersive mode. */}
          <div className={`${displayMode === 'stage' ? 'hidden' : 'block'} z-20 glass-panel p-4 sm:p-5 md:p-6 rounded-3xl border border-white/15 shadow-2xl space-y-3.5`}>
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
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2 md:w-auto">
                <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">目前舞台</p><p className="text-xs font-extrabold text-[#b8ffe2]">{activeVisualizer}</p></div>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setLyricsOffsetSeconds(value => Math.max(-10, Number((value - 0.25).toFixed(2))))} className="rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1.5 text-[11px] font-bold text-slate-300 hover:text-white" aria-label="讓歌詞延後 0.25 秒">歌詞 −</button>
                  <button type="button" onClick={() => setLyricsOffsetSeconds(0)} className="rounded-lg border border-[#62f5c4]/25 bg-[#62f5c4]/10 px-2 py-1.5 text-[11px] font-bold text-[#b8ffe2]" aria-label="重設歌詞同步偏移">{lyricsOffsetSeconds === 0 ? '同步' : `${lyricsOffsetSeconds > 0 ? '+' : ''}${lyricsOffsetSeconds.toFixed(2)}s`}</button>
                  <button type="button" onClick={() => setLyricsOffsetSeconds(value => Math.min(10, Number((value + 0.25).toFixed(2))))} className="rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1.5 text-[11px] font-bold text-slate-300 hover:text-white" aria-label="讓歌詞提前 0.25 秒">歌詞 ＋</button>
                  <button onClick={() => setShowTuning(value => !value)} className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${showTuning ? 'border-[#62f5c4]/50 bg-[#62f5c4]/20 text-[#62f5c4]' : 'border-white/10 bg-white/[0.05] text-slate-300 hover:text-white'}`} aria-label="開啟視覺模式與舞台設定">
                    視覺與舞台設定
                  </button>
                </div>
              </div>

              {/* Media Controls */}
              <div className="flex items-center gap-5 sm:gap-6">
                <button
                  onClick={prev}
                  className="p-3 rounded-full hover:bg-white/10 btn-spring text-white text-lg"
                  aria-label="上一首"
                >
                  ⏮
                </button>
                <button
                  onClick={playPause}
                  className={`p-4 rounded-full bg-gradient-to-r from-[#62f5c4] to-teal-400 text-black shadow-xl hover:scale-105 btn-spring text-xl font-bold ${
                    isPlaying ? 'playing-pulse-glow' : ''
                  }`}
                  aria-label={isPlaying ? '暫停' : '播放'}
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>
                <button
                  onClick={next}
                  className="p-3 rounded-full hover:bg-white/10 btn-spring text-white text-lg"
                  aria-label="下一首"
                >
                  ⏭
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Spotify OAuth Connection Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 modal-backdrop-enter">
          <div className="glass-panel p-6 md:p-8 rounded-3xl w-full max-w-md space-y-5 text-white shadow-2xl border border-white/15 modal-panel-enter">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold font-heading">連線 Spotify / YouTube Music</h3>
              <button
                onClick={() => setShowConnectModal(false)}
                className="text-slate-400 hover:text-white text-lg p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              使用 Spotify 官方 OAuth 登入後，Echora 會即時同步播放狀態、播放控制與你的個人歌單。你的密碼永遠不會經過 Echora。
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
                onClick={() => setShowConnectModal(false)}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-slate-300 transition-colors"
              >
                取消
              </button>
              {activeSource === 'ytmusic' ? (youtubeConnected ? (
                <button onClick={() => { disconnectYouTube(); setShowConnectModal(false); }} className="px-5 py-2.5 rounded-xl border border-rose-400/25 text-rose-200 hover:bg-rose-500/20 text-xs font-extrabold transition-all">解除 YouTube</button>
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
