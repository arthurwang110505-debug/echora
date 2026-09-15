import { useTranslation } from 'react-i18next';
import { ArrowLeft, ClipboardList, Smartphone, Sparkles } from 'lucide-react';
import BrandMark from '../BrandMark';

type PlayerHeaderProps = {
  isYouTubeVideoMode: boolean;
  displayMode: 'stage' | 'full';
  showPlaylistDrawer: boolean;
  activeSource: 'spotify' | 'ytmusic' | 'local';
  spotifyConnected: boolean;
  youtubeConnected: boolean;
  onBack: () => void;
  onEnterStage: () => void;
  onLeaveStage: () => void;
  onOpenConnect: () => void;
  onTogglePlaylist: () => void;
};

export default function PlayerHeader({
  isYouTubeVideoMode,
  displayMode,
  showPlaylistDrawer,
  activeSource,
  spotifyConnected,
  youtubeConnected,
  onBack,
  onEnterStage,
  onLeaveStage,
  onOpenConnect,
  onTogglePlaylist,
}: PlayerHeaderProps) {
  const { t } = useTranslation();
  const connected = activeSource === 'spotify' ? spotifyConnected : youtubeConnected;
  const sourceLabel = activeSource === 'spotify'
    ? (spotifyConnected ? t('player.spotifyConnected') : t('player.myMusic'))
    : (youtubeConnected ? t('player.ytConnected') : t('player.myMusic'));
  const compactLabel = activeSource === 'spotify'
    ? (spotifyConnected ? 'Spotify' : t('player.music'))
    : (youtubeConnected ? 'YouTube' : t('player.music'));

  return (
    <header className="relative z-20 flex flex-wrap items-center justify-between gap-3 px-3 py-3 glass-panel border-b border-white/[0.08] sm:px-5 sm:py-3.5 md:flex-nowrap md:gap-0 md:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-5">
        <button
          onClick={onBack}
          className="min-h-11 min-w-11 shrink-0 rounded-2xl bg-white/[0.05] p-2.5 text-white backdrop-blur-md btn-spring hover:bg-white/[0.12]"
          title={t('player.backHome')}
          aria-label={t('player.backHome')}
        >
          <ArrowLeft aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
        </button>
        <div className="hidden sm:flex items-center gap-2">
          <BrandMark size={28} />
          <span className="font-heading text-sm font-extrabold tracking-wider text-white">ECHORA STAGE</span>
        </div>
        <div className="flex min-w-0 flex-1 rounded-2xl border border-white/[0.08] bg-white/[0.06] p-1 backdrop-blur-md sm:flex-none">
          <button
            onClick={onLeaveStage}
            className="min-h-11 min-w-0 flex-1 rounded-xl px-2 py-1.5 text-[11px] font-bold text-black shadow-md transition-all duration-200 btn-spring bg-gradient-to-r from-[#62f5c4] to-teal-400 sm:flex-none sm:px-4 sm:text-xs"
          >
            <Smartphone aria-hidden="true" className="mr-1.5 inline-block h-4 w-4 align-[-3px]" />{t('player.playerView')}
          </button>
          {!isYouTubeVideoMode && (
            <button
              onClick={onEnterStage}
              className="min-h-11 min-w-0 flex-1 rounded-xl px-2 py-1.5 text-[11px] font-bold text-slate-400 transition-all duration-200 btn-spring hover:text-white sm:flex-none sm:px-4 sm:text-xs"
            >
              <Sparkles aria-hidden="true" className="mr-1.5 inline-block h-4 w-4 align-[-3px]" />{t('player.enterStage')}
            </button>
          )}
        </div>
      </div>
      <div className="flex w-full min-w-0 items-center gap-2 md:w-auto md:gap-3">
        <button
          onClick={onOpenConnect}
          className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl border border-[#62f5c4]/30 bg-[#62f5c4]/15 px-2 py-1.5 text-[11px] font-bold text-[#62f5c4] transition-all btn-spring hover:bg-[#62f5c4]/25 sm:flex-none sm:px-4 sm:text-xs"
        >
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-[#62f5c4] shadow-[0_0_8px_#62f5c4]' : 'bg-slate-500'} `} />
          <span className="hidden sm:inline">{sourceLabel}</span>
          <span className="sm:hidden">{compactLabel}</span>
        </button>
        {displayMode === 'full' && (
          <button
            onClick={onTogglePlaylist}
            className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-bold transition-all btn-spring ${
              showPlaylistDrawer
                ? 'border-white/20 bg-white/15 text-white shadow-sm'
                : 'border-white/10 bg-white/[0.05] text-slate-400 hover:text-white'
            }`}
            title={showPlaylistDrawer ? t('player.closePlaylist') : t('player.openPlaylist')}
            aria-label={showPlaylistDrawer ? t('player.closePlaylist') : t('player.openPlaylist')}
            aria-expanded={showPlaylistDrawer}
          >
            <ClipboardList aria-hidden="true" className="h-4 w-4" />
            <span>{t('player.playlist')}</span>
          </button>
        )}
      </div>
    </header>
  );
}
