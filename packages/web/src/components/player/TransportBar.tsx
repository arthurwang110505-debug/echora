import { useTranslation } from 'react-i18next';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import VolumeControl from '../VolumeControl';
import { formatTime } from './formatTime';

type TransportBarProps = {
  isYouTubeVideoMode: boolean;
  isPlaying: boolean;
  displayedTime: number;
  duration: number;
  isSeeking: boolean;
  seekPreviewTime: number | null;
  activeVisualizer: string;
  onSeekPreview: (time: number) => void;
  onSeekStart: () => void;
  onSeekCommit: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPlayPause: () => void;
  onEnterStage: () => void;
};

export default function TransportBar({
  isYouTubeVideoMode,
  isPlaying,
  displayedTime,
  duration,
  isSeeking,
  activeVisualizer,
  onSeekPreview,
  onSeekStart,
  onSeekCommit,
  onPrev,
  onNext,
  onPlayPause,
  onEnterStage,
}: TransportBarProps) {
  const { t } = useTranslation();
  return (
    <div className={`z-20 glass-panel p-4 sm:p-5 md:p-6 rounded-3xl border border-white/15 shadow-2xl space-y-3.5 ${isYouTubeVideoMode ? 'flex justify-center' : ''}`}>
      <div className="space-y-1.5">
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={displayedTime}
          aria-label={t('player.progressAria', { current: formatTime(displayedTime), total: formatTime(duration) })}
          onMouseDown={onSeekStart}
          onTouchStart={onSeekStart}
          onChange={e => onSeekPreview(Number(e.target.value))}
          onMouseUp={onSeekCommit}
          onTouchEnd={onSeekCommit}
          className="w-full echora-slider h-2 rounded-lg"
        />
        <div className="flex justify-between text-[11px] font-mono text-slate-400 px-1 font-semibold">
          <span className={isSeeking ? 'text-[#62f5c4] font-bold' : ''}>{formatTime(displayedTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className={`flex flex-col items-center gap-4 md:flex-row ${isYouTubeVideoMode ? 'justify-center' : 'justify-between'}`}>
        {!isYouTubeVideoMode && (
          <div className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2 md:w-auto">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{t('player.currentStage')}</p>
              <p className="text-xs font-extrabold text-[#b8ffe2]">{activeVisualizer}</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {/* Volume lives in the normal chrome only - never inside the immersive stage. */}
              <VolumeControl />
              <button type="button" onClick={onEnterStage} className="min-h-11 shrink-0 rounded-xl bg-[#62f5c4] px-3 py-2 text-xs font-extrabold text-black transition hover:brightness-110" aria-label={t('player.enterFullscreenAria')}>{t('player.enterFullscreen')}</button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-5 sm:gap-6">
          <button type="button" onClick={onPrev} className="min-h-11 min-w-11 rounded-full p-3 hover:bg-white/10 btn-spring text-white text-lg" aria-label={t('player.prev')}>
            <SkipBack aria-hidden="true" className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onPlayPause}
            className={`min-h-14 min-w-14 rounded-full p-4 bg-gradient-to-r from-[#62f5c4] to-teal-400 text-black shadow-xl hover:scale-105 btn-spring text-xl font-bold ${isPlaying ? 'playing-pulse-glow' : ''}`}
            aria-label={isPlaying ? t('player.pauseAudio') : t('player.playAudio')}
            aria-pressed={isPlaying}
          >
            {isPlaying ? <Pause aria-hidden="true" className="h-6 w-6" fill="currentColor" /> : <Play aria-hidden="true" className="h-6 w-6" fill="currentColor" />}
          </button>
          <button type="button" onClick={onNext} className="min-h-11 min-w-11 rounded-full p-3 hover:bg-white/10 btn-spring text-white text-lg" aria-label={t('player.next')}>
            <SkipForward aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
      </div>

    </div>
  );
}
