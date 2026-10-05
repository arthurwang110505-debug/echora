import type { Line, LyricData } from '@echora/core';
import { realignSegmentsToText, SEGMENTATION_DELIMITER } from '@shared/segmentationPrompt';
import { isValidWordSegmentation, segmentLyricWords } from './wordSegmentation';

// src/lyrics/segmentationRecord.ts
// Pure transforms between a saved segmentation record, the lyrics it applies to, and the text a user
// copies out to a model site or pastes back in. No IO, no store reads: the store owns persistence
// and the panel owns the interaction.
//
// Ported from upstream's `utils/lyrics/lyricSegmentationRecord.ts`. The record format is kept
// identical (version / songKey / updatedAt / source / lines) so a record can be moved between the two
// apps by hand, and so the reasoning in its comments still applies.

export type LyricSegmentationSource = 'ai' | 'manual';

export const LYRIC_SEGMENTATION_RECORD_VERSION = 1;

export interface LyricSegmentationRecord {
    version: typeof LYRIC_SEGMENTATION_RECORD_VERSION;
    /** Provider-prefixed playback key, not the raw song id: two providers can share an id. */
    songKey: string;
    updatedAt: number;
    source: LyricSegmentationSource;
    /**
     * Line key -> word boundaries for that line. Each boundary array joins back to the line's
     * fullText exactly; a line whose key is absent keeps the default Intl.Segmenter split.
     */
    lines: Record<string, string[]>;
}

/**
 * Line identity for the record. Deliberately not `Line.id` — parsers populate that inconsistently.
 * Start time plus text is stable across re-parses of the same lyrics, and simply fails to match when
 * the user switches lyric source, which is the behaviour we want: a segmentation made for other
 * words must not land on these ones at an offset.
 */
export const getLyricLineSegmentationKey = (line: Pick<Line, 'startTime' | 'fullText'>): string => (
    `${Math.round(line.startTime * 1000)}|${line.fullText}`
);

export const createLyricSegmentationRecord = (
    songKey: string,
    source: LyricSegmentationSource,
    lines: Record<string, string[]>,
): LyricSegmentationRecord => ({
    version: LYRIC_SEGMENTATION_RECORD_VERSION,
    songKey,
    updatedAt: Date.now(),
    source,
    lines,
});

/** Guards against malformed data coming back out of storage or off the clipboard. */
export const isLyricSegmentationRecord = (value: unknown): value is LyricSegmentationRecord => {
    if (!value || typeof value !== 'object') return false;
    const record = value as Partial<LyricSegmentationRecord>;
    return record.version === LYRIC_SEGMENTATION_RECORD_VERSION
        && typeof record.songKey === 'string'
        && typeof record.updatedAt === 'number'
        && (record.source === 'ai' || record.source === 'manual')
        && Boolean(record.lines)
        && typeof record.lines === 'object';
};

/**
 * Bakes the saved boundaries onto the lines they still match.
 *
 * Upstream does this in its lyric setter, because its visualizers receive lines without any song
 * identity and so cannot look this up themselves. Echora has one place that feeds every visualizer
 * (the stage render in Player.tsx) plus the overlay publisher, so it bakes there instead — same
 * guarantee, one call site. Returns the input untouched when nothing applies, so the common case
 * allocates nothing.
 */
export const applyLyricWordSegmentation = (
    lyrics: LyricData | null,
    record: LyricSegmentationRecord | null | undefined,
): LyricData | null => {
    if (!lyrics || !record) return lyrics;

    let changed = false;
    const lines = lyrics.lines.map(line => {
        const boundaries = record.lines[getLyricLineSegmentationKey(line)];
        if (!isValidWordSegmentation(line.fullText, boundaries)) return line;
        changed = true;
        return { ...line, wordSegments: boundaries };
    });

    return changed ? { ...lyrics, lines } : lyrics;
};

/** How many of the record's lines actually land on the current lyrics. Shown in the panel. */
export const countAppliedSegmentationLines = (
    lyrics: LyricData | null,
    record: LyricSegmentationRecord | null | undefined,
): number => {
    if (!lyrics || !record) return 0;
    return lyrics.lines.reduce((total, line) => (
        isValidWordSegmentation(line.fullText, record.lines[getLyricLineSegmentationKey(line)]) ? total + 1 : total
    ), 0);
};

/** Current split of every line, whether it comes from the record or from Intl.Segmenter. */
export const buildSegmentationBoundaries = (lyrics: LyricData): string[][] => (
    lyrics.lines.map(line => segmentLyricWords(line).map(part => part.segment))
);

/**
 * The delimiter-separated text a user copies out, edits by hand or in a model site, and pastes back.
 * One lyric line per row so a human can diff it against the lyrics side by side.
 */
export const buildSegmentationExportText = (lyrics: LyricData): string => (
    buildSegmentationBoundaries(lyrics)
        .map(boundaries => boundaries.join(SEGMENTATION_DELIMITER))
        .join('\n')
);

export interface SegmentationImportResult {
    lines: Record<string, string[]>;
    /** Lines that parsed and matched. */
    appliedCount: number;
}

export class SegmentationImportError extends Error {
    /** 1-based row in the pasted text, or null when the failure is not row-specific. */
    readonly row: number | null;

    constructor(message: string, row: number | null = null) {
        super(message);
        this.name = 'SegmentationImportError';
        this.row = row;
    }
}

const parseDelimitedRows = (text: string): string[][] => (
    text
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map(row => row.split(SEGMENTATION_DELIMITER).filter(segment => segment.length > 0))
);

const parseJsonRows = (text: string): string[][] => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new SegmentationImportError('invalid-json');
    }

    const rows = Array.isArray(parsed) ? parsed : (parsed as { lines?: unknown } | null)?.lines;
    if (!Array.isArray(rows) || !rows.every(row => Array.isArray(row) && row.every(segment => typeof segment === 'string'))) {
        throw new SegmentationImportError('invalid-json-shape');
    }

    return rows as string[][];
};

/**
 * Parses pasted segmentation against the lyrics it is meant for. Format is sniffed rather than
 * configured: a leading `[` or `{` means JSON, anything else is the delimiter format. Code fences
 * are accepted, and rows may cover all lyrics or only the non-blank lines that were copied out.
 *
 * Every row must rebuild its line's text. A silent partial import would leave the user with a mix of
 * their edits and the default split, with no way to tell which line got which.
 */
export const parseSegmentationImport = (text: string, lyrics: LyricData): SegmentationImportResult => {
    const normalized = text.replace(/\r\n?/g, '\n');
    const trimmed = normalized.trim();
    if (!trimmed) throw new SegmentationImportError('empty');

    const fenced = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(trimmed);
    const content = fenced ? fenced[1] : normalized;
    const isJson = /^[[{]/.test(content.trimStart());
    let rows = isJson ? parseJsonRows(content.trim()) : parseDelimitedRows(content);
    const segmentableLines = lyrics.lines.filter(line => Boolean(line.fullText));
    const coversKnownLines = () => rows.length === lyrics.lines.length || rows.length === segmentableLines.length;
    // Preserve blank rows in exported lyrics first; extra blank rows in a pasted response may then be
    // discarded without changing which non-blank lyric each row belongs to.
    if (!isJson && !coversKnownLines()) {
        const nonblankRows = rows.filter(row => row.join('').trim() !== '');
        if (nonblankRows.length === segmentableLines.length) rows = nonblankRows;
    }
    if (!coversKnownLines()) throw new SegmentationImportError('line-count-mismatch');
    const targetLines = rows.length === lyrics.lines.length ? lyrics.lines : segmentableLines;

    const lines: Record<string, string[]> = {};
    let appliedCount = 0;

    rows.forEach((boundaries, index) => {
        const line = targetLines[index];
        // Blank lyric lines round-trip as empty rows; keeping them out of the record leaves them on
        // the default split instead of storing an empty override.
        if (!line.fullText) {
            if (boundaries.join('')) throw new SegmentationImportError('line-text-mismatch', index + 1);
            return;
        }
        const realigned = realignSegmentsToText(boundaries, line.fullText);
        if (!realigned || !isValidWordSegmentation(line.fullText, realigned)) {
            throw new SegmentationImportError('line-text-mismatch', index + 1);
        }
        lines[getLyricLineSegmentationKey(line)] = realigned;
        appliedCount += 1;
    });

    if (appliedCount === 0) throw new SegmentationImportError('empty');

    return { lines, appliedCount };
};
