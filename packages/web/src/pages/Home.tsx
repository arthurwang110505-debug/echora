import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePlayer } from '../contexts/PlayerContext';
import { type Song } from '@echora/core';
import { Carousel3D } from '../components/Carousel3D';
import { spotifyClientId } from '../integrations/spotifyAuth';
import { createCoverPlaceholder } from '../utils/coverPlaceholders';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const FEATURED_SONGS: Song[] = [
  {
    id: 'sp_1', title: 'Starboy', artists: [{ id: '1', name: 'The Weeknd, Daft Punk' }],
    album: { id: 'alb_1', name: 'Starboy' }, durationMs: 230000,
    coverUrl: createCoverPlaceholder('Starboy', 'artist'), source: 'spotify',
  },
  {
    id: 'sp_2', title: 'Blinding Lights', artists: [{ id: '1', name: 'The Weeknd' }],
    album: { id: 'alb_2', name: 'After Hours' }, durationMs: 200000,
    coverUrl: createCoverPlaceholder('Blinding Lights', 'artist'), source: 'spotify',
  },
  {
    id: 'yt_1', title: '夜に駆ける', artists: [{ id: '2', name: 'YOASOBI' }],
    album: { id: 'alb_3', name: 'THE BOOK' }, durationMs: 261000,
    coverUrl: createCoverPlaceholder('夜に駆ける', 'artist'), source: 'ytmusic', audioUrl: 'by4SYYWlhEs',
  },
  {
    id: 'yt_2', title: 'First Love', artists: [{ id: '3', name: 'Utada Hikaru' }],
    album: { id: 'alb_4', name: 'First Love' }, durationMs: 257000,
    coverUrl: createCoverPlaceholder('First Love', 'artist'), source: 'ytmusic', audioUrl: 'o1sUaVJUeB0',
  },
  {
    id: 'sp_3', title: 'Die With A Smile', artists: [{ id: '4', name: 'Lady Gaga, Bruno Mars' }],
    album: { id: 'alb_5', name: 'Die With A Smile' }, durationMs: 251000,
    coverUrl: createCoverPlaceholder('Die With A Smile', 'artist'), source: 'spotify',
  },
  {
    id: 'yt_3', title: 'アイドル', artists: [{ id: '2', name: 'YOASOBI' }],
    album: { id: 'alb_6', name: 'Idol' }, durationMs: 213000,
    coverUrl: createCoverPlaceholder('アイドル', 'artist'), source: 'ytmusic', audioUrl: 'ZRtdQ81jPUQ',
  },
];

const sources = [
  { id: 'spotify' as const, label: 'Spotify', dot: 'bg-[#1ed760]' },
  { id: 'ytmusic' as const, label: 'YouTube Music', dot: 'bg-[#ff3d57]' },
  { id: 'local' as const, label: '本地音樂', dot: 'bg-amber-300' },
];

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    currentSong, isPlaying, play, playPause, next, prev, setPlaylist,
    activeSource, setActiveSource, spotifyConnected, spotifyError, connectSpotify, disconnectSpotify,
    youtubeConnected, youtubeError, youtubeConnectionState, youtubeProfile, userPlaylists, isSyncingLibrary, libraryError, lastLibrarySyncAt, loadSourcePlaylists, connectYouTube, disconnectYouTube,
  } = usePlayer();

  const [searchQuery, setSearchQuery] = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [songViewMode, setSongViewMode] = useState<'3d' | 'grid'>('3d');
  const [focusedSongIndex, setFocusedSongIndex] = useState(0);
  const [connectionNotice, setConnectionNotice] = useState(false);
  const spotifyAvailable = Boolean(spotifyClientId);

  useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const filteredSongs = useMemo(() => FEATURED_SONGS.filter(song => {
    if (activeSource !== 'local' && song.source !== activeSource) return false;
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const artist = typeof song.artists[0] === 'string' ? song.artists[0] : song.artists[0]?.name || '';
    return `${song.title} ${artist} ${song.album?.name || ''}`.toLowerCase().includes(query);
  }), [activeSource, searchQuery]);

  useEffect(() => {
    setFocusedSongIndex(index => Math.min(index, Math.max(0, filteredSongs.length - 1)));
  }, [filteredSongs.length]);

  useEffect(() => {
    if (new URLSearchParams(location.search).get('youtube') === 'connected') {
      setConnectionNotice(true);
      window.history.replaceState({}, document.title, '/');
      const timer = window.setTimeout(() => setConnectionNotice(false), 5000);
      return () => window.clearTimeout(timer);
    }
  }, [location.search]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  const handlePlaySong = (song: Song) => {
    setPlaylist(FEATURED_SONGS);
    play(song, FEATURED_SONGS);
    navigate('/player');
  };

  const connectLabel = activeSource === 'ytmusic' ? (youtubeConnected ? 'YouTube 已連線' : '連接 YouTube Music') : spotifyConnected ? 'Spotify 已連線' : spotifyAvailable ? '連接 Spotify' : 'Spotify 尚未啟用';
  const syncCopy = youtubeConnectionState === 'syncing' || isSyncingLibrary
    ? '歌單同步中…'
    : youtubeConnectionState === 'expired'
      ? '授權已過期，請重新登入'
      : lastLibrarySyncAt
        ? `已同步 ${userPlaylists.length} 個歌單`
        : '尚未同步歌單';

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#07090e] text-slate-100 selection:bg-[#62f5c4] selection:text-black">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-56 h-[32rem] w-[32rem] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute -bottom-64 -right-32 h-[34rem] w-[34rem] rounded-full bg-indigo-600/10 blur-[130px]" />
      </div>

      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#07090e]/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <button type="button" onClick={() => navigate('/')} className="group flex items-center gap-3 text-left">
            <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-gradient-to-br from-[#62f5c4] via-teal-400 to-indigo-500 text-lg font-black text-black shadow-[0_0_15px_rgba(98,245,196,0.3)] transition-transform group-hover:rotate-6">E</span>
            <span>
              <span className="flex items-center gap-2 font-heading text-lg font-extrabold tracking-tight text-white">ECHORA <span className="rounded-full border border-[#62f5c4]/25 bg-[#62f5c4]/10 px-1.5 py-0.5 font-sans text-[9px] font-bold tracking-wide text-[#62f5c4]">STAGE</span></span>
              <span className="hidden text-[10px] font-medium tracking-[0.16em] text-slate-500 sm:block">LYRICS / LIGHT / MOTION</span>
            </span>
          </button>

          <nav className="hidden items-center gap-1 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-1 md:flex" aria-label="主要導覽">
            <button type="button" className="rounded-xl bg-white/[0.09] px-4 py-2 text-xs font-bold text-white">探索</button>
            <button type="button" onClick={() => navigate('/library')} className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-400 transition hover:text-white">我的音樂</button>
            <button type="button" onClick={() => navigate('/settings')} className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-400 transition hover:text-white">設定</button>
          </nav>

          <div className="flex items-center gap-2">
            {youtubeConnected && youtubeProfile && <div className="hidden items-center gap-2 rounded-full border border-[#ff3d57]/30 bg-[#ff3d57]/10 px-2 py-1 sm:flex"><span className="relative"><img src={youtubeProfile.avatarUrl} alt="YouTube 頭像" className="h-7 w-7 rounded-full object-cover" /><span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 animate-pulse rounded-full bg-emerald-400 ring-2 ring-[#111720]" /></span><span className="max-w-24 truncate text-[11px] font-bold text-white">{youtubeProfile.name}</span></div>}
            {deferredPrompt && <button type="button" onClick={handleInstall} className="hidden rounded-xl border border-[#62f5c4]/25 bg-[#62f5c4]/10 px-3 py-2 text-xs font-bold text-[#62f5c4] transition hover:bg-[#62f5c4]/20 sm:block">安裝 Echora</button>}
            <button type="button" onClick={() => setShowConnectModal(true)} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-bold text-slate-200 transition hover:border-[#62f5c4]/40 hover:bg-[#62f5c4]/10 hover:text-[#62f5c4] sm:px-4 active:scale-95">
              <span className={`h-2 w-2 rounded-full ${(activeSource === 'ytmusic' ? youtubeConnected : spotifyConnected) ? 'bg-emerald-400 shadow-[0_0_9px_#34d399]' : 'bg-slate-500'}`} />
              <span className="hidden sm:inline">{connectLabel}</span><span className="sm:hidden">連接</span>
            </button>
            <button type="button" onClick={() => navigate('/settings')} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-slate-400 transition hover:border-white/20 hover:text-white active:scale-90" aria-label="設定">⚙</button>
          </div>
        </div>
      </header>

      {connectionNotice && <div className="fixed right-5 top-24 z-50 flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-[#111720]/95 px-4 py-3 text-sm font-bold text-white shadow-2xl backdrop-blur-xl"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300">✓</span><span>YouTube Music 已連線，歌單正在載入</span></div>}

      <main className="relative z-10 mx-auto max-w-[1440px] space-y-10 px-5 pb-36 pt-7 sm:px-8 lg:px-12 lg:pt-12">
        <section className="relative grid min-h-[380px] overflow-hidden rounded-[30px] border border-white/10 bg-gradient-to-br from-[#142e32] via-[#101922] to-[#111126] shadow-2xl lg:grid-cols-[1.1fr_0.9fr]">
          <div className="relative z-10 flex flex-col justify-center p-7 sm:p-10 lg:p-14">
            <span className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-[#62f5c4]/25 bg-[#62f5c4]/10 px-3.5 py-2 text-[11px] font-bold tracking-wide text-[#62f5c4]"><span className="h-1.5 w-1.5 rounded-full bg-[#62f5c4] shadow-[0_0_10px_#62f5c4]" /> 你的個人音樂呼吸舞台</span>
            <h1 className="max-w-2xl font-heading text-4xl font-black leading-[0.98] tracking-[-0.04em] text-white sm:text-5xl lg:text-7xl">讓每一首歌，<br /><span className="bg-gradient-to-r from-[#62f5c4] via-teal-200 to-white bg-clip-text text-transparent">都有自己的光。</span></h1>
            <p className="mt-6 max-w-xl text-sm leading-7 text-slate-300/80 sm:text-base">連接你的音樂來源，將即時歌詞、呼吸氛圍與動態視覺整合成一個能安裝到主畫面的沉浸式舞台。</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => currentSong ? navigate('/player') : handlePlaySong(FEATURED_SONGS[0])} className="rounded-xl bg-[#62f5c4] px-5 py-3 text-sm font-extrabold text-black shadow-[0_10px_35px_rgba(98,245,196,0.25)] transition hover:-translate-y-0.5 hover:brightness-110 active:scale-95">{currentSong ? '回到正在播放' : '開始探索'} <span className="ml-2">→</span></button>
              <button type="button" onClick={() => setShowConnectModal(true)} className="rounded-xl border border-white/15 bg-white/[0.05] px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10 active:scale-95">連接音樂服務</button>
            </div>
          </div>
          <div className="relative hidden min-h-[380px] overflow-hidden lg:block">
            <div className="absolute right-[-8%] top-[12%] h-[430px] w-[430px] rounded-full bg-[#62f5c4]/20 blur-[90px]" />
            <div className="absolute right-[13%] top-[12%] h-[310px] w-[310px] rotate-12 rounded-[42px] border border-white/20 bg-white/10 p-3 shadow-2xl backdrop-blur-xl">
              <img src={FEATURED_SONGS[0].coverUrl} alt="Starboy 專輯封面" className="h-full w-full rounded-[32px] object-cover opacity-90" />
              <div className="absolute inset-x-7 bottom-7 rounded-2xl border border-white/15 bg-[#07090e]/75 p-3 backdrop-blur-xl"><p className="text-xs font-bold text-white">Starboy</p><p className="mt-1 text-[10px] text-[#62f5c4]">The Weeknd · 歌詞舞台已準備</p></div>
            </div>
            <div className="absolute bottom-[13%] left-[10%] flex items-end gap-1 opacity-70">{[30, 60, 42, 82, 55, 95, 45, 72, 35].map((height, index) => <span key={index} className="w-1.5 rounded-full bg-[#62f5c4]" style={{ height }} />)}</div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <Stat label="視覺模式" value="07" detail="Signature scenes" />
          <Stat label="歌詞格式" value="06+" detail="LRC / YRC / VTT" />
          <Stat label="裝置支援" value="∞" detail="手機 · iPad · 桌面" />
        </section>

        <section className="space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#62f5c4]/80">Echora 3D Library</p>
              <h2 className="font-heading text-2xl font-extrabold tracking-tight text-white sm:text-3xl">探索你的下一首歌</h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Source Switcher */}
              <div className="flex w-fit rounded-2xl border border-white/10 bg-white/[0.04] p-1 backdrop-blur-md">
                {sources.map(source => (
                  <button
                    type="button"
                    key={source.id}
                    onClick={() => setActiveSource(source.id)}
                    aria-label={`切換來源至 ${source.label}`}
                    className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all duration-200 btn-spring ${
                      activeSource === source.id
                        ? 'bg-white/[0.12] text-white shadow-lg border border-white/15'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${source.dot}`} />
                    {source.label}
                  </button>
                ))}
              </div>

              {/* 3D Carousel vs Grid Toggle */}
              <div className="flex rounded-2xl border border-white/10 bg-white/[0.04] p-1 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setSongViewMode('3d')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                    songViewMode === '3d'
                      ? 'bg-gradient-to-r from-[#62f5c4] to-teal-400 text-black shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🌌 3D 輪播
                </button>
                <button
                  type="button"
                  onClick={() => setSongViewMode('grid')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                    songViewMode === 'grid'
                      ? 'bg-gradient-to-r from-[#62f5c4] to-teal-400 text-black shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  ▦ 網格列表
                </button>
              </div>

              <label className="flex min-w-[220px] items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-slate-400 transition focus-within:border-[#62f5c4]/40 focus-within:bg-white/[0.07]">
                <span aria-hidden="true">⌕</span>
                <input
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                  className="w-full bg-transparent text-xs text-white outline-none placeholder:text-slate-500"
                  placeholder="搜尋歌曲、歌手..."
                  aria-label="搜尋歌曲、歌手或專輯"
                />
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-300">
              熱門選歌榜單 <span className="ml-1 text-slate-500">{filteredSongs.length.toString().padStart(2, '0')}</span>
            </p>
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} className="text-xs font-bold text-slate-400 transition hover:text-[#62f5c4]">
                清除篩選
              </button>
            )}
          </div>

          {filteredSongs.length > 0 ? (
            songViewMode === '3d' ? (
              <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4 sm:p-6 backdrop-blur-xl shadow-2xl">
                <Carousel3D
                  items={filteredSongs}
                  initialFocusedIndex={focusedSongIndex}
                  onFocusedIndexChange={setFocusedSongIndex}
                  onSelect={handlePlaySong}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {filteredSongs.map(song => (
                  <SongCard
                    key={song.id}
                    song={song}
                    selected={currentSong?.id === song.id}
                    onPlay={() => handlePlaySong(song)}
                  />
                ))}
              </div>
            )
          ) : (
            <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.025] px-6 py-16 text-center">
              <p className="text-sm font-bold text-slate-300">{searchQuery ? '找不到符合的歌曲' : '這個來源目前還沒有歌曲'}</p>
              <p className="mt-2 text-xs text-slate-500">{searchQuery ? '可清除篩選、改用其他關鍵字，或從你的音樂庫選取已同步歌單。' : '連接音樂服務或匯入本地檔案後，內容會出現在這裡。'}</p>
              {youtubeConnected && <button type="button" onClick={() => navigate('/library')} className="mt-4 rounded-xl border border-[#62f5c4]/25 px-4 py-2 text-xs font-bold text-[#b8ffe2] transition hover:bg-[#62f5c4]/10">前往我的音樂庫</button>}
            </div>
          )}
        </section>
      </main>

      {/* Floating Mini Player */}
      {currentSong && (
        <div className="fixed bottom-4 left-4 right-4 z-30 mx-auto flex max-w-5xl items-center gap-3 rounded-2xl border border-white/15 bg-[#111720]/90 p-3 shadow-2xl backdrop-blur-2xl sm:bottom-6 sm:gap-5 sm:p-4">
          <img src={currentSong.coverUrl} alt="" className="h-11 w-11 rounded-xl object-cover sm:h-14 sm:w-14" />
          <button type="button" onClick={() => navigate('/player')} className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-extrabold text-white">{currentSong.title}</p>
            <p className="mt-0.5 truncate text-xs text-[#62f5c4] font-medium">
              {typeof currentSong.artists[0] === 'string' ? currentSong.artists[0] : currentSong.artists[0]?.name}
            </p>
          </button>
          <div className="hidden items-end gap-1 sm:flex">
            {[12, 20, 15, 26, 18].map((height, index) => (
              <span
                key={index}
                className={`w-1 rounded-full ${isPlaying ? 'animate-pulse bg-[#62f5c4]' : 'bg-slate-600'}`}
                style={{ height }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={prev}
              className="hidden h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white active:scale-90 sm:flex"
              aria-label="上一首"
            >
              ⏮
            </button>
            <button
              type="button"
              onClick={playPause}
              className={`flex h-10 w-10 items-center justify-center rounded-full bg-[#62f5c4] text-sm font-black text-black transition active:scale-90 ${
                isPlaying ? 'playing-pulse-glow' : ''
              }`}
              aria-label={isPlaying ? '暫停' : '播放'}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button
              type="button"
              onClick={next}
              className="hidden h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white active:scale-90 sm:flex"
              aria-label="下一首"
            >
              ⏭
            </button>
          </div>
          <button
            type="button"
            onClick={() => navigate('/player')}
            className="hidden rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 transition hover:border-[#62f5c4]/40 hover:text-[#62f5c4] active:scale-95 md:block"
          >
            開啟舞台 →
          </button>
        </div>
      )}

      {/* Spotify Connect Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xl modal-backdrop-enter" role="dialog" aria-modal="true" aria-labelledby="connect-title">
          <div className="w-full max-w-md rounded-3xl border border-white/15 bg-[#111720] p-6 shadow-2xl sm:p-8 modal-panel-enter">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#62f5c4]">Music connection</p>
                <h2 id="connect-title" className="font-heading text-2xl font-extrabold text-white">連接你的音樂</h2>
              </div>
              <button type="button" onClick={() => setShowConnectModal(false)} className="text-slate-400 transition hover:text-white" aria-label="關閉">✕</button>
            </div>
            <p className="text-sm leading-6 text-slate-300">選擇音樂來源後，使用官方 OAuth 登入；Echora 不會看到你的密碼。</p>
            {spotifyError && (
              <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs leading-5 text-rose-200">
                {spotifyError}<br />請先在 Spotify Developer Dashboard 設定 Redirect URI。
              </p>
            )}
            {!spotifyAvailable && <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">Spotify 尚未取得開發者權限或設定 Client ID，因此目前不可登入與測試；這不是播放故障。</p>}
            {youtubeError && <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs leading-5 text-rose-200">{youtubeError}</p>}
            {activeSource === 'ytmusic' && youtubeConnected && <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-xs text-emerald-100"><p className="font-bold">已連線 {youtubeProfile?.name || 'YouTube'} · {syncCopy}</p><p className="mt-1 text-emerald-100/75">歌單會與「我的音樂庫」及播放器共用。</p>{libraryError ? <p className="mt-2 text-rose-200">{libraryError}</p> : null}<div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void loadSourcePlaylists()} disabled={isSyncingLibrary} className="rounded-lg border border-emerald-200/25 px-3 py-1.5 font-bold transition hover:bg-emerald-300/10 disabled:opacity-60">{isSyncingLibrary ? '同步中…' : '重新同步'}</button><button type="button" onClick={() => { setShowConnectModal(false); navigate('/library'); }} className="rounded-lg border border-emerald-200/25 px-3 py-1.5 font-bold transition hover:bg-emerald-300/10">開啟我的音樂庫</button></div></div>}
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setActiveSource('ytmusic')} className={`rounded-xl border px-4 py-3 text-left text-xs font-bold transition ${activeSource === 'ytmusic' ? 'border-[#ff3d57]/60 bg-[#ff3d57]/10 text-white' : 'border-white/10 bg-white/[0.03] text-slate-400'}`}>
                <span className="block text-sm text-[#ff7180]">YouTube Music</span>
                <span className="mt-1 block font-normal text-slate-500">讀取你的私人歌單</span>
              </button>
              <button type="button" onClick={() => setActiveSource('spotify')} className={`rounded-xl border px-4 py-3 text-left text-xs font-bold transition ${activeSource === 'spotify' ? 'border-[#1ed760]/60 bg-[#1ed760]/10 text-white' : 'border-white/10 bg-white/[0.03] text-slate-400'}`}>
                <span className="block text-sm text-[#1ed760]">Spotify</span>
                <span className="mt-1 block font-normal text-slate-500">{spotifyAvailable ? '同步 Spotify 歌單' : '尚未取得開發者權限'}</span>
              </button>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowConnectModal(false)} className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-400 transition hover:bg-white/5 hover:text-white">稍後</button>
              {activeSource === 'ytmusic' ? (youtubeConnected ? (
                <button type="button" onClick={() => { disconnectYouTube(); setShowConnectModal(false); }} className="rounded-xl border border-rose-400/25 px-5 py-2.5 text-xs font-extrabold text-rose-200 transition hover:bg-rose-400/10">解除 YouTube</button>
              ) : (
                <button type="button" onClick={() => void connectYouTube()} className="rounded-xl bg-[#ff3d57] px-5 py-2.5 text-xs font-extrabold text-white transition hover:brightness-110 active:scale-95">使用 Google 登入 YouTube</button>
              )) : !spotifyAvailable ? (
                <button type="button" disabled className="cursor-not-allowed rounded-xl border border-amber-300/20 bg-amber-300/10 px-5 py-2.5 text-xs font-extrabold text-amber-100">Spotify 尚未啟用</button>
              ) : spotifyConnected ? (
                <button type="button" onClick={() => { disconnectSpotify(); setShowConnectModal(false); }} className="rounded-xl border border-rose-400/25 px-5 py-2.5 text-xs font-extrabold text-rose-200 transition hover:bg-rose-400/10">解除連線</button>
              ) : (
                <button type="button" onClick={() => void connectSpotify()} className="rounded-xl bg-[#62f5c4] px-5 py-2.5 text-xs font-extrabold text-black transition hover:brightness-110 active:scale-95">使用 Spotify 登入</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.035] px-5 py-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">{label}</p>
          <p className="mt-1 font-heading text-2xl font-extrabold text-white">{value}</p>
        </div>
        <p className="text-right text-[10px] font-medium text-slate-600">{detail}</p>
      </div>
    </div>
  );
}

function SongCard({ song, selected, onPlay }: { song: Song; selected: boolean; onPlay: () => void }) {
  const artist = typeof song.artists[0] === 'string' ? song.artists[0] : song.artists[0]?.name || 'Unknown artist';
  return (
    <button type="button" onClick={onPlay} className={`group text-left btn-spring ${selected ? 'rounded-3xl ring-2 ring-[#62f5c4]/60' : ''}`}>
      <div className="relative aspect-square overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-xl transition-all duration-300 group-hover:-translate-y-1 group-hover:border-[#62f5c4]/40 group-hover:shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
        <img src={song.coverUrl} alt={`${song.title} 封面`} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/10 opacity-70" />
        <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/35 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-white backdrop-blur-md">
          {song.source === 'ytmusic' ? 'YT MUSIC' : 'SPOTIFY'}
        </span>
        <span className="absolute bottom-3 right-3 flex h-10 w-10 translate-y-2 items-center justify-center rounded-full bg-[#62f5c4] text-black opacity-0 shadow-lg transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          ▶
        </span>
      </div>
      <div className="mt-3 min-w-0 px-1">
        <p className="truncate text-sm font-extrabold text-white transition-colors group-hover:text-[#62f5c4]">{song.title}</p>
        <p className="mt-1 truncate text-xs text-slate-500">{artist}</p>
      </div>
    </button>
  );
}
