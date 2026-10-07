import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Line, LyricData } from '@echora/core';
import { usePlayerStore } from '../store/playerStore';
import { songOffsetKey } from '../store/stageStore';
import { useLyricSegmentationStore } from '../store/lyricSegmentationStore';
import {
    SegmentationImportError,
    applyLyricWordSegmentation,
    buildSegmentationExportText,
    countAppliedSegmentationLines,
    createLyricSegmentationRecord,
    getLyricLineSegmentationKey,
    parseSegmentationImport,
} from '../lyrics/segmentationRecord';
import { segmentLyricWords } from '../lyrics/wordSegmentation';
import { buildLyricSegmentationPrompt, segmentLyricsWithAi } from '../services/lyricSegmentationAi';

// src/hooks/useLyricSegmentation.ts
// The word-segmentation feature's flow, for the 歌詞資訊 panel: which song's record is loaded, what an
// AI run is doing, and the paste-back path.
//
// The split between this hook and the store is deliberate. The store holds the persisted records and
// knows nothing about the player; this hook knows the playing song, calls the network, and is the one
// place that decides a result is still wanted (a run that lands after the user skipped a song is
// discarded, not applied to the wrong lyrics).

export type SegmentationImportFailure =
    | 'empty'
    | 'invalid-json'
    | 'invalid-json-shape'
    | 'line-count-mismatch'
    | 'line-text-mismatch'
    | 'unknown';

export interface LyricSegmentationController {
    /** Whether anything is loaded for the current song. */
    hasRecord: boolean;
    source: 'ai' | 'manual' | null;
    /** Lines of the current record that still match the current lyrics. */
    appliedCount: number;
    /** Lines a run could segment at all (non-blank lyric lines). */
    lineCount: number;
    isSegmenting: boolean;
    progress: { done: number; total: number } | null;
    error: string | null;
    notice: string | null;
    /** The exact prompt a user can paste into a model site. */
    promptText: string;
    /** Current split of every line, in the delimiter format the import accepts. */
    exportText: string;
    runAi: () => void;
    copyPrompt: () => Promise<boolean>;
    applyImport: (text: string) => { ok: boolean; failure?: SegmentationImportFailure; row?: number | null };
    reset: () => void;
    dismissMessages: () => void;
}

export const useLyricSegmentation = (): LyricSegmentationController => {
    const { t } = useTranslation();
    const currentSong = usePlayerStore(state => state.currentSong);
    const currentLyrics = usePlayerStore(state => state.currentLyrics);
    const records = useLyricSegmentationStore(state => state.records);
    const loadForSong = useLyricSegmentationStore(state => state.loadForSong);
    const save = useLyricSegmentationStore(state => state.save);
    const resetRecord = useLyricSegmentationStore(state => state.reset);
    const [isSegmenting, setIsSegmenting] = useState(false);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const songKey = useMemo(() => songOffsetKey(currentSong), [currentSong]);
    const record = songKey ? records[songKey] ?? null : null;

    // The song key a run started for. Anything that comes back for another key is dropped.
    const runKeyRef = useRef<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        loadForSong(songKey || null);
        // A run belongs to the song it started on; switching songs cancels it rather than letting a
        // late answer write a record for the wrong lyric.
        if (runKeyRef.current && runKeyRef.current !== songKey) {
            abortRef.current?.abort();
            abortRef.current = null;
            runKeyRef.current = null;
            setIsSegmenting(false);
            setProgress(null);
        }
    }, [songKey, loadForSong]);

    useEffect(() => () => abortRef.current?.abort(), []);

    const lines: Line[] = currentLyrics?.lines ?? [];
    const segmentableLines = useMemo(() => lines.filter(line => Boolean(line.fullText)), [lines]);

    const exportText = useMemo(
        () => (currentLyrics ? buildSegmentationExportText(applyLyricWordSegmentation(currentLyrics, record) ?? currentLyrics) : ''),
        [currentLyrics, record],
    );

    const promptText = useMemo(
        () => buildLyricSegmentationPrompt(segmentableLines.map(line => line.fullText)),
        [segmentableLines],
    );

    const runAi = useCallback(() => {
        if (!songKey || segmentableLines.length === 0 || isSegmenting) return;

        const controller = new AbortController();
        abortRef.current = controller;
        runKeyRef.current = songKey;
        setIsSegmenting(true);
        setError(null);
        setNotice(null);
        setProgress({ done: 0, total: segmentableLines.length });

        void (async () => {
            try {
                const result = await segmentLyricsWithAi(segmentableLines.map(line => line.fullText), {
                    signal: controller.signal,
                    onProgress: setProgress,
                });
                // Landed after the user moved on: the answer is for other lyrics.
                if (runKeyRef.current !== songKey) return;

                const boundaries: Record<string, string[]> = {};
                result.boundaries.forEach((row, index) => {
                    if (!row) return;
                    const line = segmentableLines[index];
                    if (line) boundaries[getLyricLineSegmentationKey(line)] = row;
                });
                save(createLyricSegmentationRecord(songKey, 'ai', boundaries));
                setNotice(result.failures.length > 0
                    ? t('lyricSegmentation.aiPartial', { count: result.appliedCount, failed: result.failures.length })
                    : t('lyricSegmentation.aiDone', { count: result.appliedCount }));
            } catch (caught) {
                if (caught instanceof DOMException && caught.name === 'AbortError') return;
                if (runKeyRef.current !== songKey) return;
                setError(caught instanceof Error ? caught.message : t('lyricSegmentation.aiFailed'));
            } finally {
                if (runKeyRef.current === songKey) {
                    runKeyRef.current = null;
                    abortRef.current = null;
                    setIsSegmenting(false);
                    setProgress(null);
                }
            }
        })();
    }, [songKey, segmentableLines, isSegmenting, save, t]);

    const copyPrompt = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(promptText);
            setNotice(t('lyricSegmentation.promptCopied'));
            setError(null);
            return true;
        } catch {
            // Clipboard access needs a secure context and a user gesture; the panel also shows the
            // prompt in a textarea so it is still selectable by hand.
            setError(t('lyricSegmentation.copyFailed'));
            return false;
        }
    }, [promptText, t]);

    const applyImport = useCallback((text: string): { ok: boolean; failure?: SegmentationImportFailure; row?: number | null } => {
        if (!songKey || !currentLyrics) return { ok: false, failure: 'empty' };
        try {
            const result = parseSegmentationImport(text, currentLyrics);
            save(createLyricSegmentationRecord(songKey, 'manual', result.lines));
            setNotice(t('lyricSegmentation.importDone', { count: result.appliedCount }));
            setError(null);
            return { ok: true };
        } catch (caught) {
            if (caught instanceof SegmentationImportError) {
                const failure = caught.message as SegmentationImportFailure;
                // A row that fails to rebuild its line is reported with the row number; anything
                // else falls back to the format-level messages.
                // Two shape failures share one message: the user's next move is the same either way.
                const messageKey = failure === 'invalid-json-shape' ? 'invalid-json' : failure;
                setError(caught.row
                    ? t('lyricSegmentation.importRowMismatch', { row: caught.row })
                    : t(`lyricSegmentation.importError.${messageKey}`, t('lyricSegmentation.importError.empty')));
                return { ok: false, failure, row: caught.row };
            }
            setError(t('lyricSegmentation.importError.empty'));
            return { ok: false, failure: 'unknown' };
        }
    }, [songKey, currentLyrics, save, t]);

    const reset = useCallback(() => {
        if (!songKey) return;
        resetRecord(songKey);
        setNotice(t('lyricSegmentation.resetDone'));
        setError(null);
    }, [songKey, resetRecord, t]);

    return {
        hasRecord: Boolean(record),
        source: record?.source ?? null,
        appliedCount: countAppliedSegmentationLines(currentLyrics, record),
        lineCount: segmentableLines.length,
        isSegmenting,
        progress,
        error,
        notice,
        promptText,
        exportText,
        runAi,
        copyPrompt,
        applyImport,
        reset,
        dismissMessages: () => {
            setError(null);
            setNotice(null);
        },
    };
};

/** The lyrics a renderer should draw: the record's split baked onto the lines it still matches. */
export const useSegmentedLyrics = (): LyricData | null => {
    const currentLyrics = usePlayerStore(state => state.currentLyrics);
    const currentSong = usePlayerStore(state => state.currentSong);
    const records = useLyricSegmentationStore(state => state.records);
    const songKey = useMemo(() => songOffsetKey(currentSong), [currentSong]);
    const record = songKey ? records[songKey] ?? null : null;

    return useMemo(() => applyLyricWordSegmentation(currentLyrics, record), [currentLyrics, record]);
};

/** Split of one line, for the panel's live preview. Reads the same segmenter the renderers do. */
export const useLineSplitPreview = (line: Line | null): string[] => useMemo(
    () => (line ? segmentLyricWords(line).map(part => part.segment) : []),
    [line],
);
