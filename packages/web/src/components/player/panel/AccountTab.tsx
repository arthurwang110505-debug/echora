import { useTranslation } from 'react-i18next';
import { Heart, History, Settings2, User as UserIcon } from 'lucide-react';

// src/components/player/panel/AccountTab.tsx
// 帳戶資訊 tab: which account the player is talking to, plus the two library counters.
// Upstream also offers an audio-quality selector here; Echora has no quality ladder
// (streams come from the provider or the local file), so that control has no backing state
// and is intentionally left out rather than faked.

export type AccountSource = 'spotify' | 'ytmusic' | 'local';

export type AccountTabProps = {
  activeSource: AccountSource;
  youtubeConnected: boolean;
  youtubeProfile: { name: string; avatarUrl?: string } | null;
  spotifyConnected: boolean;
  spotifyAvailable: boolean;
  favoriteCount: number;
  recentCount: number;
  onSetActiveSource: (source: AccountSource) => void;
  onConnectYouTube: () => void;
  onSwitchYouTube: () => void;
  onDisconnectYouTube: () => void;
  onConnectSpotify: () => void;
  onDisconnectSpotify: () => void;
  onOpenSettings: () => void;
};

export default function AccountTab({
  activeSource,
  youtubeConnected,
  youtubeProfile,
  spotifyConnected,
  spotifyAvailable,
  favoriteCount,
  recentCount,
  onSetActiveSource,
  onConnectYouTube,
  onSwitchYouTube,
  onDisconnectYouTube,
  onConnectSpotify,
  onDisconnectSpotify,
  onOpenSettings,
}: AccountTabProps) {
  const { t } = useTranslation();
  const sources: AccountSource[] = spotifyAvailable ? ['ytmusic', 'local', 'spotify'] : ['ytmusic', 'local'];

  const sourceLabel = (source: AccountSource) => (
    source === 'ytmusic' ? t('panel.sourceYouTube') : source === 'spotify' ? t('panel.sourceSpotify') : t('panel.sourceLocal')
  );

  const actionButton = 'h-9 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 text-[11px] font-bold text-slate-200 transition-colors hover:bg-white/10 hover:text-white';

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          {youtubeProfile?.avatarUrl ? (
            <img src={youtubeProfile.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-slate-300">
              <UserIcon aria-hidden="true" size={16} />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-white">
              {youtubeConnected && youtubeProfile?.name ? youtubeProfile.name : t('panel.notConnected')}
            </p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-500">
              {youtubeConnected ? t('panel.connectedAs') : t('panel.sourceYouTube')}
            </p>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {!youtubeConnected && (
            <button type="button" onClick={onConnectYouTube} className={actionButton}>{t('panel.connect')}</button>
          )}
          {youtubeConnected && (
            <>
              <button type="button" onClick={onSwitchYouTube} className={actionButton}>{t('panel.switchAccount')}</button>
              <button type="button" onClick={onDisconnectYouTube} className={actionButton}>{t('panel.disconnect')}</button>
            </>
          )}
          {spotifyAvailable && (
            spotifyConnected
              ? <button type="button" onClick={onDisconnectSpotify} className={actionButton}>{t('panel.disconnect')} · Spotify</button>
              : <button type="button" onClick={onConnectSpotify} className={actionButton}>{t('panel.connect')} · Spotify</button>
          )}
        </div>
      </div>

      <div className="flex rounded-xl border border-white/10 bg-white/[0.04] p-1">
        {sources.map(source => (
          <button
            key={source}
            type="button"
            onClick={() => onSetActiveSource(source)}
            aria-pressed={activeSource === source}
            className={`min-h-9 flex-1 rounded-lg text-[11px] font-bold transition-colors ${
              activeSource === source ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {sourceLabel(source)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
            <Heart aria-hidden="true" size={11} />
            {t('panel.favoriteCount')}
          </p>
          <p className="mt-1 text-sm font-extrabold text-white">{favoriteCount}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
            <History aria-hidden="true" size={11} />
            {t('panel.recentCount')}
          </p>
          <p className="mt-1 text-sm font-extrabold text-white">{recentCount}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenSettings}
        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] text-[11px] font-bold text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
      >
        <Settings2 aria-hidden="true" size={12} />
        {t('panel.openSettingsForAi')}
      </button>
    </div>
  );
}
