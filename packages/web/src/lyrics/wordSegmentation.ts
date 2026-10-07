import type { Line } from '@echora/core';

// src/lyrics/wordSegmentation.ts
//
// The single word-granularity segmenter for lyrics. Ported from upstream Folia's
// `utils/lyrics/wordSegmentation.ts`, whose header explains why it exists: the same
// `getSegmenterParts` helper had been copy-pasted into sonnetSemantic.ts and a third variant into
// cjkSemanticLayout.ts, so a user-supplied override would have had to be wired into three places
// that could drift apart.
//
// Echora was in exactly that state: sonnetSemantic.ts, utils/lyrics/cjkSemanticLayout.ts and
// store/localDemoSongs.ts each carried their own Intl.Segmenter call. The two render paths now read
// this module; the demo-song fixture generator is left alone because it produces timings, not
// typography.
//
// Callers holding a Line should use `segmentLyricWords`, which honours `line.wordSegments` (the
// user's saved segmentation). `segmentTextWords` is the no-override path for text with no Line
// behind it.

export interface LyricWordSegment {
    segment: string;
    /** Offset of this segment inside the source text, in code units. */
    index: number;
    isWordLike: boolean;
}

const PUNCTUATION_ONLY = /^[\s\p{P}\p{S}]+$/u;

const isWordLikeText = (text: string): boolean => !PUNCTUATION_ONLY.test(text);

/**
 * Rebuilds full segment records from a bare boundary list. Used both for the user's saved
 * segmentation and for anything that stores boundaries as plain strings.
 */
export const segmentsFromBoundaries = (boundaries: string[]): LyricWordSegment[] => {
    let cursor = 0;
    return boundaries.map(segment => {
        const part = { segment, index: cursor, isWordLike: isWordLikeText(segment) };
        cursor += segment.length;
        return part;
    });
};

/**
 * Intl.Segmenter word split, falling back to code points when the runtime has no Segmenter.
 *
 * The fallback preserves every code unit, so offsets stay valid and line timing is never lost. It is
 * code points rather than grapheme clusters: grapheme timing for a line is built separately by
 * `utils/lyrics/graphemeTiming`, and reaching into that (type-check-excluded) module for a path only
 * ancient browsers take is the worse trade. Every browser Echora targets ships Intl.Segmenter.
 */
export const segmentTextWords = (text: string): LyricWordSegment[] => {
    if (!text) return [];

    const Segmenter = typeof Intl !== 'undefined' ? Intl.Segmenter : undefined;
    if (Segmenter) {
        try {
            return Array.from(new Segmenter(undefined, { granularity: 'word' }).segment(text), part => ({
                segment: part.segment,
                index: part.index,
                isWordLike: part.isWordLike ?? isWordLikeText(part.segment),
            }));
        } catch {
            // The code-point fallback below preserves every code unit and the line timing.
        }
    }

    return segmentsFromBoundaries(Array.from(text));
};

/**
 * True when the boundaries reconstruct the text exactly. A saved segmentation that fails this is
 * stale (the lyric source changed under it) and must be ignored rather than applied at an offset.
 */
export const isValidWordSegmentation = (text: string, boundaries: string[] | undefined): boolean => (
    Array.isArray(boundaries)
    && boundaries.length > 0
    && boundaries.every(segment => typeof segment === 'string')
    && boundaries.join('') === text
);

const EDGE_WHITESPACE = /^(\s*)(.*?)(\s*)$/su;

/**
 * Lifts the whitespace at a saved boundary's edges out into segments of its own, so a saved split
 * reaches consumers in the same shape Intl.Segmenter would have produced.
 *
 * Intl.Segmenter always emits a whitespace run as a segment in its own right, and every consumer is
 * written against that: sonnet's sticky pass and cjkSemanticLayout's word alignment both skip
 * whitespace segments, and align a segment's text against parser words that never contain any. The
 * saved format is the other way round — the prompt tells the model that a space belongs to the
 * segment before it — so an unsplit boundary would arrive as a word with a space glued on and fail
 * to align at all.
 *
 * Whitespace INSIDE a segment is deliberately left alone. It is the one thing this format can say
 * that Intl.Segmenter cannot — a multi-word phrase the user kept together on purpose — and the
 * consumers already handle it. Punctuation is left attached for the same reason: the sticky passes
 * would re-attach it anyway.
 */
const splitEdgeWhitespace = (boundaries: string[]): string[] => boundaries.flatMap(boundary => {
    const [, lead, core, trail] = EDGE_WHITESPACE.exec(boundary) ?? [];
    // No core means the boundary is whitespace only, which is already the shape we want.
    return core ? [lead, core, trail].filter(Boolean) : [boundary].filter(Boolean);
});

/** Word segments for a line: the user's saved split when it is valid, else Intl.Segmenter. */
export const segmentLyricWords = (line: Pick<Line, 'fullText' | 'wordSegments'>): LyricWordSegment[] => {
    if (isValidWordSegmentation(line.fullText, line.wordSegments)) {
        return segmentsFromBoundaries(splitEdgeWhitespace(line.wordSegments!));
    }

    return segmentTextWords(line.fullText);
};

/**
 * Fingerprint of a line's saved split, for layout cache keys and memo dependencies.
 *
 * Boundary LENGTHS rather than the segment text: the boundaries always join back to the line's own
 * `fullText`, which every caller of this already keys on, so the lengths alone pin the split down
 * exactly — and no second copy of the lyric is built on paths that run per frame. Empty string when
 * the line is on the default split, so adding it to a key changes nothing for lyrics without one.
 */
export const getWordSegmentationKey = (line: Pick<Line, 'wordSegments'>): string => (
    line.wordSegments ? line.wordSegments.map(segment => segment.length).join(',') : ''
);

/** Whether this line will render with a user-supplied split rather than the default one. */
export const hasWordSegmentationOverride = (line: Pick<Line, 'fullText' | 'wordSegments'>): boolean => (
    isValidWordSegmentation(line.fullText, line.wordSegments)
);
