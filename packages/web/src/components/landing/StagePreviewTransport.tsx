import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { formatTime } from '../player/formatTime';

/**
 * StagePreviewTransport — the landing page borrows the player's own control
 * furniture (`glass-panel` shell, mint gradient play button, `echora-slider`
 * progress) so the preview reads as a screenshot of /player rather than a
 * mock-up of one.
 *
 * Every control is real: prev / next step through the preview scenes and the
 * play button pauses the loop. The only staged part is the timeline — it walks
 * the preview scene instead of a real audio clock, which the copy underneath
 * states plainly.
 */

interface StagePreviewTransportProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onStartDemo: () => void;
  /** Active Folia visualizer mode name, shown like the player's "current stage". */
  stageMode: string;
  /** Length of the previewed scene; the progress bar and clock run on it. */
  sceneMs: number;
  /** Real length of the showcase track, so the total time is never invented. */
  durationMs: number;
  /** Changing this restarts the progress bar and the elapsed clock. */
  sceneKey: number;
}

export default function StagePreviewTransport({
  isPlaying,
  onTogglePlay,
  onPrev,
  onNext,
  onStartDemo,
  stageMode,
  sceneMs,
  durationMs,
  sceneKey,
}: StagePreviewTransportProps) {
  const { t } = useTranslation();
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    setElapsedMs(0);
  }, [sceneKey]);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => setElapsedMs(value => value + 1000), 1000);
    return () => window.clearInterval(timer);
  }, [isPlaying, sceneKey]);

  return (
    <div className="glass-panel space-y-3 rounded-3xl border border-white/15 p-3.5 shadow-2xl sm:p-5">
      <div className="space-y-1.5">
        <div className="h-1.5 w-full overflow-hidden rounded-lg bg-white/15" aria-hidden="true">
          <div
            key={sceneKey}
            className={`stage-progress h-full rounded-lg ${isPlaying ? '' : 'paused-motion'}`}
            style={{
              background: 'linear-gradient(90deg, #62f5c4, #b6fff0, #818cf8)',
              animationDuration: `${sceneMs}ms`,
            }}
          />
        </div>
        <div className="flex justify-between px-1 font-mono text-[11px] font-semibold text-slate-400">
          <span>{formatTime(Math.min(elapsedMs, sceneMs) / 1000)}</span>
          <span>{formatTime(durationMs / 1000)}</span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between sm:gap-4">
        <div className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2 sm:w-auto sm:justify-start">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{t('welcome.currentStage')}</p>
            <p className="text-xs font-extrabold text-[#b8ffe2]">{stageMode}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-5">
          <button
            type="button"
            onClick={onPrev}
            aria-label={t('welcome.previewPrev')}
            className="btn-spring min-h-11 min-w-11 rounded-full p-3 text-lg text-white hover:bg-white/10"
          >
            <SkipBack aria-hidden="true" className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? t('welcome.previewPause') : t('welcome.previewPlay')}
            aria-pressed={isPlaying}
            className={`btn-spring min-h-14 min-w-14 rounded-full bg-gradient-to-r from-[#62f5c4] to-teal-400 p-4 text-xl font-bold text-black shadow-xl ${isPlaying ? 'playing-pulse-glow' : ''}`}
          >
            {isPlaying
              ? <Pause aria-hidden="true" className="h-6 w-6" fill="currentColor" />
              : <Play aria-hidden="true" className="h-6 w-6" fill="currentColor" />}
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label={t('welcome.previewNext')}
            className="btn-spring min-h-11 min-w-11 rounded-full p-3 text-lg text-white hover:bg-white/10"
          >
            <SkipForward aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        {/* The one control that leaves the preview: the real demo starts here. */}
        <button
          type="button"
          onClick={onStartDemo}
          className="hidden min-h-11 shrink-0 items-center rounded-xl bg-[#62f5c4] px-3.5 py-2 text-xs font-extrabold text-black transition hover:brightness-110 sm:inline-flex"
        >
          {t('welcome.startDemo')}
        </button>
      </div>
    </div>
  );
}
