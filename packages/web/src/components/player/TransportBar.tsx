import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type { LyricOrigin } from '@echora/core';
import LyricsOffsetPanel from './LyricsOffsetPanel';
import { formatTime } from './formatTime';

type TransportBarProps = {
  isYouTubeVideoMode: boolean;
  isPlaying: boolean;
  displayedTime: number;
  duration: number;
  isSeeking: boolean;
  seekPreviewTime: number | null;
  activeVisualizer: string;
  showCalibration: boolean;
  lyricsOffsetSeconds: number;
  lyricsOffsetLabel: string;
  origin?: LyricOrigin;
  onSeekPreview: (time: number) => void;
  onSeekStart: () => void;
  onSeekCommit: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPlayPause: () => void;
  onEnterStage: () => void;
  onToggleCalibration: () => void;
  onAdjustOffset: (deltaSeconds: number) => void;
  onResetOffset: () => void;
  onImportLyrics: (raw: string) => boolean;
  onToggleTuning: () => void;
};

export default function TransportBar({
  isYouTubeVideoMode,
  isPlaying,
  displayedTime,
  duration,
  isSeeking,
  activeVisualizer,
  showCalibration,
  lyricsOffsetSeconds,
  lyricsOffsetLabel,
  origin,
  onSeekPreview,
  onSeekStart,
  onSeekCommit,
  onPrev,
  onNext,
  onPlayPause,
  onEnterStage,
  onToggleCalibration,
  onAdjustOffset,
  onResetOffset,
  onImportLyrics,
  onToggleTuning,
}: TransportBarProps) {
  return (
    <div className={`z-20 glass-panel p-4 sm:p-5 md:p-6 rounded-3xl border border-white/15 shadow-2xl space-y-3.5 ${isYouTubeVideoMode ? 'flex justify-center' : ''}`}>
      <div className="space-y-1.5">
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={displayedTime}
          aria-label={`播放進度，目前 ${formatTime(displayedTime)}，全長 ${formatTime(duration)}`}
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
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">目前舞台</p>
              <p className="text-xs font-extrabold text-[#b8ffe2]">{activeVisualizer}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={onEnterStage} className="min-h-11 shrink-0 rounded-xl bg-[#62f5c4] px-3 py-2 text-xs font-extrabold text-black transition hover:brightness-110" aria-label="進入沉浸舞台">Stage</button>
              <button type="button" onClick={onToggleCalibration} className={`min-h-11 shrink-0 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${showCalibration ? 'border-[#62f5c4]/50 bg-[#62f5c4]/20 text-[#62f5c4]' : 'border-white/10 bg-white/[0.05] text-slate-300 hover:text-white'}`} aria-expanded={showCalibration} aria-controls="desktop-calibration" aria-label={showCalibration ? '關閉更多播放設定' : '開啟更多播放設定'}>更多</button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-5 sm:gap-6">
          <button type="button" onClick={onPrev} className="min-h-11 min-w-11 rounded-full p-3 hover:bg-white/10 btn-spring text-white text-lg" aria-label="上一首">
            <SkipBack aria-hidden="true" className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onPlayPause}
            className={`min-h-14 min-w-14 rounded-full p-4 bg-gradient-to-r from-[#62f5c4] to-teal-400 text-black shadow-xl hover:scale-105 btn-spring text-xl font-bold ${isPlaying ? 'playing-pulse-glow' : ''}`}
            aria-label={isPlaying ? '暫停音訊' : '播放音訊'}
            aria-pressed={isPlaying}
          >
            {isPlaying ? <Pause aria-hidden="true" className="h-6 w-6" fill="currentColor" /> : <Play aria-hidden="true" className="h-6 w-6" fill="currentColor" />}
          </button>
          <button type="button" onClick={onNext} className="min-h-11 min-w-11 rounded-full p-3 hover:bg-white/10 btn-spring text-white text-lg" aria-label="下一首">
            <SkipForward aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
      </div>

      {!isYouTubeVideoMode && showCalibration && (
        <div id="desktop-calibration" className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
          <LyricsOffsetPanel
            offsetSeconds={lyricsOffsetSeconds}
            offsetLabel={lyricsOffsetLabel}
            origin={origin}
            onAdjust={onAdjustOffset}
            onReset={onResetOffset}
            onImportText={onImportLyrics}
          />
          <button type="button" onClick={onToggleTuning} className="mt-3 rounded-xl border border-white/[0.12] bg-white/[0.05] px-3 py-2 text-xs font-bold text-slate-300 hover:text-white">視覺與舞台設定</button>
        </div>
      )}
    </div>
  );
}
