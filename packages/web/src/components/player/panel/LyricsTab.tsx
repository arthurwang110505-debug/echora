import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileDown, Search } from 'lucide-react';
import type { LyricOrigin } from '@echora/core';
import LyricsOffsetPanel from '../LyricsOffsetPanel';

// src/components/player/panel/LyricsTab.tsx
// 歌詞資訊 tab: the three things upstream offers for the playing song — kick off an online
// lyrics match, import a local lyrics file / pasted lyrics, and nudge the lyrics timeline.

export type LyricsTabProps = {
  isMatching: boolean;
  statusTitle: string;
  statusCopy: string;
  lyricsOffsetSeconds: number;
  lyricsOffsetLabel: string;
  origin?: LyricOrigin;
  onMatchOnline: () => void;
  onImportLyrics: (raw: string) => boolean;
  onAdjustOffset: (deltaSeconds: number) => void;
  onResetOffset: () => void;
};

export default function LyricsTab({
  isMatching,
  statusTitle,
  statusCopy,
  lyricsOffsetSeconds,
  lyricsOffsetLabel,
  origin,
  onMatchOnline,
  onImportLyrics,
  onAdjustOffset,
  onResetOffset,
}: LyricsTabProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const [importState, setImportState] = useState<'idle' | 'done' | 'failed'>('idle');
  const [matchedFlash, setMatchedFlash] = useState(false);
  const wasMatching = useRef(false);

  // The store flips `isMatching` back to false when the request settles; that falling edge
  // is the moment to confirm the re-match, without threading another callback through the
  // panel. Both halves live in effects: never schedule work while rendering.
  useEffect(() => {
    if (isMatching) wasMatching.current = true;
  }, [isMatching]);

  useEffect(() => {
    if (isMatching || !wasMatching.current) return;
    wasMatching.current = false;
    setMatchedFlash(true);
    const timer = window.setTimeout(() => setMatchedFlash(false), 1600);
    return () => window.clearTimeout(timer);
  }, [isMatching]);

  const submitDraft = () => {
    const ok = onImportLyrics(draft);
    setImportState(ok ? 'done' : 'failed');
    if (ok) setDraft('');
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{t('panel.lyricsStatus')}</p>
        <p className="mt-1 text-xs font-semibold text-white">{statusTitle}</p>
        <p className="mt-1 text-[11px] leading-5 text-slate-400">{statusCopy}</p>
      </div>

      <button
        type="button"
        onClick={() => { setMatchedFlash(false); onMatchOnline(); }}
        disabled={isMatching}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white/5 text-xs font-bold text-slate-100 transition-colors hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
      >
        <Search aria-hidden="true" size={14} className={isMatching ? 'animate-pulse' : ''} />
        {isMatching ? t('panel.matching') : matchedFlash ? t('panel.matched') : t('panel.matchOnline')}
      </button>

      <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2.5">
        <p className="text-xs font-bold text-white">{t('panel.importLocal')}</p>
        <p className="mt-0.5 text-[10px] leading-4 text-slate-400">{t('panel.importLocalHint')}</p>
        <textarea
          value={draft}
          onChange={event => { setDraft(event.target.value); setImportState('idle'); }}
          rows={3}
          spellCheck={false}
          placeholder={t('panel.importPlaceholder')}
          aria-label={t('panel.importPlaceholder')}
          className="mt-2 w-full resize-y rounded-lg border border-white/10 bg-[#0b1218] px-2.5 py-2 font-mono text-[11px] text-slate-200 outline-none transition focus:border-[#62f5c4]"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span aria-live="polite" className="text-[10px] font-semibold text-[#62f5c4]">
            {importState === 'done' ? t('panel.importDone') : importState === 'failed' ? t('panel.importFailed') : ''}
          </span>
          <button
            type="button"
            onClick={submitDraft}
            disabled={draft.trim().length === 0}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-[#62f5c4] px-3 text-[11px] font-extrabold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FileDown aria-hidden="true" size={12} />
            {t('panel.import')}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2.5">
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
    </div>
  );
}
