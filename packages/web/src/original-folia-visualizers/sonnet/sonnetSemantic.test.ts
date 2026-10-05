import { describe, expect, it } from 'vitest';
import { buildSonnetSemanticSegments } from './sonnetSemantic';
import type { Line, Word } from '../../types';

// src/original-folia-visualizers/sonnet/sonnetSemantic.test.ts
//
// Sonnet's semantic split, which is what the typography engine actually lays out. The mode used to
// call Intl.Segmenter itself; it now reads the shared segmenter so a user's saved segmentation is
// honoured. These tests pin both halves: the default still splits sensibly, and an override is what
// comes out.

const perCharacter = (text: string): Word[] => Array.from(text).map((character, index) => ({
    text: character,
    startTime: index,
    endTime: index + 1,
}));

const line = (fullText: string, wordSegments?: string[]): Line => ({
    fullText,
    words: perCharacter(fullText),
    wordSegments,
    startTime: 0,
    endTime: fullText.length,
});

describe('buildSonnetSemanticSegments', () => {
    const text = '把回忆拼好给你';

    it('returns nothing for an empty line', () => {
        expect(buildSonnetSemanticSegments(line(''))).toEqual([]);
    });

    it('segments with Intl.Segmenter when there is no override', () => {
        const segments = buildSonnetSemanticSegments(line(text));
        expect(segments.map(segment => segment.text).join('')).toBe(text);
        expect(segments.length).toBeGreaterThan(1);
    });

    it('uses the saved segmentation when the line has one', () => {
        const segments = buildSonnetSemanticSegments(line(text, ['把', '回忆', '拼好', '给', '你']));
        expect(segments.map(segment => segment.text)).toEqual(['把', '回忆', '拼好', '给', '你']);
    });

    it('keeps every segment addressable in the line, so grapheme timing still lines up', () => {
        const segments = buildSonnetSemanticSegments(line(text, ['把', '回忆', '拼好', '给', '你']));
        for (const segment of segments) {
            expect(text.slice(segment.startOffset, segment.endOffset)).toBe(segment.text);
        }
        expect(segments.at(-1)?.endOffset).toBe(text.length);
    });

    it('ignores a stale override rather than laying the line out at an offset', () => {
        const segments = buildSonnetSemanticSegments(line(text, ['完', '全', '不', '同']));
        expect(segments.map(segment => segment.text).join('')).toBe(text);
    });

    it('reads the saved split for a half-width line without collapsing whitespace', () => {
        const spaced = 'hello world';
        const segments = buildSonnetSemanticSegments(line(spaced, ['hello ', 'world']));
        expect(segments.map(segment => segment.text).join('')).toBe(spaced);
    });
});
