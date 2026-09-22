import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Command, HelpCircle, Search } from 'lucide-react';
import { searchCommands } from './commandSearch';

// src/components/player/CommandPalette.tsx
// Ctrl/Cmd+K palette: type to filter, ↑/↓ to move, Enter to run, Esc to close. The ? button
// drops filtering so every command available in the current context is listed, matching the
// "點擊問號按鈕可查看當前環境下的全部命令" behaviour.

export type PaletteCommand = {
  id: string;
  title: string;
  group?: string;
  keywords: string[];
  run: () => void;
};

type CommandPaletteProps = {
  open: boolean;
  commands: PaletteCommand[];
  onClose: () => void;
};

export default function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(
    () => (showAll ? commands : searchCommands(query, commands)),
    [commands, query, showAll],
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setShowAll(false);
    setSelected(0);
    // Focus after the overlay mounts so the first keystroke lands in the field.
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query, showAll]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const move = (delta: number) => {
    if (results.length === 0) return;
    setSelected(current => (current + delta + results.length) % results.length);
  };

  const runAt = (index: number) => {
    const command = results[index];
    if (!command) return;
    command.run();
    onClose();
  };

  let lastGroup: string | undefined;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('panel.commands.ariaLabel')}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#0d111a]/95 shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
          <Search aria-hidden="true" size={15} className="shrink-0 text-slate-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
              else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
              else if (event.key === 'Enter') { event.preventDefault(); runAt(selected); }
            }}
            placeholder={t('panel.commands.placeholder')}
            aria-label={t('panel.commands.ariaLabel')}
            aria-controls="command-palette-list"
            role="combobox"
            aria-expanded="true"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white outline-none placeholder:font-normal placeholder:text-slate-500"
          />
          <button
            type="button"
            onClick={() => setShowAll(value => !value)}
            aria-pressed={showAll}
            title={t('panel.commands.showAll')}
            aria-label={t('panel.commands.showAll')}
            className={`shrink-0 rounded-lg p-1.5 transition-colors ${showAll ? 'bg-[#62f5c4]/20 text-[#62f5c4]' : 'text-slate-500 hover:bg-white/10 hover:text-white'}`}
          >
            <HelpCircle aria-hidden="true" size={15} />
          </button>
        </div>

        <div id="command-palette-list" ref={listRef} role="listbox" aria-label={t('panel.commands.ariaLabel')} className="max-h-[50vh] overflow-y-auto p-1.5">
          {results.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-slate-500">{t('panel.commands.empty')}</p>
          )}

          {results.map((command, index) => {
            const groupHeading = command.group && command.group !== lastGroup ? command.group : null;
            lastGroup = command.group;
            return (
              <div key={command.id}>
                {groupHeading && (
                  <p className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{groupHeading}</p>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === selected}
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => runAt(index)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition-colors ${
                    index === selected ? 'bg-white/10 text-white' : 'text-slate-300'
                  }`}
                >
                  <Command aria-hidden="true" size={13} className={index === selected ? 'text-[#62f5c4]' : 'text-slate-600'} />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold">{command.title}</span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-3 py-2">
          <span className="text-[10px] text-slate-500">{t('panel.commands.hint')}</span>
          <span className="text-[10px] text-slate-600">{t('panel.commands.resultCount', { count: results.length })}</span>
        </div>
      </div>
    </div>
  );
}
