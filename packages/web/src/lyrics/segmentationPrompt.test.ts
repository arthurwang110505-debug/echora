import { describe, expect, it } from 'vitest';
import {
    SEGMENTATION_DELIMITER,
    buildSegmentationManualPrompt,
    buildSegmentationSourcePrompt,
    buildSegmentationSystemPrompt,
    parseSegmentationResponse,
    realignSegmentsToText,
} from '@shared/segmentationPrompt';

// src/lyrics/segmentationPrompt.test.ts
// The prompt the endpoint sends and the prompt a user copies are one module; these tests pin down
// what makes its output trustworthy — the lossless rule being stated, numbering kept out of the
// segments, and a parser that accepts a model's cosmetic whitespace but not a rewritten line.

describe('prompt', () => {
    it('numbers the lines, and says the numbering is not part of the lyric', () => {
        const source = buildSegmentationSourcePrompt(['第一行', 'second line']);
        expect(source).toContain('1. 第一行');
        expect(source).toContain('2. second line');
        expect(buildSegmentationSystemPrompt()).toContain('is NOT part of the');
    });

    it('states the lossless rule, which is what the parser enforces', () => {
        const prompt = buildSegmentationSystemPrompt();
        expect(prompt).toContain('Lossless');
        expect(prompt).toContain('Never translate, romanise, or correct spelling');
    });

    it('keeps the Japanese rule and its example, which is what stops whole lines coming back unsplit', () => {
        const prompt = buildSegmentationSystemPrompt();
        expect(prompt).toContain('Japanese specifically');
        expect(prompt).toContain('見えない');
    });

    it('offers the delimiter fallback for a pasted answer, and includes the lines once', () => {
        const manual = buildSegmentationManualPrompt(['a', 'b']);
        expect(manual).toContain(`separating words`);
        expect(manual).toContain(SEGMENTATION_DELIMITER);
        expect(manual.match(/1\. a/g)).toHaveLength(1);
    });
});

describe('realignSegmentsToText', () => {
    it('passes through boundaries that already concatenate exactly', () => {
        expect(realignSegmentsToText(['a', 'b'], 'ab')).toEqual(['a', 'b']);
    });

    it('takes the original whitespace instead of the model’s version of it', () => {
        // The model drops or normalises the space; the original decides that there *is* one, and the
        // slice that starts where it sits inherits it. Which side of the boundary it lands on does
        // not matter downstream: `segmentLyricWords` lifts edge whitespace into its own segment, so
        // every consumer sees the shape Intl.Segmenter produces either way.
        const realigned = realignSegmentsToText(['見えない', 'ように', 'さ', '隠しても'], '見えないようにさ 隠しても');
        expect(realigned).toEqual(['見えない', 'ように', 'さ', ' 隠しても']);
        expect(realigned?.join('')).toBe('見えないようにさ 隠しても');
    });

    it('refuses a row whose content genuinely differs', () => {
        expect(realignSegmentsToText(['完', '全', '不', '同'], '把回忆')).toBeNull();
        expect(realignSegmentsToText(['把'], '把回忆')).toBeNull();
        expect(realignSegmentsToText([''], '把回忆')).toBeNull();
    });
});

describe('parseSegmentationResponse', () => {
    const lines = ['把回忆拼好给你', 'It’s unbelievable, isn’t it?'];

    it('parses a plain JSON answer', () => {
        const { boundaries, rejections } = parseSegmentationResponse(
            '{"lines":[["把","回忆","拼好","给","你"],["It’s ","unbelievable, ","isn’t ","it?"]]}',
            lines,
        );
        expect(boundaries[0]).toEqual(['把', '回忆', '拼好', '给', '你']);
        expect(boundaries[1]?.join('')).toBe(lines[1]);
        expect(rejections).toEqual([]);
    });

    it('accepts a bare array and a code fence', () => {
        expect(parseSegmentationResponse('```json\n[["把","回忆","拼好","给","你"],["x"]]\n```', ['把回忆拼好给你', 'x']).boundaries[1])
            .toEqual(['x']);
    });

    it('nulls the lines the model got wrong and keeps the rest', () => {
        const { boundaries, rejections } = parseSegmentationResponse(
            '{"lines":[["把","回忆","拼好","给","你"],[1,2]]}',
            lines,
        );
        expect(boundaries[0]).toEqual(['把', '回忆', '拼好', '给', '你']);
        expect(boundaries[1]).toBeNull();
        expect(rejections).toHaveLength(1);
        expect(rejections[0]).toContain('line 2');
    });

    it('throws only when the mapping itself is unknown', () => {
        expect(() => parseSegmentationResponse('not json at all', lines)).toThrow(/valid JSON/);
        expect(() => parseSegmentationResponse('{"lines":[]}', lines)).toThrow(/expected 2/);
        expect(() => parseSegmentationResponse('{"nope":1}', lines)).toThrow(/no "lines" array/);
        expect(() => parseSegmentationResponse('', lines)).toThrow(/Empty/);
    });

    it('throws when every line was rejected: there is nothing to save', () => {
        expect(() => parseSegmentationResponse('{"lines":[["x"],["y"]]}', lines)).toThrow(/reproduced none/);
    });
});
