import { Pause, Play, Star } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePlayer } from '../contexts/PlayerContext';
import { CoverImage } from './LoadingSkeletons';

export default function PersistentMiniPlayer() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentSong, isPlaying, playPause, favoriteSongs, toggleFavoriteSong } = usePlayer();

  const isPlayerRoute = location.pathname === '/player' || location.pathname.startsWith('/oauth/');
  if (!currentSong || isPlayerRoute) return null;

  const artist = typeof currentSong.artists[0] === 'string'
    ? currentSong.artists[0]
    : currentSong.artists[0]?.name || 'Echora';
  const isFavorite = favoriteSongs.some(song => song.source === currentSong.source && song.id === currentSong.id);

  return (
    <aside className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto flex min-h-16 max-w-4xl items-center gap-3 rounded-2xl border border-white/15 bg-[#0d111a]/95 px-3 py-2.5 shadow-[0_18px_50px_rgba(0,0,0,0.42)] backdrop-blur-2xl sm:bottom-5 sm:gap-4 sm:px-4" aria-label="目前播放">
      <CoverImage src={currentSong.coverUrl} alt="" wrapperClassName="h-11 w-11 shrink-0 rounded-xl sm:h-12 sm:w-12" className="h-11 w-11 rounded-xl object-cover sm:h-12 sm:w-12" />
      <button type="button" onClick={() => navigate('/player')} className="min-h-11 min-w-0 flex-1 text-left outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-[#62f5c4] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d111a]" aria-label={`開啟 ${currentSong.title} 的播放器`}>
        <p className="truncate text-sm font-extrabold text-white">{currentSong.title}</p>
        <p className="mt-0.5 truncate text-xs font-medium text-[#9ff9d7]">{artist}</p>
      </button>
      <button
        type="button"
        onClick={() => toggleFavoriteSong(currentSong)}
        aria-label={isFavorite ? `取消收藏 ${currentSong.title}` : `收藏 ${currentSong.title}`}
        aria-pressed={isFavorite}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#F9F871] transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F9F871] active:scale-90"
      >
        <Star aria-hidden="true" className="h-4 w-4" fill={isFavorite ? 'currentColor' : 'none'} />
      </button>
      <button
        type="button"
        onClick={playPause}
        aria-label={isPlaying ? '暫停播放' : '繼續播放'}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#62f5c4] text-black shadow-[0_0_18px_rgba(98,245,196,0.25)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#62f5c4] active:scale-90 ${isPlaying ? 'playing-pulse-glow' : ''}`}
      >
        {isPlaying ? <Pause aria-hidden="true" className="h-4 w-4" fill="currentColor" /> : <Play aria-hidden="true" className="h-4 w-4" fill="currentColor" />}
      </button>
    </aside>
  );
}
