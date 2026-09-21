import { useTranslation } from 'react-i18next';
import { Command, SlidersHorizontal } from 'lucide-react';

// src/components/player/panel/PanelToggle.tsx
// The bottom-right round button that expands the control panel. Hovering (or focusing anything
// in the hotspot) grows the osu!-style track to the left and reveals the command-palette glyph
// at its end, exactly like upstream: the panel and the palette share one hotspot, and the track
// is the affordance for both.

type PanelToggleProps = {
  isOpen: boolean;
  onToggle: () => void;
  onOpenCommandPalette: () => void;
};

export default function PanelToggle({ isOpen, onToggle, onOpenCommandPalette }: PanelToggleProps) {
  const { t } = useTranslation();
  const trackVisible = 'opacity-100 group-focus-within:opacity-100 group-hover:opacity-100';

  return (
    <div className="group pointer-events-auto fixed bottom-6 right-4 z-[60] flex w-24 justify-end md:right-8">
      {/* Track background: purely decorative, sits behind both buttons. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute right-0 top-0 z-0 h-12 w-24 rounded-full border border-white/10 bg-white/5 opacity-0 backdrop-blur-md transition-opacity duration-200 ${
          isOpen ? 'opacity-100' : trackVisible
        }`}
      />

      <button
        type="button"
        onClick={onOpenCommandPalette}
        aria-label={t('panel.paletteHint')}
        title={t('panel.paletteHint')}
        className={`absolute left-3 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-white/45 opacity-0 transition-all duration-200 hover:text-white focus-visible:opacity-100 ${
          isOpen ? 'opacity-100' : 'group-hover:opacity-100'
        }`}
      >
        <Command aria-hidden="true" size={14} />
      </button>

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={isOpen ? t('panel.toggleCloseAria') : t('panel.toggleAria')}
        className={`relative z-10 flex h-12 w-12 items-center justify-center rounded-full border backdrop-blur-xl transition-all duration-300 ${
          isOpen
            ? 'border-[#62f5c4]/45 bg-[#62f5c4]/20 text-[#b8ffe2]'
            : 'border-white/15 bg-black/35 text-white/85 hover:bg-black/50 hover:text-white'
        }`}
      >
        <SlidersHorizontal
          aria-hidden="true"
          size={18}
          className={`transition-transform duration-300 ${isOpen ? 'rotate-90' : ''}`}
        />
      </button>
    </div>
  );
}
