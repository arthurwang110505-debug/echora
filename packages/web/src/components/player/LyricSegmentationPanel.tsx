import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck, ClipboardCopy, RotateCcw, Sparkles, Type } from 'lucide-react';
import type { LyricSegmentationController } from '../../hooks/useLyricSegmentation';

// src/components/player/LyricSegmentationPanel.tsx
// The word-segmentation block inside 歌詞資訊. Three ways in, because they cost the user very
// different amounts:
//
//   AI          the model splits the song, one request for most songs. Needs the deployment's key.
//   paste back  the same prompt, run on whatever model the user already pays for, pasted back.
//   by hand     the rows are editable text; a user who only wants to fix one line can.
//
// The live preview is the point of the whole feature for CJK: the split is what the typography engine
// groups by, so seeing 把回忆拼好给你 become 把 / 回忆 / 拼好 / 给 / 你 is the feedback.

export type LyricSegmentationPanelProps = {
    segmentation: LyricSegmentationController;
    /** Split of the line currently being sung, straight from the renderers' segmenter. */
    activeLineSplit: string[];
    activeLineText: string | null;
};

export default function LyricSegmentationPanel({ segmentation, activeLineSplit, activeLineText }: LyricSegmentationPanelProps) {
    const { t } = useTranslation();
    const [draft, setDraft] = useState('');
    const [showPrompt, setShowPrompt] = useState(false);

    const { isSegmenting, progress, error, notice } = segmentation;
    const canRun = segmentation.lineCount > 0 && !isSegmenting;

    const statusLabel = () => {
        if (isSegmenting) {
            return progress
                ? t('lyricSegmentation.running', { done: progress.done, total: progress.total })
                : t('lyricSegmentation.runAi');
        }
        if (segmentation.hasRecord) {
            return t(segmentation.source === 'ai' ? 'lyricSegmentation.statusAi' : 'lyricSegmentation.statusManual', {
                count: segmentation.appliedCount,
            });
        }
        return t('lyricSegmentation.statusDefault');
    };

    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="flex items-center gap-1.5 font-bold text-white">
                        <Type aria-hidden="true" className="h-3.5 w-3.5 text-[#62f5c4]" />
                        {t('lyricSegmentation.title')}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-5 text-slate-400">{t('lyricSegmentation.hint')}</p>
                </div>
            </div>

            <p className="mt-3 text-[11px] font-bold text-[#b8ffe2]" role="status" aria-live="polite">{statusLabel()}</p>

            {activeLineText && activeLineSplit.length > 0 && (
                <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('lyricSegmentation.preview')}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                        {activeLineSplit.map((segment, index) => (
                            <span
                                key={`${segment}-${index}`}
                                className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] ${/^\s+$/.test(segment) ? 'text-slate-600' : 'bg-[#62f5c4]/10 text-[#b8ffe2]'}`}
                            >
                                {/^\s+$/.test(segment) ? '␣' : segment}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={segmentation.runAi}
                    disabled={!canRun}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#62f5c4] to-teal-400 px-3.5 py-2 font-extrabold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                    {t('lyricSegmentation.runAi')}
                </button>
                <button
                    type="button"
                    onClick={() => { void segmentation.copyPrompt(); setShowPrompt(true); }}
                    disabled={segmentation.lineCount === 0}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 font-bold text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
                >
                    <ClipboardCopy aria-hidden="true" className="h-3.5 w-3.5" />
                    {t('lyricSegmentation.copyPrompt')}
                </button>
                {segmentation.hasRecord && (
                    <button
                        type="button"
                        onClick={segmentation.reset}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 font-bold text-slate-200 transition hover:bg-white/10"
                    >
                        <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                        {t('lyricSegmentation.reset')}
                    </button>
                )}
            </div>

            {showPrompt && (
                <textarea
                    readOnly
                    value={segmentation.promptText}
                    aria-label={t('lyricSegmentation.promptLabel')}
                    onFocus={event => event.currentTarget.select()}
                    className="mt-2 h-28 w-full resize-y rounded-xl border border-white/10 bg-black/30 p-2.5 font-mono text-[10px] leading-4 text-slate-300 outline-none focus:border-[#62f5c4]"
                />
            )}

            <div className="mt-3 border-t border-white/10 pt-3">
                <p className="text-[11px] font-bold text-slate-200">{t('lyricSegmentation.pasteTitle')}</p>
                <p className="mt-0.5 text-[10px] leading-4 text-slate-500">{t('lyricSegmentation.pasteHint')}</p>
                <textarea
                    value={draft}
                    onChange={event => setDraft(event.target.value)}
                    placeholder={t('lyricSegmentation.pastePlaceholder')}
                    aria-label={t('lyricSegmentation.pasteTitle')}
                    className="mt-2 h-20 w-full resize-y rounded-xl border border-white/10 bg-black/30 p-2.5 font-mono text-[10px] leading-4 text-slate-200 outline-none focus:border-[#62f5c4]"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => { if (segmentation.applyImport(draft).ok) setDraft(''); }}
                        disabled={!draft.trim()}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#62f5c4]/25 bg-[#62f5c4]/10 px-3 py-1.5 text-[11px] font-bold text-[#b8ffe2] transition hover:bg-[#62f5c4]/20 disabled:opacity-40"
                    >
                        <ClipboardCheck aria-hidden="true" className="h-3.5 w-3.5" />
                        {t('lyricSegmentation.apply')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setDraft(segmentation.exportText)}
                        className="rounded-xl border border-white/15 bg-white/[0.05] px-3 py-1.5 text-[11px] font-bold text-slate-300 transition hover:bg-white/10"
                    >
                        {t('lyricSegmentation.loadCurrent')}
                    </button>
                </div>
            </div>

            {error && <p className="mt-3 rounded-xl border border-rose-300/25 bg-rose-300/10 p-2.5 text-[11px] leading-5 text-rose-200" role="alert">{error}</p>}
            {!error && notice && <p className="mt-3 rounded-xl border border-[#62f5c4]/25 bg-[#62f5c4]/10 p-2.5 text-[11px] leading-5 text-[#b8ffe2]" role="status">{notice}</p>}
        </div>
    );
}
