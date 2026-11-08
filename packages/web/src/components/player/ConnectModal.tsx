import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import YouTubeFailureMessage from '../YouTubeFailureMessage';
import type { YouTubeFailure } from '../../lib/youtubeFailure';
import type { YouTubeConnectionState } from '../../store/playerStore';

type ConnectModalProps = {
  dialogRef: RefObject<HTMLDivElement | null>;
  spotifyAvailable: boolean;
  activeSource: 'spotify' | 'ytmusic' | 'local';
  spotifyError: string | null;
  youtubeError: YouTubeFailure | null;
  youtubeConnected: boolean;
  youtubeConnectionState: YouTubeConnectionState;
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
  youtubeConnectionState,
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
          <div role="alert" className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs leading-5 text-rose-200">
            <YouTubeFailureMessage failure={youtubeError} />
          </div>
        )}
        {/* The four states the plan asked for. `syncing` and `expired` used to be invisible here:
            the modal only knew connected or not, so a dead token looked healthy and a first sync
            looked hung. */}
        {youtubeConnected && youtubeConnectionState !== 'error' && (
          <p role="status" className="flex items-center gap-2 text-[11px] text-slate-300">
            <span
              aria-hidden="true"
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                youtubeConnectionState === 'syncing' ? 'animate-pulse bg-amber-300'
                  : youtubeConnectionState === 'expired' ? 'bg-rose-400'
                    : 'bg-emerald-400'
              }`}
            />
            {youtubeConnectionState === 'syncing' ? t('player.stateSyncing')
              : youtubeConnectionState === 'expired' ? t('player.stateExpired')
                : t('player.stateConnected')}
          </p>
        )}
        {/*
          In-product privacy notice for the Google grant. Google's user-data
          policy expects the disclosure next to the action that triggers the
          OAuth flow, not only inside the privacy policy page.
        */}
        {showYouTube && (
          <p className="text-[11px] leading-5 text-slate-400">
            {t('player.connectPrivacyNote')}{' '}
            <a href="/privacy" target="_blank" rel="noreferrer" className="font-bold text-[#62f5c4] underline decoration-[#62f5c4]/40 underline-offset-2">
              {t('player.connectPrivacyLink')}
            </a>
            <span className="px-1 opacity-40">·</span>
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer" className="font-bold text-slate-300 underline decoration-white/20 underline-offset-2">
              {t('player.connectYoutubeTermsLink')}
            </a>
            <span className="px-1 opacity-40">·</span>
            <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="font-bold text-slate-300 underline decoration-white/20 underline-offset-2">
              {t('player.connectGooglePrivacyLink')}
            </a>
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
