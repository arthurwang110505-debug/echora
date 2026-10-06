// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/lumiereStructure.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { Line } from '../../types';
import { getLineRenderEndTime } from '../../utils/lyrics/renderHints';
import { segmentLyricWords } from '../../lyrics/wordSegmentation';
import type { ParagraphBoundary, ParagraphKind, StructureLine } from './lumiereKernel';

// src/components/visualizer/lumiere/lumiereStructure.ts
// 繪光的分段：與 tempera / sonnet 的分段規則相同（空隙中位數 × 2.5 定閾值、元數據變化切段、超限段落在
// 最大空隙處切開、按副歌標記 / 時長 / 詞數 / 標點分類），取自 lumisynth 編譯器的 structure 步驟。
// 唯一的差別是超限段落的左半部分也繼續切（lumisynth 的 recursiveSplit，folia 原版只切右半部分）。
// tempera / sonnet 的分段函數是模塊私有的，所以這裡帶一份。

export interface LumiereStructureParams {
    /** 段落切分閾值 = 相鄰行空隙中位數 × multiplier，鉗在 [min, max] 秒。 */
    gapMultiplier: number;
    gapMin: number;
    gapMax: number;
    /** 超過行數或時長的段落在最大空隙處切開。 */
    maxLines: number;
    maxDuration: number;
    /** 超限段落的左半部分也繼續切。 */
    recursiveSplit: boolean;
}

export const DEFAULT_LUMIERE_STRUCTURE_PARAMS: LumiereStructureParams = {
    gapMultiplier: 2.5, gapMin: 1.25, gapMax: 3.5, maxLines: 6, maxDuration: 18, recursiveSplit: true,
};

export interface ParagraphDraft {
    lines: StructureLine[];
    boundary: ParagraphBoundary;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const median = (values: number[]) => {
    if (values.length === 0) return 0.5;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? ((sorted[middle - 1] ?? sorted[middle]!) + sorted[middle]!) / 2
        : sorted[middle]!;
};

/** 編譯用的行：視覺結束時間可以超出 endTime，但不越過下一行開始。 */
export const buildStructureLines = (lines: readonly Line[]): StructureLine[] => lines.map((line, sourceIndex) => ({
    sourceIndex,
    line,
    renderEndTime: Math.max(
        line.startTime,
        Math.min(getLineRenderEndTime(line), lines[sourceIndex + 1]?.startTime ?? Number.POSITIVE_INFINITY),
    ),
}));

export const resolveParagraphGapThreshold = (lines: readonly Line[], params: LumiereStructureParams = DEFAULT_LUMIERE_STRUCTURE_PARAMS) => {
    const gaps = lines.slice(1).map((line, index) => (
        line.startTime - Math.min(getLineRenderEndTime(lines[index]), line.startTime)
    )).filter(gap => gap > 0);
    return clamp(median(gaps) * params.gapMultiplier, params.gapMin, params.gapMax);
};

export const metadataChanged = (previous: Line, next: Line) => (
    (previous.blockIndex !== undefined && next.blockIndex !== undefined && previous.blockIndex !== next.blockIndex)
    || (previous.songPart !== undefined && next.songPart !== undefined && previous.songPart !== next.songPart)
);

/** 超過行數或時長的段落在最大空隙處切開；recursiveSplit 時左半部分也繼續切。 */
export const splitOversizedDraft = (draft: ParagraphDraft, params: LumiereStructureParams): ParagraphDraft[] => {
    const output: ParagraphDraft[] = [];
    let remaining = draft.lines;
    let boundary = draft.boundary;
    let loopGuard = 0;
    while (remaining.length > params.maxLines || (remaining.length > 1 && (remaining.at(-1)!.renderEndTime - remaining[0]!.line.startTime) > params.maxDuration)) {
        if (loopGuard++ > 1000) break;
        const candidates = remaining.slice(2, -1).map((line, offset) => ({
            splitIndex: offset + 2,
            gap: line.line.startTime - remaining[offset + 1]!.renderEndTime,
        }));
        const validCandidates = candidates.filter(candidate => !Number.isNaN(candidate.gap));
        const rawSplitIndex = validCandidates.sort((a, b) => b.gap - a.gap)[0]?.splitIndex ?? Math.min(4, remaining.length - 1);
        const splitIndex = Math.max(1, rawSplitIndex);
        const head: ParagraphDraft = { lines: remaining.slice(0, splitIndex), boundary };
        output.push(...(params.recursiveSplit ? splitOversizedDraft(head, params) : [head]));
        remaining = remaining.slice(splitIndex);
        boundary = output.at(-1)!.lines.length >= params.maxLines ? 'line-cap' : 'duration-cap';
    }
    output.push({ lines: remaining, boundary });
    return output;
};

/** 自動分段：元數據變化或空隙超過閾值處切開，再按上限切開超長的段落。 */
export const draftParagraphs = (
    lines: readonly StructureLine[],
    threshold: number,
    params: LumiereStructureParams = DEFAULT_LUMIERE_STRUCTURE_PARAMS,
): ParagraphDraft[] => {
    const drafts: ParagraphDraft[] = [];
    let current: ParagraphDraft = { lines: [], boundary: 'song-start' };
    lines.forEach((line, index) => {
        const previous = lines[index - 1];
        const gap = previous ? line.line.startTime - previous.renderEndTime : 0;
        const boundary = previous && metadataChanged(previous.line, line.line)
            ? 'metadata'
            : previous && gap >= threshold
                ? 'time-gap'
                : null;
        if (boundary && current.lines.length > 0) {
            drafts.push(...splitOversizedDraft(current, params));
            current = { lines: [], boundary };
        }
        current.lines.push(line);
    });
    if (current.lines.length > 0) drafts.push(...splitOversizedDraft(current, params));
    return drafts;
};

/** 一行裡「像詞」的片段數。 */
export const countWordLike = (line: Line) => segmentLyricWords(line).filter(part => part.isWordLike).length;

/** 段落性質：副歌標記 → 間奏標記 → 最後一段是尾聲 → 短或詞少是換氣 → 標點多或詞密是上揚 → 其餘是主歌。 */
export const classifyParagraph = (lines: readonly StructureLine[], index: number, total: number): ParagraphKind => {
    if (lines.some(item => item.line.isChorus || /chorus|副歌/i.test(item.line.songPart ?? ''))) return 'chorus';
    if (lines.some(item => /bridge|break|間奏|ブリッジ/i.test(item.line.songPart ?? ''))) return 'break';
    if (index === total - 1) return 'outro';
    const duration = lines.at(-1)!.renderEndTime - lines[0]!.line.startTime;
    const segmentCount = lines.reduce((sum, line) => sum + countWordLike(line.line), 0);
    const punctuationCount = lines.reduce((sum, line) => sum + (line.line.fullText.match(/[!?！？…]/g)?.length ?? 0), 0);
    if (duration <= 3.5 || segmentCount <= 3) return 'breath';
    if (punctuationCount >= 2 || segmentCount / Math.max(duration, 1) > 2.5) return 'lift';
    return 'verse';
};
