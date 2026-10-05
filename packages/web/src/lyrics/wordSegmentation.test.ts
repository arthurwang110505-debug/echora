import { afterEach, describe, expect, it } from 'vitest';
import {
    getWordSegmentationKey,
    hasWordSegmentationOverride,
    isValidWordSegmentation,
    segmentLyricWords,
    segmentTextWords,
    segmentsFromBoundaries,
} from './wordSegmentation';

// src/lyrics/wordSegmentation.test.ts
// The one segmenter every render path reads. These are the invariants a renderer relies on: offsets
// that address the real text, whitespace in the shape Intl.Segmenter produces, and an override that
// is either applied exactly or ignored entirely.

describe('segmentsFromBoundaries', () => {
    it('gives each segment its offset in the source text', () => {
        const segments = segmentsFromBoundaries(['世界', '。']);
        expect(segments.map(part => part.index)).toEqual([0, 2]);
        // Trailing punctuation is attached to the word in the saved format, but when it does arrive
        // as its own segment it must not claim to be word-like: the sticky passes key off that.
        expect(segments.map(part => part.isWordLike)).toEqual([true, false]);
    });

    it('marks punctuation and whitespace as not word-like', () => {
        const segments = segmentsFromBoundaries(['hello', ' ', 'world', '!']);
        expect(segments.map(part => part.isWordLike)).toEqual([true, false, true, false]);
    });
});

describe('segmentTextWords', () => {
    it('returns nothing for empty text', () => {
        expect(segmentTextWords('')).toEqual([]);
    });

    it('groups CJK into words rather than one character per segment', () => {
        const segments = segmentTextWords('把回忆拼好给你');
        expect(segments.length).toBeGreaterThan(1);
        expect(segments.map(part => part.segment).join('')).toBe('把回忆拼好给你');
        // The offset of every segment must address the real text, or timing slips a character.
        for (const part of segments) {
            expect('把回忆拼好给你'.slice(part.index, part.index + part.segment.length)).toBe(part.segment);
        }
    });

    it('keeps Latin words whole and numbers intact', () => {
        const segments = segmentTextWords('It’s unbelievable, isn’t it?');
        expect(segments.map(part => part.segment).join('')).toBe('It’s unbelievable, isn’t it?');
        expect(segments.map(part => part.segment).filter(part => /\s/.test(part)).join('').length).toBeGreaterThan(0);
    });

    describe('without Intl.Segmenter', () => {
        const originalSegmenter = Intl.Segmenter;

        afterEach(() => {
            Object.defineProperty(Intl, 'Segmenter', { value: originalSegmenter, configurable: true, writable: true });
        });

        it('falls back to code points, preserving every code unit', () => {
            // A runtime this old cannot cluster graphemes either; the contract that matters is that
            // offsets stay valid and the line's text is never lost.
            Object.defineProperty(Intl, 'Segmenter', { value: undefined, configurable: true, writable: true });
            const segments = segmentTextWords('世界。');
            expect(segments.map(part => part.segment)).toEqual(['世', '界', '。']);
            expect(segments.map(part => part.index)).toEqual([0, 1, 2]);
        });
    });
});

describe('isValidWordSegmentation', () => {
    it('accepts only boundaries that rebuild the line exactly', () => {
        expect(isValidWordSegmentation('把回忆', ['把', '回忆'])).toBe(true);
        expect(isValidWordSegmentation('把回忆', ['把', '回', '忆'])).toBe(true);
        expect(isValidWordSegmentation('把回忆', ['把', '回忆 '])).toBe(false);
        expect(isValidWordSegmentation('把回忆', ['把'])).toBe(false);
        expect(isValidWordSegmentation('把回忆', [])).toBe(false);
        expect(isValidWordSegmentation('把回忆', undefined)).toBe(false);
    });

    it('rejects a non-string array rather than indexing into it', () => {
        expect(isValidWordSegmentation('ab', [1 as unknown as string, 'b'])).toBe(false);
    });
});

describe('segmentLyricWords', () => {
    const line = (fullText: string, wordSegments?: string[]) => ({ fullText, wordSegments });

    it('uses Intl.Segmenter when the line has no override', () => {
        expect(segmentLyricWords(line('把回忆拼好给你')).map(part => part.segment).join('')).toBe('把回忆拼好给你');
    });

    it('applies a valid override', () => {
        const segments = segmentLyricWords(line('把回忆拼好给你', ['把', '回忆', '拼好', '给', '你']));
        expect(segments.map(part => part.segment)).toEqual(['把', '回忆', '拼好', '给', '你']);
    });

    it('lifts edge whitespace into its own segment, matching the Segmenter shape', () => {
        // The saved format says a space belongs to the segment before it; every consumer is written
        // against whitespace being its own segment, so the boundary has to be reshaped on the way in.
        const segments = segmentLyricWords(line('hello world', ['hello ', 'world']));
        expect(segments.map(part => part.segment)).toEqual(['hello', ' ', 'world']);
        expect(segments.map(part => part.index)).toEqual([0, 5, 6]);
    });

    it('keeps an interior space: a multi-word phrase the user held together on purpose', () => {
        const segments = segmentLyricWords(line('a b c', ['a b ', 'c']));
        expect(segments.map(part => part.segment)).toEqual(['a b', ' ', 'c']);
    });

    it('ignores an override that no longer matches the line', () => {
        // A stale split applied at an offset is worse than the default one: the lyric source changed
        // under the record, so the record must lose.
        expect(segmentLyricWords(line('把回忆', ['彻', '底', '不同'])).map(part => part.segment).join('')).toBe('把回忆');
    });
});

describe('override helpers', () => {
    it('keys on boundary lengths, which pin the split exactly when text is already in the key', () => {
        expect(getWordSegmentationKey({ wordSegments: ['把', '回忆'] })).toBe('1,2');
        expect(getWordSegmentationKey({})).toBe('');
    });

    it('reports whether the override will actually be used', () => {
        expect(hasWordSegmentationOverride({ fullText: '把回忆', wordSegments: ['把', '回忆'] })).toBe(true);
        expect(hasWordSegmentationOverride({ fullText: '把回忆', wordSegments: ['把'] })).toBe(false);
        expect(hasWordSegmentationOverride({ fullText: '把回忆' })).toBe(false);
    });
});
