import type { Line } from '../../types';
import { buildLineGraphemeTimeline, splitLyricGraphemes } from '../../utils/lyrics/graphemeTiming';
import { segmentLyricWords } from '../../lyrics/wordSegmentation';
import type { SonnetSemanticSegment } from './types';

// src/components/visualizer/sonnet/sonnetSemantic.ts
// Produces lossless semantic segments while mapping display offsets to parser-derived grapheme timing.
//
// The word split itself is not decided here: `segmentLyricWords` owns it, so this mode reads the
// user's saved segmentation (AI or hand-edited) exactly like classic and partita do. Before that, a
// local Segmenter call meant an override would have been honoured in some modes and ignored in
// others — which reads as a bug in the feature, not in the mode.
const PUNCTUATION_ONLY = /^[\s\p{P}\p{S}]+$/u;

const getGraphemeRanges = (text: string) => {
    let cursor = 0;
    return splitLyricGraphemes(text).map(grapheme => {
        const range = { start: cursor, end: cursor + grapheme.length };
        cursor = range.end;
        return range;
    });
};

const timingForRange = (
    line: Line,
    startOffset: number,
    endOffset: number,
    timeline: ReturnType<typeof buildLineGraphemeTimeline>,
    ranges: ReturnType<typeof getGraphemeRanges>,
) => {
    const indices = ranges.flatMap((range, index) => (
        range.end > startOffset && range.start < endOffset ? [index] : []
    ));
    const graphemes = indices.map(index => timeline[index]).filter(Boolean);
    const wordIndices = [...new Set(graphemes.flatMap(item => (
        typeof item.wordIndex === 'number' ? [item.wordIndex] : []
    )))];

    return {
        graphemes,
        wordIndices,
        startTime: graphemes[0]?.startTime ?? line.startTime,
        endTime: graphemes[graphemes.length - 1]?.endTime ?? line.endTime,
    };
};

export const buildSonnetSemanticSegments = (line: Line): SonnetSemanticSegment[] => {
    if (!line.fullText) return [];
    const timeline = buildLineGraphemeTimeline(line);
    const ranges = getGraphemeRanges(line.fullText);
    const parts = segmentLyricWords(line);
    const segments = parts.map((part, index) => {
        const startOffset = part.index;
        const endOffset = parts[index + 1]?.index ?? line.fullText.length;
        return {
            text: line.fullText.slice(startOffset, endOffset),
            startOffset,
            endOffset,
            ...timingForRange(line, startOffset, endOffset, timeline, ranges),
            isWordLike: part.isWordLike ?? !PUNCTUATION_ONLY.test(part.segment),
        };
    });

    const sticky: SonnetSemanticSegment[] = [];
    for (const segment of segments) {
        const previous = sticky[sticky.length - 1];
        if (previous && !segment.isWordLike && !/^\s+$/u.test(segment.text)) {
            previous.text += segment.text;
            previous.endOffset = segment.endOffset;
            previous.endTime = Math.max(previous.endTime, segment.endTime);
            previous.graphemes.push(...segment.graphemes);
            previous.wordIndices = [...new Set([...previous.wordIndices, ...segment.wordIndices])];
        } else {
            sticky.push({ ...segment, graphemes: [...segment.graphemes], wordIndices: [...segment.wordIndices] });
        }
    }
    return sticky;
};
