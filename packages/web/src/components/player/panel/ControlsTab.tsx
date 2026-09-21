import { useTranslation } from 'react-i18next';
import { Heart, Moon, Repeat, Repeat1, RepeatOff, Sparkle, Sparkles, Sun } from 'lucide-react';
import VolumeControl from '../../VolumeControl';
import ModeStepperRow from './ModeStepperRow';
import { BACKGROUND_OPTIONS, VISUALIZER_OPTIONS } from './stageOptions';

// src/components/player/panel/ControlsTab.tsx
// 播放控制 tab, laid out like upstream:
//   row 1  — 循環模式 / 加入我喜愛的歌曲 / 產生 AI 主題 (the only row of large touch targets)
//   volume — single row
//   row 2  — 歌詞動畫 and 背景效果 steppers, gear opens the full lyrics style settings
//   footer — light/dark switch + current theme name (a button once an AI theme exists,
//            which opens the quick theme editor)
//
// The AI theme button swaps Sparkle → Sparkles once the playing song already has a theme,
// exactly as the guide describes.

export type AiThemeState = 'idle' | 'generating' | 'error';

export type ControlsTabProps = {
  loopMode: 'off' | 'list' | 'single';
  onToggleLoop: () => void;
  isLiked: boolean;
  likeDisabled?: boolean;
  onToggleLike: () => void;
  aiThemeState: AiThemeState;
  hasSongAiTheme: boolean;
  canGenerateAiTheme: boolean;
  aiThemeError?: string;
  onGenerateAiTheme: () => void;
  themeName: string;
  onOpenThemeQuickEditor: () => void;
  isDaylight: boolean;
  onToggleDaylight: () => void;
  activeVisualizer: string;
  onVisualizerChange: (mode: string) => void;
  autoVisualizer: boolean;
  onAutoVisualizerChange: (enabled: boolean) => void;
  backgroundMode: string;
  onBackgroundModeChange: (mode: string) => void;
  onOpenFullTuning: () => void;
};

const LoopIcon = ({ mode }: { mode: 'off' | 'list' | 'single' }) => {
  if (mode === 'off') return <RepeatOff aria-hidden="true" size={20} />;
  if (mode === 'single') return <Repeat1 aria-hidden="true" size={20} />;
  return <Repeat aria-hidden="true" size={20} />;
};

export default function ControlsTab({
  loopMode,
  onToggleLoop,
  isLiked,
  likeDisabled = false,
  onToggleLike,
  aiThemeState,
  hasSongAiTheme,
  canGenerateAiTheme,
  aiThemeError,
  onGenerateAiTheme,
  themeName,
  onOpenThemeQuickEditor,
  isDaylight,
  onToggleDaylight,
  activeVisualizer,
  onVisualizerChange,
  autoVisualizer,
  onAutoVisualizerChange,
  backgroundMode,
  onBackgroundModeChange,
  onOpenFullTuning,
}: ControlsTabProps) {
  const { t } = useTranslation();
  const loopLabel = loopMode === 'off' ? t('panel.loopOff') : loopMode === 'single' ? t('panel.loopSingle') : t('panel.loopList');
  const isGenerating = aiThemeState === 'generating';
  const aiLabel = aiThemeState === 'error'
    ? (aiThemeError || t('panel.aiThemeError'))
    : !canGenerateAiTheme
      ? t('panel.aiThemeUnavailable')
      : isGenerating
        ? t('panel.generatingTheme')
        : hasSongAiTheme
          ? t('panel.regenerateAiTheme')
          : t('panel.generateAiTheme');

  return (
    <div className="relative space-y-4">
      {/* Row 1: loop / like / AI theme */}
      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={onToggleLoop}
          title={loopLabel}
          aria-label={loopLabel}
          aria-pressed={loopMode !== 'off'}
          className="flex h-12 items-center justify-center rounded-xl bg-white/5 text-slate-100 transition-colors hover:bg-white/10"
        >
          <LoopIcon mode={loopMode} />
        </button>

        <button
          type="button"
          onClick={onToggleLike}
          disabled={likeDisabled}
          title={isLiked ? t('panel.unlike') : t('panel.like')}
          aria-label={isLiked ? t('panel.unlike') : t('panel.like')}
          aria-pressed={isLiked}
          className={`flex h-12 items-center justify-center rounded-xl transition-colors ${
            isLiked ? 'bg-red-500/20 text-red-500' : 'bg-white/5 text-slate-100 hover:bg-white/10'
          } ${likeDisabled ? 'cursor-not-allowed opacity-35' : ''}`}
        >
          <Heart aria-hidden="true" size={20} fill={isLiked ? 'currentColor' : 'none'} />
        </button>

        <button
          type="button"
          onClick={onGenerateAiTheme}
          disabled={isGenerating}
          title={aiLabel}
          aria-label={aiLabel}
          className={`flex h-12 items-center justify-center rounded-xl transition-colors ${
            isGenerating ? 'bg-blue-500/20 text-blue-300' : 'bg-white/5 text-slate-100 hover:bg-white/10'
          } ${!canGenerateAiTheme && !isGenerating ? 'opacity-60' : ''}`}
        >
          {hasSongAiTheme && !isGenerating
            ? <Sparkles aria-hidden="true" size={20} />
            : <Sparkle aria-hidden="true" size={20} className={isGenerating ? 'animate-pulse' : ''} />}
        </button>
      </div>

      {aiThemeState === 'error' && (
        <p role="alert" className="text-[10px] leading-4 text-red-400">{aiThemeError || t('panel.aiThemeError')}</p>
      )}

      <div className="space-y-3 border-t border-white/5 pt-3">
        <VolumeControl />

        {/* Row 2: lyrics animation + background steppers */}
        <div className="space-y-1">
          <ModeStepperRow
            value={activeVisualizer}
            options={VISUALIZER_OPTIONS}
            onChange={(mode) => { onAutoVisualizerChange(false); onVisualizerChange(mode); }}
            ariaLabel={t('panel.lyricsAnimation')}
            moreLabel={t('panel.fullLyricsSettings')}
            onOpenMore={onOpenFullTuning}
            trailing={(
              <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-400" title={t('player.autoSwitchStage')}>
                <span aria-hidden="true">auto</span>
                <input
                  type="checkbox"
                  checked={autoVisualizer}
                  onChange={event => onAutoVisualizerChange(event.target.checked)}
                  aria-label={t('player.autoSwitchStage')}
                  className="h-3.5 w-3.5 accent-[#62f5c4]"
                />
              </label>
            )}
          />

          <ModeStepperRow
            value={backgroundMode}
            options={BACKGROUND_OPTIONS}
            onChange={onBackgroundModeChange}
            ariaLabel={t('panel.backgroundEffect')}
            moreLabel={t('panel.fullLyricsSettings')}
            onOpenMore={onOpenFullTuning}
          />
        </div>
      </div>

      {/* Footer: light/dark + current theme (clickable once an AI theme exists) */}
      <div className="flex items-center justify-between border-t border-white/5 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onToggleDaylight}
            className={`rounded-md p-1 transition-all ${isDaylight ? 'text-amber-500' : 'text-blue-300'}`}
            title={isDaylight ? t('panel.switchToDark') : t('panel.switchToLight')}
            aria-label={isDaylight ? t('panel.switchToDark') : t('panel.switchToLight')}
          >
            {isDaylight ? <Sun aria-hidden="true" size={14} /> : <Moon aria-hidden="true" size={14} />}
          </button>

          {hasSongAiTheme ? (
            <button
              type="button"
              onClick={onOpenThemeQuickEditor}
              aria-label={t('panel.quickEditTheme')}
              title={t('panel.quickEditTheme')}
              className="max-w-[120px] truncate rounded-md px-1.5 py-1 text-left text-xs font-bold text-slate-100 transition-colors hover:bg-white/10"
            >
              {themeName}
            </button>
          ) : (
            <span className="max-w-[120px] truncate text-xs font-bold text-slate-300">{themeName}</span>
          )}
        </div>
      </div>
    </div>
  );
}
