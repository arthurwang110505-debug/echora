import { useTranslation } from 'react-i18next';
import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { derivePlaybackVolume, volumeToPercentLabel } from '../playback/volumeState';

/**
 * Volume + mute control for the chrome surfaces only.
 *
 * It is deliberately absent from the immersive stage (`ImmersiveChrome`): the full
 * screen stage must stay free of transport furniture, and the stage keeps keyboard
 * access (ArrowUp/ArrowDown/M) instead. The guard test in
 * `components/player/stageVolumeGuard.test.ts` locks that rule.
 */
export default function VolumeControl({ className = '', showLabel = true }: { className?: string; showLabel?: boolean }) {
  const { t } = useTranslation();
  const volume = usePlayerStore(state => state.volume);
  const isMuted = usePlayerStore(state => state.isMuted);
  const setVolume = usePlayerStore(state => state.setVolume);
  const toggleMute = usePlayerStore(state => state.toggleMute);

  const audible = derivePlaybackVolume(volume, isMuted);
  const Icon = audible <= 0 ? VolumeX : audible < 0.5 ? Volume1 : Volume2;

  return (
    <div data-testid="volume-control" className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={toggleMute}
        className="min-h-11 min-w-11 rounded-xl border border-white/15 bg-white/[0.05] px-2.5 py-2 text-white/80 transition hover:bg-white/10 hover:text-white"
        aria-label={isMuted ? t('player.unmute') : t('player.mute')}
        aria-pressed={isMuted}
        title={isMuted ? t('player.muteOn') : t('player.muteOff', { percent: volumeToPercentLabel(volume, isMuted) })}
      >
        <Icon aria-hidden="true" className="mx-auto h-4 w-4" />
      </button>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(audible * 100)}
        onChange={event => setVolume(Number(event.target.value) / 100)}
        aria-label={t('player.volume')}
        className="echora-slider h-2 w-20 rounded-lg sm:w-24"
      />
      {showLabel && (
        <span className="w-9 shrink-0 text-right text-[11px] font-mono font-semibold text-slate-400" aria-hidden="true">
          {volumeToPercentLabel(volume, isMuted)}
        </span>
      )}
    </div>
  );
}
