import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePlayer } from '../contexts/PlayerContext';
import { createCoverPlaceholder } from '../utils/coverPlaceholders';
import BrandMark from '../components/BrandMark';

export default function Library() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const {
    activeSource,
    setActiveSource,
    youtubeConnected,
    youtubeConnectionState,
    youtubeProfile,
    userPlaylists,
    favoriteSongs,
    isSyncingLibrary,
    libraryError,
    lastLibrarySyncAt,
    loadSourcePlaylists,
    loadYouTubePlaylist,
    play,
    switchYouTubeAccount,
    disconnectYouTube,
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
    ? t('library.lastSync', { time: new Intl.DateTimeFormat(i18n.language || 'zh-TW', { hour: '2-digit', minute: '2-digit' }).format(lastLibrarySyncAt) })
    : t('library.notSynced');

  return (
    <div className="min-h-screen bg-[#07090e] pb-[calc(8rem+env(safe-area-inset-bottom))] font-sans text-white selection:bg-[#62f5c4] selection:text-black sm:pb-32">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-[#0d111a]/80 px-5 py-4 backdrop-blur-2xl sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/app')}
            className="rounded-2xl border border-white/10 p-2.5 text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F9F871]"
            aria-label={t('library.backToExplore')}
          >
            <ArrowLeft aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
          </button>
          <div className="flex items-center gap-2"><BrandMark size={32} /><div><h1 className="font-heading text-lg font-extrabold text-white">{t('library.title')}</h1><p className="text-[10px] font-semibold text-slate-500">{t('library.subtitle')}</p></div></div>
        </div>
        {youtubeConnected && <button type="button" onClick={() => void loadSourcePlaylists()} disabled={isSyncingLibrary} className="rounded-xl border border-[#62f5c4]/30 bg-[#62f5c4]/10 px-3 py-2 text-xs font-bold text-[#b8ffe2] transition hover:bg-[#62f5c4]/20 disabled:cursor-wait disabled:opacity-60">{isSyncingLibrary ? t('library.syncing') : t('library.resync')}</button>}
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-8 px-5 py-8 sm:px-8 lg:py-12">
        {youtubeConnected ? (
          <section className="rounded-[28px] border border-[#ff3d57]/20 bg-gradient-to-br from-[#27141b] via-[#111720] to-[#101923] p-6 shadow-2xl sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4"><img src={youtubeProfile?.avatarUrl || createCoverPlaceholder(youtubeProfile?.name || 'YouTube', 'artist')} alt={t('library.ytAvatarAlt')} className="h-14 w-14 rounded-2xl border border-white/15 object-cover" /><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#ff7180]">{t('library.readyEyebrow')}</p><h2 className="mt-1 text-xl font-extrabold text-white">{youtubeProfile?.name || t('library.ytFallbackName')}</h2><p className="mt-1 text-xs text-slate-400">{youtubeConnectionState === 'syncing' ? t('library.syncingPrivate') : syncLabel}</p></div></div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1.5 text-xs font-extrabold text-emerald-100">{t('library.playlistCount', { count: userPlaylists.length })}</span>
                <button type="button" onClick={() => void switchYouTubeAccount()} className="min-h-11 rounded-xl border border-[#ff7180]/35 bg-[#ff3d57]/10 px-3 py-2 text-xs font-extrabold text-[#ffb0b8] transition hover:bg-[#ff3d57]/20">{t('library.switchAccount')}</button>
                <button type="button" onClick={disconnectYouTube} className="min-h-11 rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/10">{t('library.signOutYouTube')}</button>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-[28px] border border-amber-300/20 bg-amber-300/10 p-6 shadow-xl sm:p-7" aria-labelledby="library-connect-heading">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-200">{t('library.notConnected')}</p>
                <h2 id="library-connect-heading" className="mt-1 text-lg font-extrabold text-white">{t('library.connectHeading')}</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">{t('library.connectDescription')}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button type="button" onClick={() => navigate('/app?source=local#explore-library')} className="min-h-11 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-xs font-extrabold text-white transition hover:bg-white/10">{t('library.exploreLocalFirst')}</button>
                <button type="button" onClick={() => navigate('/app?connect=1')} className="min-h-11 rounded-xl bg-[#62f5c4] px-4 py-3 text-xs font-extrabold text-black transition hover:brightness-110">{t('library.connectMyMusic')}</button>
              </div>
            </div>
          </section>
        )}

        {libraryError ? <section role="alert" className="rounded-2xl border border-rose-300/25 bg-rose-300/10 p-5"><p className="font-bold text-rose-100">{t('library.syncErrorTitle')}</p><p className="mt-1 text-sm leading-6 text-rose-200/80">{libraryError}</p><button type="button" onClick={() => void loadSourcePlaylists()} className="mt-4 min-h-11 rounded-xl border border-rose-200/25 px-4 py-2 text-xs font-bold text-rose-100 transition hover:bg-rose-300/10">{t('library.retrySync')}</button></section> : null}

        <section aria-labelledby="playlists-heading" className="scroll-mt-24">
          <div className="mb-4 flex items-end justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#62f5c4]">{t('library.connectedPlaylistsEyebrow')}</p><h2 id="playlists-heading" className="mt-1 text-2xl font-extrabold text-white">{t('library.myPlaylists')}</h2></div>{isSyncingLibrary ? <span className="text-xs font-semibold text-[#b8ffe2]">{t('library.loading')}</span> : null}</div>
          {userPlaylists.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{userPlaylists.map(playlist => <button key={playlist.id} type="button" onClick={() => void openPlaylist(playlist.id)} className="group flex min-h-24 items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.035] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#62f5c4]/40 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F9F871]"><img src={playlist.coverUrl || createCoverPlaceholder(playlist.name)} alt="" className="h-16 w-16 rounded-2xl object-cover shadow-lg" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-extrabold text-white group-hover:text-[#62f5c4]">{playlist.name}</span><span className="mt-1 block text-xs text-slate-400">{t('library.trackCount', { count: playlist.trackCount || 0 })}</span></span><ArrowRight aria-hidden="true" className="h-4 w-4 text-[#62f5c4]" />
</button>)}</div> : !isSyncingLibrary && youtubeConnected && !libraryError ? <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.025] p-8 text-center"><p className="font-bold text-slate-200">{t('library.noPlaylistsTitle')}</p><p className="mt-2 text-sm text-slate-500">{t('library.noPlaylistsHint')}</p></div> : !youtubeConnected ? <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.025] p-6 text-center"><p className="font-bold text-slate-200">{t('library.connectToSeePlaylists')}</p><p className="mt-2 text-sm text-slate-500">{t('library.connectToSeePlaylistsHint')}</p></div> : null}
        </section>

        <section className="scroll-mt-24 rounded-[28px] border border-[#62f5c4]/20 bg-gradient-to-br from-[#0f2928] via-[#101923] to-[#111126] p-6 shadow-xl sm:p-7" aria-labelledby="local-showcase-heading">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#62f5c4]">{t('library.localShowcaseEyebrow')}</p>
              <h2 id="local-showcase-heading" className="mt-1 text-xl font-extrabold text-white">{t('library.localShowcaseTitle')}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">{t('library.localShowcaseDescription')}</p>
            </div>
            <button type="button" onClick={() => navigate('/app?source=local#explore-library')} className="min-h-11 shrink-0 rounded-xl bg-[#62f5c4] px-5 py-3 text-xs font-extrabold text-black transition hover:brightness-110">{t('library.exploreShowcase')} <ArrowRight aria-hidden="true" className="ml-1 inline-block h-4 w-4 align-[-3px]" /></button>
          </div>
        </section>

        {favoriteSongs.length ? <section><div className="mb-4"><div className="flex flex-wrap items-center gap-2"><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#F9F871]">{t('library.favoritesEyebrow')}</p><span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-bold text-slate-400">{t('library.keptForYou')}</span></div><h2 className="mt-1 text-2xl font-extrabold text-white">{t('library.favoritesTitle')}</h2><p className="mt-1 text-xs text-slate-500">{t('library.favoritesHint')}</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{favoriteSongs.map(song => <div key={`favorite-${song.source}-${song.id}`} className="flex items-center gap-3 rounded-2xl border border-[#F9F871]/15 bg-[#F9F871]/[0.035] p-3"><button type="button" onClick={() => { play(song, favoriteSongs); navigate('/player'); }} className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F9F871]"><img src={song.coverUrl || createCoverPlaceholder(song.title, 'artist')} alt="" className="h-12 w-12 rounded-xl object-cover" /><span className="min-w-0"><span className="flex items-center gap-2"><span className="truncate text-sm font-bold text-white">{song.title}</span></span><span className="block truncate text-xs text-slate-500">{typeof song.artists[0] === 'string' ? song.artists[0] : song.artists[0]?.name || t('library.unknownArtist')}</span></span></button><button type="button" onClick={() => toggleFavoriteSong(song)} className="rounded-xl px-2 py-2 text-lg text-[#F9F871] transition hover:bg-white/10" aria-label={t('library.removeFavorite', { title: song.title })}><Star aria-hidden="true" className="h-4 w-4" fill="currentColor" /></button>
</div>)}</div></section> : null}
      </main>
    </div>
  );
}
