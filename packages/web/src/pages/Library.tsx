import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayer } from '../contexts/PlayerContext';
import { createCoverPlaceholder } from '../utils/coverPlaceholders';

export default function Library() {
  const navigate = useNavigate();
  const {
    activeSource,
    setActiveSource,
    youtubeConnected,
    youtubeConnectionState,
    youtubeProfile,
    userPlaylists,
    recentSongs,
    favoriteSongs,
    isSyncingLibrary,
    libraryError,
    lastLibrarySyncAt,
    loadSourcePlaylists,
    loadYouTubePlaylist,
    play,
    toggleFavoriteSong,
  } = usePlayer();

  useEffect(() => {
    if (youtubeConnected && activeSource !== 'ytmusic') setActiveSource('ytmusic');
  }, [activeSource, setActiveSource, youtubeConnected]);

  useEffect(() => {
    if (youtubeConnected && activeSource === 'ytmusic' && userPlaylists.length === 0 && !isSyncingLibrary && !libraryError) {
      void loadSourcePlaylists();
    }
  }, [activeSource, isSyncingLibrary, libraryError, loadSourcePlaylists, userPlaylists.length, youtubeConnected]);

  const openPlaylist = async (playlistId: string) => {
    await loadYouTubePlaylist(playlistId);
    navigate('/player');
  };

  const syncLabel = lastLibrarySyncAt
    ? `上次同步：${new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit' }).format(lastLibrarySyncAt)}`
    : '尚未同步';

  return (
    <div className="min-h-screen bg-[#07090e] pb-24 font-sans text-white selection:bg-[#62f5c4] selection:text-black">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-[#0d111a]/80 px-5 py-4 backdrop-blur-2xl sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-2xl border border-white/10 p-2.5 text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F9F871]"
            aria-label="返回探索頁"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#62f5c4] via-teal-400 to-indigo-500 text-xs font-black text-black shadow-[0_0_12px_rgba(98,245,196,0.3)]">E</span><div><h1 className="font-heading text-lg font-extrabold text-white">我的音樂庫</h1><p className="text-[10px] font-semibold text-slate-500">你的私人歌單與最近播放</p></div></div>
        </div>
        {youtubeConnected && <button type="button" onClick={() => void loadSourcePlaylists()} disabled={isSyncingLibrary} className="rounded-xl border border-[#62f5c4]/30 bg-[#62f5c4]/10 px-3 py-2 text-xs font-bold text-[#b8ffe2] transition hover:bg-[#62f5c4]/20 disabled:cursor-wait disabled:opacity-60">{isSyncingLibrary ? '同步中…' : '重新同步'}</button>}
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-8 px-5 py-8 sm:px-8 lg:py-12">
        {youtubeConnected ? (
          <section className="rounded-[28px] border border-[#ff3d57]/20 bg-gradient-to-br from-[#27141b] via-[#111720] to-[#101923] p-6 shadow-2xl sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4"><img src={youtubeProfile?.avatarUrl || createCoverPlaceholder(youtubeProfile?.name || 'YouTube', 'artist')} alt="YouTube 帳戶頭像" className="h-14 w-14 rounded-2xl border border-white/15 object-cover" /><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#ff7180]">YouTube Music 已連線</p><h2 className="mt-1 text-xl font-extrabold text-white">{youtubeProfile?.name || '你的 YouTube Music'}</h2><p className="mt-1 text-xs text-slate-400">{youtubeConnectionState === 'syncing' ? '正在同步你的私人歌單…' : syncLabel}</p></div></div>
              <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1.5 text-xs font-extrabold text-emerald-100">{userPlaylists.length} 個歌單</span>
            </div>
          </section>
        ) : (
          <section className="rounded-[28px] border border-amber-300/20 bg-amber-300/10 p-7 text-center shadow-xl"><p className="text-lg font-extrabold text-white">尚未連線 YouTube Music</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-300">連線後，這裡會顯示與播放器共用的私人歌單、同步狀態與最近播放。</p><button type="button" onClick={() => navigate('/')} className="mt-5 rounded-xl bg-[#62f5c4] px-5 py-3 text-sm font-extrabold text-black transition hover:brightness-110">返回探索並連接 YouTube</button></section>
        )}

        {libraryError ? <section role="alert" className="rounded-2xl border border-rose-300/25 bg-rose-300/10 p-5"><p className="font-bold text-rose-100">歌單同步暫時無法完成</p><p className="mt-1 text-sm leading-6 text-rose-200/80">{libraryError}</p><button type="button" onClick={() => void loadSourcePlaylists()} className="mt-4 rounded-xl border border-rose-200/25 px-4 py-2 text-xs font-bold text-rose-100 transition hover:bg-rose-300/10">重試同步</button></section> : null}

        <section>
          <div className="mb-4 flex items-end justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#62f5c4]">Shared library</p><h2 className="mt-1 text-2xl font-extrabold text-white">已同步歌單</h2></div>{isSyncingLibrary ? <span className="text-xs font-semibold text-[#b8ffe2]">正在載入…</span> : null}</div>
          {userPlaylists.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{userPlaylists.map(playlist => <button key={playlist.id} type="button" onClick={() => void openPlaylist(playlist.id)} className="group flex items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.035] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#62f5c4]/40 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F9F871]"><img src={playlist.coverUrl || createCoverPlaceholder(playlist.name)} alt="" className="h-16 w-16 rounded-2xl object-cover shadow-lg" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-extrabold text-white group-hover:text-[#62f5c4]">{playlist.name}</span><span className="mt-1 block text-xs text-slate-400">{playlist.trackCount || 0} 首歌曲 · 開啟播放佇列</span></span><span aria-hidden="true" className="text-[#62f5c4]">→</span></button>)}</div> : !isSyncingLibrary && youtubeConnected && !libraryError ? <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.025] p-10 text-center"><p className="font-bold text-slate-200">這個帳戶目前沒有可讀取的歌單</p><p className="mt-2 text-sm text-slate-500">你可以回到 YouTube Music 建立或公開一個歌單，再重新同步。</p></div> : null}
        </section>

        {recentSongs.length ? <section><div className="mb-4"><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#F9F871]">Continue listening</p><h2 className="mt-1 text-2xl font-extrabold text-white">最近播放</h2></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{recentSongs.map(song => <button key={`${song.source}-${song.id}`} type="button" onClick={() => { play(song, recentSongs); navigate('/player'); }} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-left transition hover:border-[#62f5c4]/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F9F871]"><img src={song.coverUrl || createCoverPlaceholder(song.title, 'artist')} alt="" className="h-12 w-12 rounded-xl object-cover" /><span className="min-w-0"><span className="block truncate text-sm font-bold text-white">{song.title}</span><span className="block truncate text-xs text-slate-500">{song.artists[0]?.name || 'Unknown artist'}</span></span></button>)}</div></section> : null}
        {favoriteSongs.length ? <section><div className="mb-4"><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#F9F871]">Your collection</p><h2 className="mt-1 text-2xl font-extrabold text-white">收藏曲目</h2></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{favoriteSongs.map(song => <div key={`favorite-${song.source}-${song.id}`} className="flex items-center gap-3 rounded-2xl border border-[#F9F871]/15 bg-[#F9F871]/[0.035] p-3"><button type="button" onClick={() => { play(song, favoriteSongs); navigate('/player'); }} className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F9F871]"><img src={song.coverUrl || createCoverPlaceholder(song.title, 'artist')} alt="" className="h-12 w-12 rounded-xl object-cover" /><span className="min-w-0"><span className="block truncate text-sm font-bold text-white">{song.title}</span><span className="block truncate text-xs text-slate-500">{typeof song.artists[0] === 'string' ? song.artists[0] : song.artists[0]?.name || 'Unknown artist'}</span></span></button><button type="button" onClick={() => toggleFavoriteSong(song)} className="rounded-xl px-2 py-2 text-lg text-[#F9F871] transition hover:bg-white/10" aria-label={`取消收藏 ${song.title}`}>★</button></div>)}</div></section> : null}
      </main>
    </div>
  );
}
