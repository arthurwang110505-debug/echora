// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/program.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { Line } from '../../types';
import { createRng } from './lumiereRandom';
import type { Mood, ParagraphBoundary, ParagraphKind, StructureLine } from './lumiereKernel';
import { LUMIERE_KINDS, profileOf } from './catalog';

// Echora note: upstream opens this file with a "reference value" that is `(X + Math.imul(...))`
// minus itself, i.e. identically 0, plus a device-pixel-ratio read that only feeds it. The 20
// files carrying it all do the same thing, so the dead expressions are dropped and the offset
// stays as a named 0: every use site downstream is unchanged, and so is the rendering.
const LUMIERE_NEUTRAL_OFFSET = 0;


// src/components/visualizer/lumiere/program.ts
// 繪光的切塊與選光位：切塊（一個鏡頭 1–2 行，長間隙出間奏鏡頭）與選光位（按段落性質 / energy 定 mood，
// 族不連續重複、最近用過的不馬上再用）。純數據，不碰 Pixi。整首歌的編譯（分段、轉場、開場）在 lumiereProgram.ts。
// folia 裡是全自動的：沒有鎖定風格、風格庫偏好與族限制，energy 恆為 null（按段落性質定 mood）。
export interface LumiereShot {
    id: string;
    kind: string;
    /** 覆蓋的歌詞行（全曲行序號）；間奏鏡頭為空。 */
    lineIndices: number[];
    startTime: number;
    endTime: number;
    lyricEndTime: number;
    isBridge: boolean;
}

export interface LumiereParagraph {
    id: string;
    /** 在程序裡的序號。 */
    index: number;
    kind: ParagraphKind;
    boundary: ParagraphBoundary;
    /**
     * 場景單元的時間範圍：從這一段第一行開始（第一段從 0 開始）到下一段開始（最後一段到歌曲結束或最後一行唱完），
     * 段與段首尾相接；段後的長間奏在這一段裡以間奏鏡頭的形式出現。
     */
    startTime: number;
    endTime: number;
    /** 最後一行的視覺結束時間；沒有歌詞的間奏段（前奏、純音樂）等於 endTime。 */
    lyricEndTime: number;
    /** 單元涉及的歌詞行（全曲行序號）與行本身，窗口排它們。 */
    lineIndices: number[];
    lines: Line[];
    shots: LumiereShot[];
    /** 出場轉場；lights-out 時場景自己在窗口裡收光，其餘由運行時做交叉漸變 / 模糊。 */
    transitionOut: { kind: LumiereTransitionKind; startTime: number; endTime: number } | null;
    /** 這個單元是段落的開頭（星空點亮的開場只在這裡播放）。 */
    opening: boolean;
    /**
     * 軌跡過渡把整首歌併成一個單元時，原來各段落的範圍（運鏡按段落往返推拉）；按段落切單元時不給。
     */
    sections?: LumiereSection[];
}

/** 並進一個單元的原段落範圍（lumiereSeamless.ts）。 */
export interface LumiereSection {
    startTime: number;
    endTime: number;
    kind: ParagraphKind;
}

export const LUMIERE_TRANSITION_KINDS = ['lights-out', 'flare-cut', 'focus-pull'] as const;
export type LumiereTransitionKind = typeof LUMIERE_TRANSITION_KINDS[number];

export interface LumiereChain {
    /** 最近用過的光位（新的在後）。 */
    recent: string[];
    family: string | null;
}

export interface LumiereParams {
    /** 一個鏡頭最長多少秒（兩行合成一個鏡頭時的上限）。 */
    maxShotDuration: number;
    /** 一個鏡頭最多幾行。 */
    maxLinesPerShot: number;
    /** 一行本身長於這麼多秒就單獨成鏡頭。 */
    longLine: number;
    /** 行與行之間空隙超過這麼多秒出間奏鏡頭。 */
    bridgeGap: number;
}

export const DEFAULT_LUMIERE_PARAMS: LumiereParams = {
    maxShotDuration: 7,
    maxLinesPerShot: 2,
    longLine: 3.6,
    bridgeGap: 4,
};

/** 最近用過的幾個光位不馬上再用。 */
const RECENT = 3 + LUMIERE_NEUTRAL_OFFSET;
/** 間奏鏡頭偏向的族。 */
const BRIDGE_FAMILIES = ['motes', 'astral', 'zenith'];

const MOODS_BY_KIND: Record<ParagraphKind, Mood[] | null> = {
    chorus: ['loud', 'neutral'],
    lift: ['loud', 'neutral'],
    verse: ['quiet', 'neutral'],
    breath: ['quiet', 'neutral'],
    outro: ['quiet'],
    break: null,
};

/** 顯式 energy：低能量排除喧譁的光位，高能量排除安靜的，中段不限。 */
export const moodsForEnergy = (energy: number): Mood[] | null => (
    energy < 0.33 ? ['quiet', 'neutral'] : energy < 0.66 ? null : ['neutral', 'loud']
);

interface Group {
    lines: StructureLine[];
}

/** 切塊：短行兩兩合成一個鏡頭（不超過時長上限），長行單獨成鏡頭。 */
export const groupLines = (lines: readonly StructureLine[], params: LumiereParams): Group[] => {
    const groups: Group[] = [];
    for (const line of lines) {
        const duration = line.renderEndTime - line.line.startTime;
        const last = groups.at(-1);
        const lastStart = last?.lines[0]?.line.startTime ?? 0;
        const lastLong = last ? last.lines.length === 1 && (last.lines[0]!.renderEndTime - lastStart) >= params.longLine : true;
        if (
            last
            && !lastLong
            && duration < params.longLine
            && last.lines.length < params.maxLinesPerShot
            && line.renderEndTime - lastStart <= params.maxShotDuration
        ) {
            last.lines.push(line);
        } else {
            groups.push({ lines: [line] });
        }
    }
    return groups;
};

export interface PlannedShot {
    lines: StructureLine[];
    startTime: number;
    endTime: number;
    lyricEndTime: number;
    isBridge: boolean;
}

/**
 * 鏡頭的時間：每個鏡頭從它的第一行開始（段首鏡頭從段落開始），到下一個鏡頭開始為止；
 * 行後的空隙超過 bridgeGap 時，鏡頭在行唱完後 0.6 秒收住，空隙交給間奏鏡頭。
 */
export const planShots = (
    lines: readonly StructureLine[],
    paragraphStart: number,
    paragraphEnd: number,
    params: LumiereParams,
): PlannedShot[] => {
    const groups = groupLines(lines, params);
    const shots: PlannedShot[] = [];
    groups.forEach((group, index) => {
        const start = index === 0 ? Math.min(paragraphStart, group.lines[0]!.line.startTime) : group.lines[0]!.line.startTime;
        const lyricEnd = Math.max(...group.lines.map(line => line.renderEndTime));
        const nextStart = groups[index + 1]?.lines[0]?.line.startTime ?? paragraphEnd;
        if (nextStart - lyricEnd >= params.bridgeGap) {
            const end = lyricEnd + 0.6;
            shots.push({ lines: group.lines, startTime: start, endTime: end, lyricEndTime: lyricEnd, isBridge: false });
            shots.push({ lines: [], startTime: end, endTime: nextStart, lyricEndTime: nextStart, isBridge: true });
        } else {
            shots.push({ lines: group.lines, startTime: start, endTime: Math.max(nextStart, lyricEnd), lyricEndTime: Math.min(lyricEnd, nextStart), isBridge: false });
        }
    });
    if (groups.length === 0 && paragraphEnd > paragraphStart) {
        shots.push({ lines: [], startTime: paragraphStart, endTime: paragraphEnd, lyricEndTime: paragraphEnd, isBridge: true });
    }
    return shots;
};

/**
 * 選光位：全部光位 → 間奏限定族 → mood → 避開最近用過的與上一個的族，每一步篩空了就退回上一步。
 * energy 為 null 時按段落性質定 mood（folia 裡總是 null）。
 */
export const castShot = (options: {
    seed: string;
    paragraphIndex: number;
    shotIndex: number;
    kind: ParagraphKind;
    isBridge: boolean;
    chain: LumiereChain;
    energy?: number | null;
}): string => {
    const { chain } = options;
    let candidates: readonly string[] = LUMIERE_KINDS;
    /** 按條件收窄；收窄後少於 atLeast 個就不收（族還不全時，避開同族會變成兩族來回交替）。 */
    const narrow = (keep: (kind: string) => boolean, atLeast = 1) => {
        const next = candidates.filter(keep);
        if (next.length >= atLeast) candidates = next;
    };
    const energy = options.energy ?? null;
    const moods = energy === null ? MOODS_BY_KIND[options.kind] : moodsForEnergy(energy);
    if (options.isBridge) narrow(kind => BRIDGE_FAMILIES.includes(profileOf(kind).family) && profileOf(kind).mood !== 'loud');
    if (moods) narrow(kind => moods.includes(profileOf(kind).mood));
    narrow(kind => !chain.recent.includes(kind));
    if (chain.family) narrow(kind => profileOf(kind).family !== chain.family, 3);
    const random = createRng(`${options.seed}:${options.paragraphIndex}:${options.shotIndex}:cast`);
    return candidates[Math.floor(random() * candidates.length)]!;
};

/** 選定之後更新 chain（跨段落保留）。 */
export const advanceChain = (chain: LumiereChain, kind: string) => {
    chain.recent = [...chain.recent, kind].slice(-RECENT);
    chain.family = profileOf(kind).family;
};
