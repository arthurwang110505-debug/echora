import { useEffect, useState } from 'react';

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

const backgrounds = [
  ['latent', 'Latent'], ['common', 'Geometric'], ['fluid', 'Fluid'],
  ['monet', 'Monet'], ['nomand', 'Nomand'], ['sora', 'Sora'], ['url', 'Image URL'],
];

const modes = [['classic', 'Classic'], ['cadenza', 'Cadenza'], ['partita', 'Partita'], ['fume', 'Fume'], ['monet', 'Monet'], ['cappella', 'Cappella'], ['pendolo', 'Pendolo'], ['sonnet', 'Sonnet'], ['claddagh', 'Claddagh'], ['diorama', 'Diorama'], ['tilt', 'Tilt']];

export default function OriginalFoliaTuningPanel({ mode, autoMode, onAutoModeChange, onModeChange, onClose, backgroundMode, onBackgroundModeChange, tunings, onTuningsChange }: Props) {
  const key = `${mode}Tuning`;
  const current = tunings[key] ?? {};
  const [draft, setDraft] = useState(current);

  useEffect(() => setDraft(current), [mode]);

  const update = (patch: Record<string, unknown>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onTuningsChange({ ...tunings, [key]: next });
  };

  return (
    <aside className="fixed right-3 bottom-3 z-[80] w-56 max-h-[calc(100vh-5rem)] overflow-y-auto rounded-2xl border border-white/15 bg-slate-950/85 p-3 text-white shadow-2xl backdrop-blur-2xl" aria-label="視覺模式與舞台設定">
      <div className="mb-4 flex items-center justify-between">
        <div><p className="text-sm font-extrabold">Echora Tuning</p><p className="text-[11px] text-slate-400">動畫與背景</p></div>
        <button type="button" onClick={onClose} aria-label="關閉 Tuning" className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-white/10 hover:text-white">×</button>
      </div>
      <label className="mb-4 flex items-center justify-between text-xs text-slate-300">跟隨音樂自動切換
        <input type="checkbox" checked={autoMode} onChange={e => onAutoModeChange(e.target.checked)} className="accent-[#62f5c4]" />
      </label>
      <label className="mb-4 block text-xs text-slate-300">歌詞動畫模式
        <select disabled={autoMode} value={mode} onChange={e => onModeChange(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs outline-none disabled:opacity-40">
          {modes.map(([value, label]) => <option key={value} value={value} className="bg-slate-900">{label}</option>)}
        </select>
      </label>
      <label className="mb-4 block text-xs text-slate-300">背景效果
        <select value={backgroundMode} onChange={e => onBackgroundModeChange(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs outline-none">
          {backgrounds.map(([value, label]) => <option key={value} value={value} className="bg-slate-900">{label}</option>)}
        </select>
      </label>
      <label className="mb-4 block text-xs text-slate-300">動態強度 <span className="float-right font-mono">{Number(current.motionAmount ?? current.audioReactivity ?? 1).toFixed(2)}</span>
        <input type="range" min="0" max="2" step="0.05" value={Number(draft.motionAmount ?? draft.audioReactivity ?? 1)} onChange={e => update({ motionAmount: Number(e.target.value), audioReactivity: Number(e.target.value) })} className="mt-2 w-full" />
      </label>
      <label className="mb-4 block text-xs text-slate-300">文字縮放 <span className="float-right font-mono">{Number(current.fontScale ?? 1).toFixed(2)}</span>
        <input type="range" min="0.6" max="1.6" step="0.05" value={Number(draft.fontScale ?? 1)} onChange={e => update({ fontScale: Number(e.target.value) })} className="mt-2 w-full" />
      </label>
      <p className="text-[10px] leading-4 text-slate-500">設定會即時套用到 Echora renderer，切換歌曲後保留在本次工作階段。</p>
    </aside>
  );
}
