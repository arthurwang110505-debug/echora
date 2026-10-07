import { describe, expect, it } from 'vitest';
import type { LyricData } from '@echora/core';
import {
    LYRIC_SEGMENTATION_RECORD_VERSION,
    SegmentationImportError,
    applyLyricWordSegmentation,
    buildSegmentationExportText,
    countAppliedSegmentationLines,
    createLyricSegmentationRecord,
    getLyricLineSegmentationKey,
    isLyricSegmentationRecord,
    parseSegmentationImport,
} from './segmentationRecord';
import { segmentLyricWords } from './wordSegmentation';

// src/lyrics/segmentationRecord.test.ts
// The saved split and the text exchange around it. The two things worth protecting: a record whose
// lyrics changed must not apply at an offset, and a partial paste must fail loudly rather than leave
// the user with a silent mix of their edits and the default split.

const lyrics = (lines: { text: string; start: number }[]): LyricData => ({
    lines: lines.map((line, index) => ({
        fullText: line.text,
        startTime: line.start,
        endTime: line.start + 3,
        words: [{ text: line.text, startTime: line.start, endTime: line.start + 3 }],
        id: `line-${index}`,
    })),
});

const sample = () => lyrics([
    { text: '把回忆拼好给你', start: 0 },
    { text: 'It’s unbelievable', start: 4 },
]);

describe('record shape', () => {
    it('carries version, key, source and a timestamp', () => {
        const record = createLyricSegmentationRecord('local:1', 'ai', { a: ['a'] });
        expect(record).toMatchObject({ version: LYRIC_SEGMENTATION_RECORD_VERSION, songKey: 'local:1', source: 'ai' });
        expect(record.updatedAt).toBeGreaterThan(0);
    });

    it('rejects anything that is not a record, so bad storage data cannot be applied', () => {
        expect(isLyricSegmentationRecord(null)).toBe(false);
        expect(isLyricSegmentationRecord({ songKey: 'a', updatedAt: 1, source: 'ai', lines: {} })).toBe(false);
        expect(isLyricSegmentationRecord({ version: 1, songKey: 'a', updatedAt: 1, source: 'guess', lines: {} })).toBe(false);
        expect(isLyricSegmentationRecord({ version: 1, songKey: 'a', updatedAt: 1, source: 'manual', lines: {} })).toBe(true);
    });

    it('keys a line on rounded milliseconds plus its text', () => {
        expect(getLyricLineSegmentationKey({ startTime: 12.34567, fullText: 'a' })).toBe('12346|a');
    });
});

describe('applyLyricWordSegmentation', () => {
    it('bakes matching boundaries onto the lines and leaves the rest alone', () => {
        const data = sample();
        const record = createLyricSegmentationRecord('k', 'manual', {
            [getLyricLineSegmentationKey(data.lines[0])]: ['把', '回忆', '拼好', '给', '你'],
        });
        const applied = applyLyricWordSegmentation(data, record);
        expect(applied?.lines[0].wordSegments).toEqual(['把', '回忆', '拼好', '给', '你']);
        expect(applied?.lines[1].wordSegments).toBeUndefined();
        // Timing is never rewritten: renderers still timeline against the parser's own words.
        expect(applied?.lines[0].words[0].startTime).toBe(0);
    });

    it('ignores a record whose text no longer matches, rather than applying at an offset', () => {
        const data = sample();
        const record = createLyricSegmentationRecord('k', 'ai', {
            [getLyricLineSegmentationKey(data.lines[0])]: ['完', '全', '不', '同'],
        });
        expect(applyLyricWordSegmentation(data, record)).toBe(data);
    });

    it('returns the input untouched when there is nothing to apply', () => {
        const data = sample();
        expect(applyLyricWordSegmentation(data, null)).toBe(data);
        expect(applyLyricWordSegmentation(null, createLyricSegmentationRecord('k', 'ai', {}))).toBeNull();
    });

    it('counts applied lines for the panel', () => {
        const data = sample();
        const record = createLyricSegmentationRecord('k', 'ai', {
            [getLyricLineSegmentationKey(data.lines[0])]: ['把', '回忆', '拼好', '给', '你'],
            stale: ['x'],
        });
        expect(countAppliedSegmentationLines(data, record)).toBe(1);
        expect(countAppliedSegmentationLines(data, null)).toBe(0);
    });
});

describe('export and import', () => {
    it('exports one delimiter-separated row per line', () => {
        const data = sample();
        const text = buildSegmentationExportText(data);
        expect(text.split('\n')).toHaveLength(2);
        expect(text.split('\n').every(row => row.includes('/'))).toBe(true);
    });

    it('round-trips its own export through the delimiter format', () => {
        const data = sample();
        const record = createLyricSegmentationRecord('k', 'manual', {
            [getLyricLineSegmentationKey(data.lines[0])]: ['把', '回忆', '拼好', '给', '你'],
        });
        const applied = applyLyricWordSegmentation(data, record)!;
        const result = parseSegmentationImport(buildSegmentationExportText(applied), data);
        expect(result.lines[getLyricLineSegmentationKey(data.lines[0])]).toEqual(['把', '回忆', '拼好', '给', '你']);
        expect(result.appliedCount).toBe(2);
    });

    it('accepts the model JSON, a code fence, and rows for the non-blank lines only', () => {
        const data = lyrics([{ text: 'a', start: 0 }, { text: '', start: 1 }, { text: 'b', start: 2 }]);
        const fenced = '```json\n{"lines":[["a"],["b"]]}\n```';
        const result = parseSegmentationImport(fenced, data);
        expect(result.appliedCount).toBe(2);
    });

    it('re-aligns whitespace the model normalised away, instead of rejecting the row', () => {
        const data = lyrics([{ text: '見えないようにさ 隠しても', start: 0 }]);
        const result = parseSegmentationImport('見えない/ように/さ/隠しても', data);
        const boundaries = result.lines[getLyricLineSegmentationKey(data.lines[0])];
        // The row is accepted because only its split points are trusted; the whitespace comes from
        // the original line. It is stored on the slice that starts where the space sits, and
        // segmentLyricWords reshapes it into a segment of its own for the renderers.
        expect(boundaries.join('')).toBe('見えないようにさ 隠しても');
        expect(segmentLyricWords({ fullText: data.lines[0].fullText, wordSegments: boundaries }).map(part => part.segment))
            .toEqual(['見えない', 'ように', 'さ', ' ', '隠しても']);
    });

    it('fails loudly on a wrong row count, a rewritten row, and empty input', () => {
        const data = sample();
        expect(() => parseSegmentationImport('a/b', data)).toThrow(SegmentationImportError);
        expect(() => parseSegmentationImport('完全/不同\n完全/不同', data)).toThrow(SegmentationImportError);
        expect(() => parseSegmentationImport('   ', data)).toThrow(SegmentationImportError);
        expect(() => parseSegmentationImport('{"lines":"nope"}', data)).toThrow(SegmentationImportError);
    });

    it('reports which row failed, so the panel can point at it', () => {
        const data = sample();
        try {
            parseSegmentationImport('把/回忆/拼好/给/你\nIt’s/完全/不同', data);
            throw new Error('should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(SegmentationImportError);
            expect((error as SegmentationImportError).row).toBe(2);
        }
    });
});
