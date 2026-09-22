import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Palette, RotateCcw, X } from 'lucide-react';
import type { ThemeConfig } from '@echora/core';

// src/components/player/panel/ThemeQuickEditor.tsx
// Quick theme editor opened from the theme name in the 播放控制 tab: tune the four colours of
// the active theme and apply them straight to the player. Upstream keeps a full editor with
// import/export and cover-colour suggestions behind this same entry point; Echora's themes
// are single-mode colour sets, so the four colour fields plus the name are the whole model.

type ColorKey = 'backgroundColor' | 'primaryColor' | 'accentColor' | 'secondaryColor';

const COLOR_FIELDS: { key: ColorKey; labelKey: string }[] = [
  { key: 'backgroundColor', labelKey: 'panel.colorBackground' },
  { key: 'primaryColor', labelKey: 'panel.colorPrimary' },
  { key: 'accentColor', labelKey: 'panel.colorAccent' },
  { key: 'secondaryColor', labelKey: 'panel.colorSecondary' },
];

/** Native colour inputs need `#rrggbb`; anything else falls back to a neutral. */
const toHex = (value: string) => (/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#101217');

type ThemeQuickEditorProps = {
  initialTheme: ThemeConfig;
  onClose: () => void;
  onSave: (theme: ThemeConfig) => void;
};

export default function ThemeQuickEditor({ initialTheme, onClose, onSave }: ThemeQuickEditorProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ThemeConfig>(() => ({ ...initialTheme }));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const setColor = (key: ColorKey, value: string) => setDraft(current => ({ ...current, [key]: value }));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('panel.quickEditTitle')}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0d111a]/95 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Palette aria-hidden="true" size={16} className="text-[#62f5c4]" />
            <div>
              <p className="text-sm font-extrabold text-white">{t('panel.quickEditTitle')}</p>
              <p className="mt-0.5 text-[10px] leading-4 text-slate-500">{t('panel.quickEditHint')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('panel.cancel')}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>

        <label className="mt-4 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          {t('panel.themeNameLabel')}
          <input
            type="text"
            value={draft.name}
            onChange={event => setDraft(current => ({ ...current, name: event.target.value }))}
            className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-[#0b1218] px-3 text-xs font-bold text-white outline-none transition focus:border-[#62f5c4]"
          />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {COLOR_FIELDS.map(({ key, labelKey }) => (
            <label key={key} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-2.5 py-2">
              <input
                type="color"
                value={toHex(draft[key])}
                onChange={event => setColor(key, event.target.value)}
                aria-label={t(labelKey)}
                className="h-7 w-9 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
              />
              <span className="min-w-0">
                <span className="block truncate text-[10px] font-bold text-slate-300">{t(labelKey)}</span>
                <span className="block font-mono text-[10px] text-slate-500">{toHex(draft[key])}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDraft({ ...initialTheme })}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-[11px] font-bold text-slate-200 transition-colors hover:bg-white/10"
          >
            <RotateCcw aria-hidden="true" size={12} />
            {t('panel.resetTheme')}
          </button>
          <button
            type="button"
            onClick={() => onSave({ ...draft, name: draft.name.trim() || initialTheme.name })}
            className="h-10 flex-1 rounded-xl bg-[#62f5c4] text-[11px] font-extrabold text-black transition hover:brightness-110"
          >
            {t('panel.saveTheme')}
          </button>
        </div>
      </div>
    </div>
  );
}
