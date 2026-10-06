import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { BACKGROUND_OPTIONS, VISUALIZER_OPTIONS } from './player/panel/stageOptions';
import TemperaImageLayerControls from '../original-folia-visualizers/tempera/TemperaImageLayerControls';
import { setStatusMessage, useStatusMessage } from '../store/useStatusMessageStore';
import { DEFAULT_TEMPERA_TUNING } from '../types';

type Props = {
  mode: string;
  autoMode: boolean;
  onAutoModeChange: (enabled: boolean) => void;
  onModeChange: (mode: string) => void;
  onClose: () => void;
  backgroundMode: string;
  onBackgroundModeChange: (mode: string) => void;
  tunings: Record<string, any>;
  onTuningsChange: (next: Record<string, any>) => void;
};

// Both lists come from `stageOptions`, which the player chrome, the side panel and the landing
// page already share. They used to be spelled out again here, which meant adding a mode to the
// stage picker left this panel listing the old set - the quick-tuning row is exactly where a user
// notices that, because it steps through the list it renders.
const backgrounds = BACKGROUND_OPTIONS.map(option => [option.value, option.label] as const);

const modes = VISUALIZER_OPTIONS.map(option => [option.value, option.label] as const);

export default function OriginalFoliaTuningPanel({ mode, autoMode, onAutoModeChange, onModeChange, onClose, backgroundMode, onBackgroundModeChange, tunings, onTuningsChange }: Props) {
  const { t } = useTranslation();
  // The bundle `applyVisualizerTuning` reads is keyed by the bare mode name
  // (`visualizerTunings.tempera`), not by the settings-store field the adapters also declare
  // (`temperaTuning`). This panel used to write `${mode}Tuning`, so every slider here was
  // silently dropped for every mode; the stage renderer never saw the value.
  const key = mode;
  const current = tunings[key] ?? {};
  const [draft, setDraft] = useState(current);
  // The status channel is where both the pool and its import/export path report results
  // (`setStatusMessage`). Upstream renders it as an app-wide toast; Echora has no toast host, and
  // this panel is the only surface that emits into it, so the message is shown here.
  const status = useStatusMessage();

  useEffect(() => setDraft(current), [mode]);

  useEffect(() => {
    if (!status || status.persistent) return;
    const timer = window.setTimeout(() => setStatusMessage(null), status.durationMs ?? 4000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const update = (patch: Record<string, unknown>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onTuningsChange({ ...tunings, [key]: next });
  };

  return (
    <aside className="fixed right-3 bottom-3 z-[80] w-56 max-h-[calc(100vh-5rem)] overflow-y-auto rounded-2xl border border-white/15 bg-slate-950/85 p-3 text-white shadow-2xl backdrop-blur-2xl" aria-label={t('player.tuningAria')}>
      <div className="mb-4 flex items-center justify-between">
        <div><p className="text-sm font-extrabold">Echora Tuning</p><p className="text-[11px] text-slate-400">{t('player.tuningSubtitle')}</p></div>
        <button type="button" onClick={onClose} aria-label={t('player.closeTuning')} className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-white/10 hover:text-white"><X aria-hidden="true" className="h-4 w-4" /></button>
      </div>
      <label className="mb-4 flex items-center justify-between text-xs text-slate-300">{t('player.autoSwitchStage')}
        <input type="checkbox" checked={autoMode} onChange={e => onAutoModeChange(e.target.checked)} className="accent-[#62f5c4]" />
      </label>
      <label className="mb-4 block text-xs text-slate-300">{t('player.lyricsAnimationMode')}
        <select disabled={autoMode} value={mode} onChange={e => onModeChange(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs outline-none disabled:opacity-40">
          {modes.map(([value, label]) => <option key={value} value={value} className="bg-slate-900">{label}</option>)}
        </select>
      </label>
      <label className="mb-4 block text-xs text-slate-300">{t('player.backgroundEffect')}
        <select value={backgroundMode} onChange={e => onBackgroundModeChange(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs outline-none">
          {backgrounds.map(([value, label]) => <option key={value} value={value} className="bg-slate-900">{label}</option>)}
        </select>
      </label>
      <label className="mb-4 block text-xs text-slate-300">{t('player.motionStrength')} <span className="float-right font-mono">{Number(current.motionAmount ?? current.audioReactivity ?? 1).toFixed(2)}</span>
        <input type="range" min="0" max="2" step="0.05" value={Number(draft.motionAmount ?? draft.audioReactivity ?? 1)} onChange={e => update({ motionAmount: Number(e.target.value), audioReactivity: Number(e.target.value) })} className="mt-2 w-full" />
      </label>
      <label className="mb-4 block text-xs text-slate-300">{t('player.textScale')} <span className="float-right font-mono">{Number(current.fontScale ?? 1).toFixed(2)}</span>
        <input type="range" min="0.6" max="1.6" step="0.05" value={Number(draft.fontScale ?? 1)} onChange={e => update({ fontScale: Number(e.target.value) })} className="mt-2 w-full" />
      </label>
      {mode === 'tempera' && (
        <section className="mb-4 border-t border-white/10 pt-3">
          <p className="mb-2 text-xs font-semibold text-slate-300">{t('options.temperaImageSection')}</p>
          {/* The pool: artwork kept in IndexedDB, with only the placements written back into the
              tuning. Committing once on dialog close is upstream's design (a pointermove on a
              slider used to trigger a store write per frame), so the commit goes straight into the
              same `update()` the sliders above use. */}
          <TemperaImageLayerControls
            images={current.layerImages ?? DEFAULT_TEMPERA_TUNING.layerImages}
            depth={current.layerImageDepth ?? DEFAULT_TEMPERA_TUNING.layerImageDepth}
            frequency={Number(current.layerImageFrequency ?? DEFAULT_TEMPERA_TUNING.layerImageFrequency)}
            rangeInputClass="w-full"
            isDaylight={false}
            onCommit={({ layerImages, layerImageDepth, layerImageFrequency }) => (
              // Written key by key rather than spread: the bundle for a mode is what the renderer
              // reads, and the pool's commit shape (an interface of its own) should not decide it.
              update({ layerImages, layerImageDepth, layerImageFrequency })
            )}
          />
          {status && (
            <p
              role="status"
              className={`mt-2 text-[11px] leading-4 ${status.type === 'error' ? 'text-rose-300' : status.type === 'success' ? 'text-emerald-300' : 'text-slate-300'}`}
            >
              {status.text}
            </p>
          )}
        </section>
      )}
      <p className="text-[10px] leading-4 text-slate-500">{t('player.tuningFooterNote')}</p>
    </aside>
  );
}
