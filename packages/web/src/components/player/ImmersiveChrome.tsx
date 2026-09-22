import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';

// src/components/player/ImmersiveChrome.tsx
// One single bottom-right row holding every stage control.
//
// It used to carry 歌單 (back to playlist) and a 設定 popover (animation picker, background
// picker, tuning entry, lyrics status, offset controls, 退出全螢幕). All of that moved into the
// floating control panel — the same 歌曲資訊 / 歌詞資訊 / 播放控制 / 播放佇列 / 帳戶資訊 panel as
// the normal player page. What is left is the transport plus whatever the page hands in through
// `children` (the panel toggle and 退出全螢幕), laid out in the same row so nothing floats over
// anything else.
//
// Volume stays out of here on purpose: inside the stage it is keyboard-only (↑ / ↓ / M), a rule
// locked by components/player/stageVolumeGuard.test.ts.

type ImmersiveChromeProps = {
  isPlaying: boolean;
  showTransport: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPlayPause: () => void;
  /** Extra controls appended to the same row, after the transport. */
  children?: ReactNode;
};

export default function ImmersiveChrome({
  isPlaying,
  showTransport,
  onPrev,
  onNext,
  onPlayPause,
  children,
}: ImmersiveChromeProps) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] flex items-center justify-center gap-2 border-t border-white/10 bg-[#07090e]/80 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:rounded-2xl sm:border sm:p-2" role="group" aria-label={t('player.immersiveControls')}>
      <span id="immersive-playback-status" className="sr-only" aria-live="polite">{isPlaying ? t('player.nowPlayingStatus') : t('player.pausedStatus')}</span>
      {showTransport && (
        <>
          <button type="button" onClick={onPrev} className="min-h-11 min-w-11 rounded-xl border border-white/15 bg-black/35 px-2.5 py-2 text-white/80 hover:bg-white/10 hover:text-white" aria-label={t('player.prev')}><SkipBack aria-hidden="true" className="h-4 w-4" /></button>
          <button
            type="button"
            onClick={onPlayPause}
            className="inline-flex min-h-11 min-w-[4.75rem] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#62f5c4] to-teal-400 px-3 py-2 text-xs font-extrabold text-black shadow-lg transition hover:brightness-110 active:scale-95"
            aria-label={isPlaying ? t('player.pauseAudio') : t('player.playAudio')}
            aria-pressed={isPlaying}
            aria-describedby="immersive-playback-status"
            title={isPlaying ? t('player.pauseAudio') : t('player.playAudio')}
          >
            {isPlaying ? <Pause aria-hidden="true" className="h-4 w-4" fill="currentColor" /> : <Play aria-hidden="true" className="h-4 w-4" fill="currentColor" />}
            <span>{isPlaying ? t('player.pause') : t('player.play')}</span>
          </button>
          <button type="button" onClick={onNext} className="min-h-11 min-w-11 rounded-xl border border-white/15 bg-black/35 px-2.5 py-2 text-white/80 hover:bg-white/10 hover:text-white" aria-label={t('player.next')}><SkipForward aria-hidden="true" className="h-4 w-4" /></button>
        </>
      )}
      {children}
    </div>
  );
}
