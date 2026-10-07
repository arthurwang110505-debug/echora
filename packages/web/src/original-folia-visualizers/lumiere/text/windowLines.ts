// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/text/windowLines.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { Container, Sprite } from 'pixi.js';
import type { Line } from '../../../types';
import { splitLyricGraphemes } from '../../../utils/lyrics/graphemeTiming';
import type { WordColorMatcher } from '../../wordColoring';
import type { Rgb } from '../color';
import type { LightSprites } from '../light/sprites';
import { buildGlyphLine, type GlyphLine } from './glyphLine';
import { resolveGlyphKeywordColors, type KeywordTints } from './keywordColors';
import { flowLine, type LineFlow, type TextMeasurer } from './lineWrap';
import { buildGlyphTimings, type GlyphTiming } from './reveal';
import { MAX_WORD_SCALE, segmentWords, wordJags, wordScales } from './wordStyle';

// src/components/visualizer/lumiere/text/windowLines.ts
// 歌詞窗口裡的一行：構建時要畫字形紋理、用 pretext 量詞寬排出四種版式（最貴的一步）、建精靈。
// 窗口只在當前行附近按需構建（整首歌一個單元時也一樣），所以這裡分成兩半：
//   - LineMeta：每行都有、很便宜（逐字時刻、字素、關鍵字色），爆閃選字、光斑、時刻判斷用它；
//   - LineView：按需構建、離開窗口後釋放。構建結果只由（行、種子）決定，與何時構建無關：逐字的隨機量
//     取自整個窗口共用的那條隨機流，按前面各行的字數直接跳到這一行的起點（createRngAt），和從第一行起
//     順序構建時拿到的值完全一樣。
type PixiModule = typeof import('pixi.js');

export interface Point {
    x: number;
    y: number;
}

/**
 * 換槽位時字的飛行曲線（三次貝塞爾）。控制點按種子：有的走弧線、有的打捲成 S 形；起飛時間錯開。
 * 起點與終點相同時（朝向不變）就是甩出去再繞回來的一個圈。
 */
export interface GlyphFlight {
    /** 兩個控制點：分別相對起點與終點的偏移（邏輯像素，未縮放）。 */
    c1: Point;
    c2: Point;
    /** 在整段滑動（0..1）裡何時起飛、飛多久。 */
    delay: number;
    duration: number;
    /** 飛行途中的轉動（弧度，途中最大）。 */
    spin: number;
    /** 徑跡抖動的相位。 */
    wobble: number;
}

export interface GlyphView {
    glyph: Sprite;
    halo: Sprite;
    star: Sprite;
    timing: GlyphTiming;
    blank: boolean;
    /** 在行裡的序號：字心位置查 LineView.flow（橫豎 × 單行 / 折行）。豎排時的轉角。 */
    index: number;
    vRotation: number;
    /** 換槽位時的飛行曲線。 */
    flight: GlyphFlight;
    /** 所在詞的字號倍率。 */
    scale: number;
    /** 閃點相對字心的偏移（以字號為單位）、旋轉與大小：按種子逐字固定，落點有上下錯落。 */
    starShape: { dx: number; dy: number; rotation: number; size: number };
    /** 崩解：漂離方向（單位向量）、速度倍率、轉動方向；聚合：散開時的偏移（以字號為單位）；呼吸的相位。 */
    drift: { dx: number; dy: number; speed: number; spin: number };
    scatter: Point;
    phase: number;
    /** 關鍵字色（不是關鍵字為 null）與它在當前光色下的幾種顏色（光色變了才重算）。 */
    keyword: Rgb | null;
    tints: KeywordTints | null;
}

export interface Slot {
    dx: number;
    dy: number;
    scale: number;
    alpha: number;
    /** 朝向：0 橫排，1 豎排。 */
    orient: number;
    /** 整行的傾斜（弧度）。 */
    rotation: number;
    /** 0 單行，1 折成兩行（兩列）。 */
    wrap: number;
}

export interface LineView {
    index: number;
    line: Line;
    layout: GlyphLine;
    /** 字、光暈、閃點各一個容器（按行號排在各自的層裡，畫的先後與構建順序無關）。 */
    holder: Container;
    haloLayer: Container;
    starLayer: Container;
    glyphs: GlyphView[];
    keywordGlyphs: GlyphView[];
    /** 四種排版（橫豎 × 單行 / 折行）：字心位置、光斑路徑與整塊尺寸（邏輯像素，含詞的字號差異）。 */
    flow: LineFlow;
    /** 縱橫交錯時這一行在各個相對位置（−2..2，不含 0）上的落點。 */
    placements: Map<number, Slot>;
    /** 追字光斑（每行一個，換行時兩行的光斑各自淡入淡出，不會跳）。 */
    spot: Sprite;
    /** 第一個字開始、最後一個字結束的時刻。 */
    singStart: number;
    singEnd: number;
    /** 錯落：每行一個穩定的偏移（高度單位；橫排時橫向、豎排時縱向）。 */
    jitter: number;
    /** 持續漂移：恆定速度（高度單位 / 秒）、繞行與擺動的相位。 */
    velocity: Point;
    motionPhase: number;
}

/** 每個字、每行（字之後）從窗口隨機流裡取幾個值：改了 buildLineView 裡的取值就要同步改這裡（單測會查）。 */
export const GLYPH_RANDOM_DRAWS = 19;
export const LINE_RANDOM_DRAWS = 4;

/** 每行都有的便宜信息（逐字時刻與關鍵字色第一次用到時才算）。 */
export interface LineMeta {
    line: Line;
    graphemes: string[];
    /** 這一行在窗口隨機流裡的起點（前面各行一共取了幾個值）。 */
    randomOffset: number;
    timing: LineTiming | undefined;
    /** 關鍵字色（沒有關鍵字時為 null）。 */
    keywordColors: Array<Rgb | null> | null | undefined;
}

export interface LineTiming {
    /** 逐字（字素）的點亮時刻；缺的按整行。 */
    timings: GlyphTiming[];
    /** 第一個字開始、最後一個字結束的時刻（空白不算）。 */
    singStart: number;
    singEnd: number;
}

export const buildLineMetas = (lines: readonly Line[]): LineMeta[] => {
    let offset = 0;
    return lines.map(line => {
        const graphemes = splitLyricGraphemes(line.fullText);
        const meta: LineMeta = { line, graphemes, randomOffset: offset, timing: undefined, keywordColors: undefined };
        offset += graphemes.length * GLYPH_RANDOM_DRAWS + LINE_RANDOM_DRAWS;
        return meta;
    });
};

/** 某行的逐字時刻（第一次用到時算，之後緩存）。 */
export const lineTimingOf = (meta: LineMeta): LineTiming => {
    if (!meta.timing) {
        const { line, graphemes } = meta;
        const timings = buildGlyphTimings(line);
        const sung = graphemes.flatMap((char, index) => (char.trim().length === 0 ? [] : [timings[index] ?? { start: line.startTime, end: line.endTime }]));
        meta.timing = {
            timings,
            singStart: sung.length ? Math.min(...sung.map(timing => timing.start)) : line.startTime,
            singEnd: sung.length ? Math.max(...sung.map(timing => timing.end)) : line.endTime,
        };
    }
    return meta.timing;
};

/** 某行的關鍵字色（第一次用到時匹配，之後緩存）。 */
export const keywordColorsOf = (meta: LineMeta, keywords: readonly WordColorMatcher[] | undefined) => {
    if (meta.keywordColors === undefined) {
        meta.keywordColors = keywords && keywords.length > 0 ? resolveGlyphKeywordColors(meta.line.fullText, keywords) : null;
    }
    return meta.keywordColors;
};

export interface LineBuildContext {
    pixi: PixiModule;
    font: string;
    weight: number;
    resolution: number;
    heroPx: number;
    spacing: number;
    seed: string;
    sprites: LightSprites;
    measurer: TextMeasurer;
    limits: { horizontal: number; vertical: number };
    keywords: readonly WordColorMatcher[] | undefined;
    driftSpeed: readonly [number, number];
    placementsOf: (lineIndex: number) => Map<number, Slot>;
}

/**
 * 構建第 lineIndex 行（不掛到任何層上，由窗口按行號插進去）。rng 必須已經跳到這一行的起點（meta.randomOffset），
 * 取值的個數固定為 GLYPH_RANDOM_DRAWS × 字數 + LINE_RANDOM_DRAWS。
 */
export const buildLineView = (context: LineBuildContext, lineIndex: number, meta: LineMeta, rng: () => number): LineView => {
    const { pixi, heroPx, sprites } = context;
    const { line } = meta;
    const { timings, singStart, singEnd } = lineTimingOf(meta);
    // 字形紋理按最大的詞字號畫，放大的詞只縮小不放大。
    const layout = buildGlyphLine(pixi, {
        text: line.fullText,
        fontPx: heroPx * MAX_WORD_SCALE,
        font: context.font,
        weight: context.weight,
        resolution: context.resolution,
        letterSpacing: context.spacing,
    });
    const keywordColors = keywordColorsOf(meta, context.keywords);

    // 分詞與字號：每個字歸到一個詞，帶上那個詞的字號倍率與錯落。
    const words = segmentWords(line);
    const wordSeed = `${context.seed}:${lineIndex}:${line.fullText}`;
    const scales = wordScales(words, wordSeed);
    const jags = wordJags(words, scales, wordSeed);
    const wordOf = layout.glyphs.map((_, index) => Math.max(0, words.findIndex(word => index >= word.start && index < word.end)));
    const glyphScale = (index: number) => scales[wordOf[index]!] ?? 1;
    const glyphJag = (index: number) => (jags[wordOf[index]!] ?? 0) * heroPx;

    // 橫排：按詞字號推進，基線對齊（小字往下沉一點），每個詞再上下錯開；豎排：按列推進，居中對齊，每個詞左右錯開。
    // 詞寬用 pretext 量，太長時折成兩行 / 兩列（lineWrap），四種排版一次算好。
    const flow = flowLine(
        context.measurer,
        layout.glyphs.map((slice, index) => ({
            char: slice.char,
            scale: glyphScale(index),
            advance: (slice.charWidth / MAX_WORD_SCALE) * glyphScale(index),
            upright: slice.upright,
            jag: glyphJag(index),
        })),
        words,
        { heroPx, limits: context.limits },
    );

    const holder = new pixi.Container();
    const haloLayer = new pixi.Container();
    const starLayer = new pixi.Container();
    holder.label = `line-${lineIndex}`;
    const glyphs: GlyphView[] = layout.glyphs.map((slice, index) => {
        const glyph = new pixi.Sprite(slice.texture);
        glyph.anchor.set(slice.anchorX, slice.anchorY);
        holder.addChild(glyph);
        // 飛行曲線：第一個控制點朝隨機方向甩出去，第二個在它的基礎上轉過半圈左右（弧線或 S 形、打卷）。
        const a1 = rng() * Math.PI * 2;
        const a2 = a1 + Math.PI * (rng() < 0.5 ? 0.5 : 1.5) + (rng() - 0.5) * 0.8;
        const m1 = heroPx * (1.6 + rng() * 3.2);
        const m2 = heroPx * (1 + rng() * 2.6);
        // 起飛時刻與飛行時長在整段滑動裡鋪開（delay + duration ≤ 1，滑動結束時一定到位）。
        const duration = 0.45 + rng() * 0.4;
        const flight: GlyphFlight = {
            c1: { x: Math.cos(a1) * m1, y: Math.sin(a1) * m1 },
            c2: { x: Math.cos(a2) * m2, y: Math.sin(a2) * m2 },
            delay: rng() * (1 - duration),
            duration,
            spin: (rng() - 0.5) * 2.4,
            wobble: rng() * Math.PI * 2,
        };
        const halo = new pixi.Sprite(sprites.dot);
        halo.anchor.set(0.5);
        haloLayer.addChild(halo);
        const star = new pixi.Sprite(sprites.star);
        star.anchor.set(0.5);
        starLayer.addChild(star);
        if (slice.blank) {
            glyph.visible = false;
            halo.visible = false;
            star.visible = false;
        }
        // 漂離方向：多數向上（煙往上走），左右散開。
        const angle = -Math.PI / 2 + (rng() - 0.5) * 2.2;
        const scatterAngle = rng() * Math.PI * 2;
        const scatterDistance = 0.6 + rng() * 1.4;
        return {
            glyph,
            halo,
            star,
            timing: timings[index] ?? { start: line.startTime, end: line.endTime },
            blank: slice.blank,
            index,
            vRotation: slice.upright ? 0 : Math.PI / 2,
            flight,
            scale: glyphScale(index),
            starShape: {
                dx: -0.15 + rng() * 0.5,
                // 上下隨機：多數落在字的上半，少數壓到字腳下。
                dy: -0.62 + rng() ** 1.4 * 0.9,
                rotation: (rng() - 0.5) * 0.5,
                size: 0.65 + rng() * 0.7,
            },
            drift: { dx: Math.cos(angle), dy: Math.sin(angle), speed: 0.6 + rng() * 0.9, spin: (rng() - 0.5) * 2 },
            scatter: { x: Math.cos(scatterAngle) * scatterDistance, y: Math.sin(scatterAngle) * scatterDistance },
            phase: rng() * Math.PI * 2,
            keyword: slice.blank ? null : keywordColors?.[index] ?? null,
            tints: null,
        };
    });
    const spot = new pixi.Sprite(sprites.dot);
    spot.anchor.set(0.5);
    const [slow, fast] = context.driftSpeed;
    return {
        index: lineIndex,
        line,
        layout,
        holder,
        haloLayer,
        starLayer,
        glyphs,
        keywordGlyphs: glyphs.filter(glyph => glyph.keyword !== null),
        flow,
        // 落點用單獨的隨機流：排版換來換去時，別的隨機量不受影響。
        placements: context.placementsOf(lineIndex),
        spot,
        singStart,
        singEnd,
        jitter: (rng() - 0.5) * 0.16,
        velocity: (() => {
            const angle = rng() * Math.PI * 2;
            const speed = slow + rng() * (fast - slow);
            return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
        })(),
        motionPhase: rng() * Math.PI * 2,
    };
};
