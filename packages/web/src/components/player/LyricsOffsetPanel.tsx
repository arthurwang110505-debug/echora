import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { LYRICS_OFFSET_STEP_SECONDS } from '../../utils/lyrics/activeLine';
import { lyricsOriginLabel } from '../../playback/lyricsImport';
import type { LyricOrigin } from '@echora/core';

type LyricsOffsetPanelProps = {
  offsetSeconds: number;
  offsetLabel: string;
  origin?: LyricOrigin;
  compact?: boolean;
  onAdjust: (deltaSeconds: number) => void;
  onReset: () => void;
  onImportText: (raw: string) => boolean;
};

export default function LyricsOffsetPanel({
  offsetSeconds,
  offsetLabel,
  origin,
  compact = false,
  onAdjust,
  onReset,
  onImportText,
}: LyricsOffsetPanelProps) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const originLabel = lyricsOriginLabel(origin);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const raw = await file.text();
    onImportText(raw);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className={compact ? 'flex flex-col gap-2.5' : 'flex flex-wrap items-center justify-between gap-3'}>
      <div>
        <p className="text-xs font-bold text-white">{t('player.lyricsAlign')}</p>
        <p className="mt-0.5 text-[11px] text-slate-400">
          {t('player.offsetStep', { step: LYRICS_OFFSET_STEP_SECONDS.toFixed(2), label: offsetLabel })}
        </p>
        {originLabel ? <p className="mt-1 text-[11px] text-slate-500">{t('player.originLabel', { origin: originLabel })}</p> : null}
      </div>
      <div className={compact ? 'grid grid-cols-3 gap-1.5' : 'flex flex-wrap items-center gap-2'}>
        <button type="button" onClick={() => onAdjust(-LYRICS_OFFSET_STEP_SECONDS)} className="min-h-11 rounded-lg border border-white/15 bg-white/10 px-2 py-2 text-[11px] font-bold text-white hover:bg-white/20" aria-label={t('player.offsetEarlierAria', { step: LYRICS_OFFSET_STEP_SECONDS.toFixed(2) })}>{t('player.offsetEarlier')}</button>
        <button type="button" onClick={onReset} className="min-h-11 rounded-lg border border-[#62f5c4]/25 bg-[#62f5c4]/10 px-2 py-2 text-[11px] font-bold text-[#b8ffe2]" aria-label={t('player.offsetResetAria')}>{t('player.offsetReset')}</button>
        <button type="button" onClick={() => onAdjust(LYRICS_OFFSET_STEP_SECONDS)} className="min-h-11 rounded-lg border border-white/15 bg-white/10 px-2 py-2 text-[11px] font-bold text-white hover:bg-white/20" aria-label={t('player.offsetLaterAria', { step: LYRICS_OFFSET_STEP_SECONDS.toFixed(2) })}>{t('player.offsetLater')}</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".lrc,.vtt,.txt,text/plain"
          className="sr-only"
          aria-label={t('player.uploadLyrics')}
          onChange={event => { void handleFile(event.target.files?.[0]); }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="min-h-11 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-[11px] font-bold text-slate-200 hover:bg-white/10"
        >
          {t('player.uploadLyrics')}
        </button>
        {offsetSeconds !== 0 ? <span className="text-[10px] text-slate-500">{t('player.offsetRemembered')}</span> : null}
      </div>
    </div>
  );
}
