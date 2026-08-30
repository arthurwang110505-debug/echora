import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

type ConnectModalProps = {
  dialogRef: RefObject<HTMLDivElement | null>;
  spotifyAvailable: boolean;
  activeSource: 'spotify' | 'ytmusic' | 'local';
  spotifyError: string | null;
  youtubeError: string | null;
  youtubeConnected: boolean;
  spotifyConnected: boolean;
  onClose: () => void;
  onConnectYouTube: () => void;
  onSwitchYouTube: () => void;
  onDisconnectYouTube: () => void;
  onConnectSpotify: () => void;
  onDisconnectSpotify: () => void;
};

export default function ConnectModal({
  dialogRef,
  spotifyAvailable,
  activeSource,
  spotifyError,
  youtubeError,
  youtubeConnected,
  spotifyConnected,
  onClose,
  onConnectYouTube,
  onSwitchYouTube,
  onDisconnectYouTube,
  onConnectSpotify,
  onDisconnectSpotify,
}: ConnectModalProps) {
  const { t } = useTranslation();
  const showYouTube = !spotifyAvailable || activeSource !== 'spotify';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 modal-backdrop-enter" role="dialog" aria-modal="true" aria-labelledby="player-connect-title" aria-describedby="player-connect-copy">
      <div ref={dialogRef} tabIndex={-1} className="glass-panel p-6 md:p-8 rounded-3xl w-full max-w-md space-y-5 text-white shadow-2xl border border-white/15 modal-panel-enter">
        <div className="flex justify-between items-center">
          <h3 id="player-connect-title" className="text-xl font-bold font-heading">{spotifyAvailable ? t('player.connectSpotifyYt') : t('player.connectYt')}</h3>
          <button type="button" onClick={onClose} aria-label={t('player.closeConnect')} className="text-slate-400 hover:text-white text-lg p-1 rounded-lg hover:bg-white/10 transition-colors">
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <p id="player-connect-copy" className="text-xs text-slate-300 leading-relaxed">
          {t('player.connectCopy')}
        </p>
        {spotifyError && (
          <p className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs leading-5 text-rose-200">
            {spotifyError}<br />{t('player.spotifyRedirectHint')}
          </p>
        )}
        {youtubeError && (
          <p className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs leading-5 text-rose-200">
            {youtubeError}
          </p>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-slate-300 transition-colors">
            {t('player.cancel')}
          </button>
          {showYouTube ? (youtubeConnected ? (
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={onSwitchYouTube} className="rounded-xl border border-[#ff7180]/35 bg-[#ff3d57]/10 px-4 py-2.5 text-xs font-extrabold text-[#ffb0b8] transition hover:bg-[#ff3d57]/20">{t('player.switchAccount')}</button>
              <button type="button" onClick={onDisconnectYouTube} className="rounded-xl border border-rose-400/25 px-4 py-2.5 text-xs font-extrabold text-rose-200 transition hover:bg-rose-500/20">{t('player.signOutYouTube')}</button>
            </div>
          ) : (
            <button onClick={onConnectYouTube} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#ff4b5c] to-[#ff1744] text-white text-xs font-extrabold shadow-lg hover:brightness-110 btn-spring">{t('player.signInYouTube')}</button>
          )) : spotifyConnected ? (
            <button onClick={onDisconnectSpotify} className="px-5 py-2.5 rounded-xl border border-rose-400/25 text-rose-200 hover:bg-rose-500/20 text-xs font-extrabold transition-all">
              {t('player.disconnect')}
            </button>
          ) : (
            <button onClick={onConnectSpotify} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#62f5c4] to-teal-400 text-black text-xs font-extrabold shadow-lg hover:brightness-110 btn-spring">
              {t('player.signInSpotify')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
