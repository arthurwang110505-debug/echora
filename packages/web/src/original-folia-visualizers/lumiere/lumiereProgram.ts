// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/lumiereProgram.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { Line } from '../../types';
import type { ParagraphBoundary, ParagraphKind, StructureLine } from './lumiereKernel';
import { buildStructureLines, draftParagraphs, resolveParagraphGapThreshold, classifyParagraph } from './lumiereStructure';
import { mergeLumiereParagraphs } from './lumiereSeamless';
import { chooseLumiereTransition, LUMIERE_TRANSITIONS } from './lumiereTransitions';
import {
    advanceChain,
    castShot,
    DEFAULT_LUMIERE_PARAMS,
    planShots,
    type LumiereChain,
    type LumiereParagraph,
    type LumiereParams,
    type LumiereShot,
    type LumiereTransitionKind,
    type PlannedShot,
} from './program';

// src/components/visualizer/lumiere/lumiereProgram.ts
// 繪光在 folia 裡的整首編譯：歌詞 → 段落（分段與段落性質同 tempera / sonnet）→ 每段切鏡頭、選光位（chain 跨段落）
// → 段落轉場與星空開場。對應 lumisynth 統一編譯器 + 繪光包的 compileParagraph / toNativeParagraph，
// 但沒有編輯器的鎖定、組件槽與跨包，全自動；同樣的歌詞與種子永遠得到同樣的程序（純函數，不碰 Pixi）。
//
// 與 lumisynth 的兩處差別（folia 沒有內核，運行時直接按段落切場景）：
//   1. 段落首尾相接鋪滿時間軸：第一段從 0 開始（前奏夠長時單獨出一個間奏段），每段延伸到下一段開始，
//      最後一段延伸到歌曲結束（給了 duration 時）。段後的長間奏在本段裡以間奏鏡頭出現，而不是讓上一段的
//      最後一個鏡頭一直掛著。
//   2. 純音樂 / 沒有歌詞：不造虛擬歌詞行（繪光會把它們當字畫出來），而是在 duration（缺省 480 秒）上
//      鋪一串只有間奏鏡頭的段落，光位從螢塵、星象、天光裡選。

export interface LumiereProgramOptions {
    /**
     * 歌曲總時長（秒）。有歌詞時最後一段延伸到這裡（尾奏出間奏鏡頭）；沒有歌詞時按它鋪純間奏的程序
     * （不給用 480 秒）。
     */
    duration?: number;
    /**
     * 軌跡過渡：整首歌編成一個場景單元，段落之間也走光位交接（lumiereSeamless.ts）。鏡頭與光位和不開時相同，
     * 只是沒有段落轉場與再次開場。
     */
    seamless?: boolean;
}

export interface LumiereProgram {
    version: 1;
    seed: string;
    /** 沒有歌詞，整首都是間奏鏡頭。 */
    instrumental: boolean;
    paragraphGapThreshold: number;
    /** 最後一個段落的結束時間（整個程序覆蓋 [0, duration]）。 */
    duration: number;
    /** 最後一行唱完的時刻（片尾卡從這裡開始）；純音樂為 null。 */
    lyricEndTime: number | null;
    paragraphs: LumiereParagraph[];
}

/** 與上一段之間空隙超過這麼多秒，才重新播放星空點亮的開場。 */
export const REOPEN_GAP = 2.5;
/** 純音樂缺省時長、每段時長與每個間奏鏡頭的目標時長（秒）。 */
const INSTRUMENTAL_DURATION = 480;
const INSTRUMENTAL_PARAGRAPH = 32;
const BRIDGE_SHOT = 10;
/** 間奏鏡頭長於這麼多秒就切成幾個（一個光位掛太久會顯得停住）。 */
const BRIDGE_SPLIT = 16;

interface ParagraphPlan {
    lines: StructureLine[];
    kind: ParagraphKind;
    boundary: ParagraphBoundary;
    startTime: number;
    endTime: number;
    lyricEndTime: number;
}

/** 把過長的間奏鏡頭等分成約 BRIDGE_SHOT 秒的幾段。 */
const splitLongBridges = (shots: PlannedShot[]): PlannedShot[] => shots.flatMap(shot => {
    const length = shot.endTime - shot.startTime;
    if (!shot.isBridge || length <= BRIDGE_SPLIT) return [shot];
    const count = Math.max(2, Math.round(length / BRIDGE_SHOT));
    return Array.from({ length: count }, (_, index) => {
        const startTime = shot.startTime + (length * index) / count;
        const endTime = index === count - 1 ? shot.endTime : shot.startTime + (length * (index + 1)) / count;
        return { lines: [], startTime, endTime, lyricEndTime: endTime, isBridge: true };
    });
});

/** 有歌詞時的段落計劃：可選的前奏段 + 分段結果，首尾相接鋪到 programEnd。 */
const planLyricParagraphs = (lines: readonly Line[], params: LumiereParams, duration: number | undefined) => {
    const structure = buildStructureLines(lines);
    const paragraphGapThreshold = resolveParagraphGapThreshold(lines);
    const drafts = draftParagraphs(structure, paragraphGapThreshold);
    const lyricEndTime = Math.max(...structure.map(line => line.renderEndTime));
    const programEnd = Math.max(lyricEndTime, duration ?? 0);
    const firstStart = structure[0]!.line.startTime;
    const plans: ParagraphPlan[] = [];
    // 前奏夠長（≥ bridgeGap）時單獨成一個間奏段：星空開場在 0 秒播放，前奏裡有光，第一句不再從全黑開始。
    const intro = firstStart >= params.bridgeGap;
    if (intro) {
        plans.push({ lines: [], kind: 'break', boundary: 'intro', startTime: 0, endTime: firstStart, lyricEndTime: firstStart });
    }
    drafts.forEach((draft, index) => {
        const next = drafts[index + 1];
        plans.push({
            lines: draft.lines,
            kind: classifyParagraph(draft.lines, index, drafts.length),
            boundary: draft.boundary,
            startTime: index === 0 && !intro ? Math.min(0, firstStart) : draft.lines[0]!.line.startTime,
            endTime: next ? next.lines[0]!.line.startTime : programEnd,
            lyricEndTime: draft.lines.at(-1)!.renderEndTime,
        });
    });
    return { plans, paragraphGapThreshold, lyricEndTime, programEnd };
};

/** 純音樂的段落計劃：duration 等分成約 INSTRUMENTAL_PARAGRAPH 秒的段落。 */
const planInstrumentalParagraphs = (duration: number): ParagraphPlan[] => {
    const count = Math.max(1, Math.round(duration / INSTRUMENTAL_PARAGRAPH));
    return Array.from({ length: count }, (_, index) => {
        const startTime = (duration * index) / count;
        const endTime = index === count - 1 ? duration : (duration * (index + 1)) / count;
        return { lines: [], kind: 'break' as const, boundary: index === 0 ? 'song-start' as const : 'instrumental' as const, startTime, endTime, lyricEndTime: endTime };
    });
};

/**
 * 編譯整首歌。lines 是統一歌詞（按時間排序），seed 缺省為 'lumiere'；params 覆蓋切塊參數；
 * options.duration 為歌曲總時長（見 LumiereProgramOptions）。純函數：同樣的輸入得到逐字段相同的程序。
 */
export const compileLumiereProgram = (
    lines: readonly Line[],
    seed: string | number | undefined,
    params: Partial<LumiereParams> = {},
    options: LumiereProgramOptions = {},
): LumiereProgram => {
    const resolvedParams: LumiereParams = { ...DEFAULT_LUMIERE_PARAMS, ...params };
    const resolvedSeed = String(seed ?? 'lumiere');
    const instrumental = lines.length === 0;
    const lyric = instrumental ? null : planLyricParagraphs(lines, resolvedParams, options.duration);
    const instrumentalDuration = Math.max(1, options.duration && options.duration > 0 ? options.duration : INSTRUMENTAL_DURATION);
    const plans = lyric ? lyric.plans : planInstrumentalParagraphs(instrumentalDuration);

    const chain: LumiereChain = { recent: [], family: null };
    let previousTransition: LumiereTransitionKind | null = null;
    const paragraphs: LumiereParagraph[] = plans.map((plan, index) => {
        const planned = splitLongBridges(planShots(plan.lines, plan.startTime, plan.endTime, resolvedParams));
        const shots: LumiereShot[] = planned.map((shot, shotIndex) => {
            const kind = castShot({
                seed: resolvedSeed,
                paragraphIndex: index,
                shotIndex,
                kind: plan.kind,
                isBridge: shot.isBridge,
                chain,
            });
            advanceChain(chain, kind);
            return {
                id: `p${index}-lu${shotIndex}`,
                kind,
                lineIndices: shot.lines.map(line => line.sourceIndex),
                startTime: shot.startTime,
                endTime: shot.endTime,
                lyricEndTime: shot.lyricEndTime,
                isBridge: shot.isBridge,
            };
        });

        // 段落轉場：結束在下一段開始（= 本段 endTime），時長按與下一段之間的空隙定。
        const next = plans[index + 1];
        let transitionOut: LumiereParagraph['transitionOut'] = null;
        if (next) {
            const kind = chooseLumiereTransition(resolvedSeed, index, previousTransition);
            previousTransition = kind;
            const gap = next.startTime - plan.lyricEndTime;
            transitionOut = {
                kind,
                startTime: Math.max(plan.startTime, plan.endTime - LUMIERE_TRANSITIONS[kind].duration(gap)),
                endTime: plan.endTime,
            };
        }

        // 星空點亮的開場只在第一段、或與上一段唱完之間有明顯空隙時播放；否則每段都從全黑重來，太頻繁。
        const previous = plans[index - 1];
        const opening = !previous || plan.startTime - previous.lyricEndTime >= REOPEN_GAP;
        const lineIndices = plan.lines.map(line => line.sourceIndex);
        return {
            id: `lumiere-p${index}`,
            index,
            kind: plan.kind,
            boundary: plan.boundary,
            startTime: plan.startTime,
            endTime: plan.endTime,
            lyricEndTime: plan.lyricEndTime,
            lineIndices,
            lines: lineIndices.map(lineIndex => lines[lineIndex]!),
            shots,
            transitionOut,
            opening,
        };
    });

    return {
        version: 1,
        seed: resolvedSeed,
        instrumental,
        paragraphGapThreshold: lyric?.paragraphGapThreshold ?? 0,
        duration: lyric ? lyric.programEnd : instrumentalDuration,
        lyricEndTime: lyric ? lyric.lyricEndTime : null,
        paragraphs: options.seamless ? mergeLumiereParagraphs(paragraphs) : paragraphs,
    };
};

/** 時刻 time 所在的段落序號（第一段之前算第一段，最後一段之後算最後一段）。 */
export const findLumiereParagraphIndexAtTime = (program: LumiereProgram, time: number) => {
    for (let index = program.paragraphs.length - 1; index >= 0; index -= 1) {
        if (time >= program.paragraphs[index]!.startTime) return index;
    }
    return 0;
};
