import type { RefObject } from 'react';
import { ArrowLeft, Pause, Play, Settings2, SkipBack, SkipForward, Sparkles, X } from 'lucide-react';
import type { LyricOrigin } from '@echora/core';
import LyricsOffsetPanel from './LyricsOffsetPanel';

const VISUALIZER_OPTIONS = [
  ['classic', 'Classic'], ['cadenza', 'Cadenza'], ['partita', 'Partita'], ['fume', 'Fume'], ['monet', 'Monet'],
  ['cappella', 'Cappella'], ['pendolo', 'Pendolo'], ['sonnet', 'Sonnet'], ['claddagh', 'Claddagh'], ['diorama', 'Diorama'], ['tilt', 'Tilt'],
] as const;

type ImmersiveChromeProps = {
  isPlaying: boolean;
  showTransport: boolean;
  showStageSettings: boolean;
  settingsRef: RefObject<HTMLDivElement | null>;
  activeVisualizer: string;
  autoVisualizer: boolean;
  backgroundMode: string;
  lyricsStatusTitle: string;
  lyricsStatusCopy: string;
  lyricsOffsetSeconds: number;
  lyricsOffsetLabel: string;
  origin?: LyricOrigin;
  onReturnToPlaylist: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPlayPause: () => void;
  onToggleSettings: () => void;
  onCloseSettings: () => void;
  onVisualizerChange: (mode: string) => void;
  onAutoVisualizerChange: (enabled: boolean) => void;
  onBackgroundModeChange: (mode: string) => void;
  onOpenTuning: () => void;
  onAdjustOffset: (deltaSeconds: number) => void;
  onResetOffset: () => void;
  onImportLyrics: (raw: string) => boolean;
  onLeaveStage: () => void;
};

export default function ImmersiveChrome({
  isPlaying,
  showTransport,
  showStageSettings,
  settingsRef,
  activeVisualizer,
  autoVisualizer,
  backgroundMode,
  lyricsStatusTitle,
  lyricsStatusCopy,
  lyricsOffsetSeconds,
  lyricsOffsetLabel,
  origin,
  onReturnToPlaylist,
  onPrev,
  onNext,
  onPlayPause,
  onToggleSettings,
  onCloseSettings,
  onVisualizerChange,
  onAutoVisualizerChange,
  onBackgroundModeChange,
  onOpenTuning,
  onAdjustOffset,
  onResetOffset,
  onImportLyrics,
  onLeaveStage,
}: ImmersiveChromeProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] flex items-center justify-center gap-2 border-t border-white/10 bg-[#07090e]/80 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:rounded-2xl sm:border sm:p-2" role="group" aria-label="沉浸播放控制">
      <span id="immersive-playback-status" className="sr-only" aria-live="polite">{isPlaying ? '目前播放中' : '目前已暫停'}</span>
      <button
        type="button"
        onClick={onReturnToPlaylist}
        className="min-h-11 min-w-11 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20"
        aria-label="返回歌單選擇頁"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />歌單
      </button>
      {showTransport && (
        <>
          <button type="button" onClick={onPrev} className="min-h-11 min-w-11 rounded-xl border border-white/15 bg-black/35 px-2.5 py-2 text-white/80 hover:bg-white/10 hover:text-white" aria-label="上一首"><SkipBack aria-hidden="true" className="h-4 w-4" /></button>
          <button
            type="button"
            onClick={onPlayPause}
            className="inline-flex min-h-11 min-w-[4.75rem] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#62f5c4] to-teal-400 px-3 py-2 text-xs font-extrabold text-black shadow-lg transition hover:brightness-110 active:scale-95"
            aria-label={isPlaying ? '暫停音訊' : '播放音訊'}
            aria-pressed={isPlaying}
            aria-describedby="immersive-playback-status"
            title={isPlaying ? '暫停音訊' : '播放音訊'}
          >
            {isPlaying ? <Pause aria-hidden="true" className="h-4 w-4" fill="currentColor" /> : <Play aria-hidden="true" className="h-4 w-4" fill="currentColor" />}
            <span>{isPlaying ? '暫停' : '播放'}</span>
          </button>
          <button type="button" onClick={onNext} className="min-h-11 min-w-11 rounded-xl border border-white/15 bg-black/35 px-2.5 py-2 text-white/80 hover:bg-white/10 hover:text-white" aria-label="下一首"><SkipForward aria-hidden="true" className="h-4 w-4" /></button>
        </>
      )}
      <div ref={settingsRef} className="relative">
        <button
          type="button"
          onClick={onToggleSettings}
          className={`min-h-11 min-w-11 rounded-xl border px-3 py-2 text-xs font-bold transition ${showStageSettings ? 'border-[#62f5c4]/45 bg-[#62f5c4]/15 text-[#b8ffe2]' : 'border-white/15 bg-black/35 text-white/80 hover:text-white'}`}
          aria-label="開啟沉浸舞台設定"
          aria-expanded={showStageSettings}
          aria-controls="immersive-settings"
        >
          <Settings2 aria-hidden="true" className="mr-1.5 inline-block h-4 w-4 align-[-3px]" />設定
        </button>
        {showStageSettings && (
          <div id="immersive-settings" role="dialog" aria-label="沉浸舞台設定" className="fixed inset-x-3 bottom-[max(4.5rem,calc(env(safe-area-inset-bottom)+4.5rem))] z-[80] max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-2xl border border-white/10 bg-[#111720]/95 p-3 text-left shadow-2xl backdrop-blur-2xl sm:absolute sm:inset-x-auto sm:bottom-[calc(100%+0.75rem)] sm:right-0 sm:max-h-[calc(100vh-2rem)] sm:w-[min(88vw,22rem)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-extrabold text-white">沉浸舞台設定</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-500">只在需要時展開</p>
              </div>
              <button type="button" onClick={onCloseSettings} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="關閉沉浸舞台設定"><X aria-hidden="true" className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 rounded-xl border border-[#62f5c4]/20 bg-[#62f5c4]/[0.06] px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9ff9d7]">舞台動畫</p>
                  <p className="mt-1 text-xs font-bold text-white">先選擇你要觀看的 Folia 舞台</p>
                </div>
                <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0 text-[#62f5c4]" />
              </div>
              <select
                value={activeVisualizer}
                disabled={autoVisualizer}
                onChange={(event) => onVisualizerChange(event.target.value)}
                aria-label="選擇舞台動畫"
                className="mt-3 min-h-11 w-full rounded-xl border border-white/15 bg-[#0b1218] px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#62f5c4] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {VISUALIZER_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <label className="mt-3 flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-300">
                <span>跟隨音樂自動切換舞台</span>
                <input type="checkbox" checked={autoVisualizer} onChange={(event) => onAutoVisualizerChange(event.target.checked)} aria-label="跟隨音樂自動切換舞台" className="h-5 w-5 accent-[#62f5c4]" />
              </label>
              <label className="mt-3 block text-[11px] font-semibold text-slate-300">背景效果
                <select value={backgroundMode} onChange={(event) => onBackgroundModeChange(event.target.value)} aria-label="選擇背景效果" className="mt-1.5 min-h-11 w-full rounded-xl border border-white/15 bg-[#0b1218] px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#62f5c4]">
                  {['latent', 'common', 'fluid', 'monet', 'nomand', 'sora', 'url'].map((value) => <option key={value} value={value}>{value === 'common' ? 'Geometric' : value === 'url' ? 'Image URL' : value[0].toUpperCase() + value.slice(1)}</option>)}
                </select>
              </label>
              <button type="button" onClick={onOpenTuning} className="mt-3 min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-left text-xs font-bold text-slate-200 hover:bg-white/10">開啟進階舞台調校</button>
            </div>
            <div className="mt-3 rounded-xl border border-white/10 bg-black/15 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">歌詞狀態</p>
              <p className="mt-1 text-xs font-semibold text-white">{lyricsStatusTitle}</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-400">{lyricsStatusCopy}</p>
            </div>
            <div className="mt-3 rounded-xl border border-white/10 bg-black/15 px-3 py-2">
              <LyricsOffsetPanel
                compact
                offsetSeconds={lyricsOffsetSeconds}
                offsetLabel={lyricsOffsetLabel}
                origin={origin}
                onAdjust={onAdjustOffset}
                onReset={onResetOffset}
                onImportText={onImportLyrics}
              />
            </div>
            <button type="button" onClick={onLeaveStage} className="mt-3 min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-left text-xs font-bold text-slate-200 hover:bg-white/10">退出全螢幕，回到雙欄</button>
          </div>
        )}
      </div>
    </div>
  );
}
