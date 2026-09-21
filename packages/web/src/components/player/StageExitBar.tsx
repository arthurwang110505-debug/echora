import { useTranslation } from 'react-i18next';
import { Minimize2 } from 'lucide-react';

// src/components/player/StageExitBar.tsx
// The only control that stays pinned while the immersive stage is up: 退出全螢幕.
// Everything else the stage used to expose (歌單、設定、歌詞時間軸、舞台動畫、背景) moved into
// the floating control panel, reachable from the bottom-right button or the P key.

type StageExitBarProps = {
  onLeaveStage: () => void;
};

export default function StageExitBar({ onLeaveStage }: StageExitBarProps) {
  const { t } = useTranslation();

  return (
    <div className="pointer-events-auto fixed bottom-6 right-4 z-[75] md:right-8">
      <button
        type="button"
        onClick={onLeaveStage}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-white/15 bg-black/45 px-3.5 py-2 text-xs font-bold text-white/90 backdrop-blur-xl transition hover:bg-black/60 hover:text-white"
        aria-label={t('panel.exitFullscreen')}
      >
        <Minimize2 aria-hidden="true" className="h-4 w-4" />
        {t('panel.exitFullscreen')}
      </button>
    </div>
  );
}
