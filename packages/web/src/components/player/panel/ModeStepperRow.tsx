import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { StageOption } from './stageOptions';
import { stepOption } from './stageOptions';

// src/components/player/panel/ModeStepperRow.tsx
// The 「‹ 字形 目前模式 參數 ›」 row from the upstream 播放控制 tab: arrows step to the
// neighbouring mode, tapping the name opens the full list, and the trailing slot holds the
// mode-specific quick controls. The trailing slot keeps a fixed width so stepping never
// makes the row jump.

type ModeStepperRowProps = {
  value: string;
  options: readonly StageOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  trailing?: React.ReactNode;
  moreLabel: string;
  onOpenMore: () => void;
};

export default function ModeStepperRow({
  value,
  options,
  onChange,
  ariaLabel,
  trailing,
  moreLabel,
  onOpenMore,
}: ModeStepperRowProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const canStep = options.length > 1;
  const selected = options.find(option => option.value === value);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const stepButton = (direction: -1 | 1) => (
    <button
      type="button"
      onClick={() => onChange(stepOption(options, value, direction))}
      disabled={!canStep}
      className="flex h-8 w-6 shrink-0 items-center justify-center rounded-lg opacity-40 transition-colors hover:bg-white/[0.08] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-20"
      aria-label={`${ariaLabel} ${direction === -1 ? t('panel.stepPrevious') : t('panel.stepNext')}`}
    >
      {direction === -1 ? <ChevronLeft aria-hidden="true" size={14} /> : <ChevronRight aria-hidden="true" size={14} />}
    </button>
  );

  return (
    <div ref={rootRef} className="relative flex items-center gap-0.5">
      {stepButton(-1)}

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => setIsOpen(open => !open)}
          className="flex h-8 w-full items-center gap-2 rounded-lg px-2 transition-colors hover:bg-white/[0.08]"
          title={`${ariaLabel}: ${selected?.label ?? value}`}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span className={`truncate text-[11px] font-semibold tracking-wide ${isOpen ? 'text-[#62f5c4]' : ''}`}>
            {selected?.label ?? value}
          </span>
        </button>

        {isOpen && (
          <div
            role="listbox"
            aria-label={ariaLabel}
            className="absolute bottom-[calc(100%+0.35rem)] left-0 z-30 max-h-64 w-full overflow-y-auto rounded-xl border border-white/10 bg-[#0d111a]/95 p-1 shadow-2xl backdrop-blur-2xl"
          >
            {options.map(option => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => { onChange(option.value); setIsOpen(false); }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] font-semibold transition-colors hover:bg-white/10 ${
                  option.value === value ? 'text-[#62f5c4]' : 'text-slate-300'
                }`}
              >
                {option.label}
                {option.value === value && <Check aria-hidden="true" size={12} />}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setIsOpen(false); onOpenMore(); }}
              className="mt-1 flex w-full items-center gap-2 border-t border-white/10 px-2.5 py-2 text-left text-[11px] font-bold text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Settings2 aria-hidden="true" size={12} />
              {moreLabel}
            </button>
          </div>
        )}
      </div>

      <div className="flex min-w-[1.75rem] shrink-0 items-center justify-end gap-0.5">{trailing}</div>

      {stepButton(1)}
    </div>
  );
}
