// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/text/lyricWindow.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
// Echora note: upstream also imports the `Graphics` and `Sprite` types here and never uses
// them (both are reached as `pixi.Graphics` / sprite children). Dropped for `noUnusedLocals`.
import type { Container } from 'pixi.js';
import type { Line } from '../../../types';
import { createRng, createRngAt } from '../lumiereRandom';
import { compressLight, lightAt, type ResolvedBeam } from '../light/rig';
import type { LightSprites } from '../light/sprites';
import { hexOf, mixRgb, WHITE, type Rgb } from '../color';
import { clampInto, createTextMeasurer, fitScale, frameBand, shouldWrap, type LineVariant } from './lineWrap';
import { awayDrift, createProtectBox, heldDrift, PROTECT_MARGIN, protectedAlpha, protectionAt } from './lineClearance';
import { flashEnvelope, glyphProgress, type GlyphTiming } from './reveal';
import { MAX_WORD_SCALE } from './wordStyle';
import { buildLineMetas, buildLineView, keywordColorsOf, lineTimingOf, type GlyphFlight, type GlyphView, type LineView, type Point, type Slot } from './windowLines';
import type { WordColorMatcher } from '../../wordColoring';
import { KEYWORD_HALO_GAIN, keywordTints } from './keywordColors';

// Echora note: upstream opens this file with a "reference value" that is `(X + Math.imul(...))`
// minus itself, i.e. identically 0, plus a device-pixel-ratio read that only feeds it. The 20
// files carrying it all do the same thing, so the dead expressions are dropped and the offset
// stays as a named 0: every use site downstream is unchanged, and so is the rendering.
const LUMIERE_NEUTRAL_OFFSET = 0;


// src/components/visualizer/lumiere/text/lyricWindow.ts
// 局部平鋪窗口：只排當前行附近的幾行（fume 的錯落版式，但不是整首歌）。未來行是未點亮的刻字，
// 過去行是餘光，當前行最大。當前行換到下一行時，各行換到新的槽位，最老的一行淡出進煙裡。
//
// 縱橫：每個字同時有橫排位置與豎排位置（各有單行與折成兩行 / 兩列兩種，見 lineWrap）。三種排版：橫排為主、豎排為主、縱橫交錯。縱橫交錯時中心是
// 當前行的橫排，周圍的行按種子各有落點（上一行在上半圈、下一行在下半圈，角度與遠近隨機，橫豎都可能、
// 還會傾斜）。換槽位時每個字沿自己的貝塞爾曲線飛過去（朝向不變也會甩出去再繞回來），身後拖一條細徑跡：
// 徑跡記錄的是字在畫面上真正走過的路（疊加了行本身的移動、轉動與縮放），像雲室裡的粒子。字號按分詞有差異。
//
// 崩解：字點亮一會兒之後開始沿各自的方向（多數向上）漂離排版位置並轉動，越往後越快；
// 還沒唱到的行反過來，字從散開的位置逐漸聚攏。所有字都有一點呼吸般的晃動。
//
// 間隙（lineClearance）：鄰行的漂移不朝當前行走，當前行只在槽位附近繞小圈；非當前行的字落進當前行的
// 墨跡框（外擴一點）時壓暗，當前行始終清楚。
//
// 按需構建（windowLines）：只有當前行附近幾行（還在滑動的行往前再多三行、往後三行）有字形紋理、排版與精靈，
// 往後預先建兩行（每幀最多一行），離開後釋放；整首歌一個單元時構建也只花幾行的錢。
//
// 點亮：每個字的亮度 = 點亮進度 × (底光 + 該字位置的光場強度)，唱到的一瞬有四芒閃點，受光強的字
// 下面墊一層柔光暈——這就是參考圖裡化學式被光柱照到的部分局部發光。全部是 t 的純函數。
type PixiModule = typeof import('pixi.js');

/** 文字區（高度單位，中心 + 寬高）。 */
export interface WindowRegion {
    cx: number;
    cy: number;
    w: number;
    h: number;
}

/** horizontal：橫排為主；vertical：豎排為主（右起）；crossed：當前行橫排，周圍的行自由落點、橫豎都有。 */
export type WindowTypography = 'horizontal' | 'vertical' | 'crossed';

export interface DecaySpec {
    /** 崩解強度（0 = 不崩解）。 */
    strength: number;
    /** 字點亮後多久開始漂離（秒）。 */
    delay: number;
}

export interface LyricWindowOptions {
    width: number;
    height: number;
    lines: Line[];
    font: string;
    weight: number;
    resolution: number;
    region: WindowRegion;
    /** 當前行的字號（邏輯像素）。 */
    heroPx: number;
    /** 當前行之外顯示幾行：1 = 上一行，2 = 上一行 + 下一行。 */
    neighbors: 1 | 2;
    /** 默認排版。 */
    typography: WindowTypography;
    /**
     * 逐鏡頭的排版：第 lineIndex 行成為當前行時用哪種排版（它所在鏡頭的排版）。不給則全都用 typography。
     * 每次換行的起點槽位用上一次換行的排版，所以排版切換處也連續，字沿曲線飛過去。
     */
    typographyOf?: (lineIndex: number) => WindowTypography;
    decay: DecaySpec;
    /** 每次換槽位都讓字沿曲線飛、拖出徑跡（不給則只有縱橫交錯或朝向變化時才飛）。 */
    alwaysFly?: boolean;
    /** 漂移與繞行的倍率（片尾卡用 0：字停在原位，只留呼吸）。默認 1。 */
    drift?: number;
    seed: string;
    sprites: LightSprites;
    letterSpacing?: number;
    /** 關鍵字著色的匹配器（主題 wordColors，prepareLumiereKeywords）；不給或為空則不著色。 */
    keywords?: readonly WordColorMatcher[];
}

export interface LyricWindowFrame {
    time: number;
    beams: readonly ResolvedBeam[];
    litColor: Rgb;
    unlitColor: Rgb;
    unlitAlpha: number;
    /** 整體亮度（進退場）。 */
    intensity: number;
    /** 隱藏全部徑跡，不改變字的飛行路徑；不給時保持原有效果。 */
    hideTrails?: boolean;
}

export type { GlyphFlight } from './windowLines';

/** 滑動進度 phase（0..1）下這個字在曲線上的位置參數 0..1。 */
export const flightProgress = (flight: GlyphFlight, phase: number, lag = 0) => {
    const t = Math.min(1, Math.max(0, (phase - flight.delay - lag) / flight.duration));
    return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};

/** 起點 from → 終點 to 的貝塞爾曲線上參數 s 處的點。 */
export const flightPoint = (flight: GlyphFlight, from: Point, to: Point, s: number): Point => {
    const u = 1 - s;
    const a = u * u * u, b = 3 * u * u * s, c = 3 * u * s * s, d = s * s * s;
    return {
        x: a * from.x + b * (from.x + flight.c1.x) + c * (to.x + flight.c2.x) + d * to.x,
        y: a * from.y + b * (from.y + flight.c1.y) + c * (to.y + flight.c2.y) + d * to.y,
    };
};

/** 徑跡記錄過去多久走過的路（秒）；字到位後尾端再過這麼久追上，徑跡收攏消失。 */
const TRACK_TIME = 0.45 + LUMIERE_NEUTRAL_OFFSET;
const TRACK_SAMPLES = 20;

interface LineTransform {
    current: number;
    x: number;
    y: number;
    scale: number;
    rotation: number;
    alpha: number;
    /** 槽位切換的起止朝向、起止折行與滑動的線性進度；fly 為這一次切換字要不要沿曲線飛。 */
    fromOrient: number;
    toOrient: number;
    fromWrap: number;
    toWrap: number;
    /** 當前的折行程度（0..1，緩動過的）：不飛的時候字在單行與折行的位置之間滑。 */
    wrap: number;
    /** 當前的朝向（0 橫 .. 1 豎，隨滑動線性變化）：當前行的保護框按它混合橫豎兩種墨跡框。 */
    orient: number;
    phase: number;
    fly: boolean;
    /** 字的朝向與字心的起點（上一次已經走完的換位的終點）與此後還在進行的換位（按先後）。 */
    restOrient: number;
    restWrap: number;
    moves: Array<{ toOrient: number; toWrap: number; phase: number; fly: boolean }>;
    /** 這一次滑動開始的時刻（沒有滑動時為 −∞）。 */
    slideStart: number;
}

export interface GlyphAnchor {
    x: number;
    y: number;
    fontPx: number;
}

export interface LyricWindow {
    view: Container;
    /** 徑跡、光暈、字、閃點幾層；bloom 掛在 view 上。 */
    update: (frame: LyricWindowFrame) => void;
    /** 每行可見字（非空白）的點亮時刻，給爆閃選引爆的字。 */
    glyphTimes: (lineIndex: number) => Array<{ glyphIndex: number; start: number }>;
    /** 某個字在時刻 time 的位置（邏輯像素，含崩解偏移）與字號。 */
    glyphAnchor: (lineIndex: number, glyphIndex: number, time: number) => GlyphAnchor;
    /** 某一行在時刻 time 的中心（邏輯像素）、整行縮放與透明度（調試與連貫性檢查用）。 */
    lineAnchor: (lineIndex: number, time: number) => { x: number; y: number; scale: number; alpha: number };
    /** 某個字的關鍵字色（不是關鍵字為 null），給十字爆閃取色。 */
    glyphKeyword: (lineIndex: number, glyphIndex: number) => Rgb | null;
    destroy: () => void;
}

/**
 * 換行：從新一行開始前 LEAD 秒起，各行依次（按落到的新位置錯開 SLIDE_LAG 秒）用 SLIDE 秒滑到新位置——
 * 要離場的行先走，新的當前行隨後，新進來的行最後。滑動疊加在每行永不停止的漂移上，畫面沒有靜止的時刻。
 */
const LEAD = 1.2;
const SLIDE = 1.5;
const SLIDE_LAG: Record<number, number> = { [-2]: 0, [-1]: 0.15, 0: 0.3, 1: 0.5, 2: 0.6 };
const MAX_LAG = 0.6;
/** 每行的持續漂移：恆定速度（高度單位 / 秒）範圍、繞行幅度（高度單位）。 */
const DRIFT_SPEED: [number, number] = [0.013, 0.022];
const ORBIT = 0.03;
/** 逐字點亮的最短漸變時長（字本身很短時也不會一下跳亮）。 */
const LIGHT_UP = 0.3;
/** 追字光斑的時間平滑：對過去這段時間裡的位置取平均。 */
const SPOT_WINDOW = 0.3;
const SPOT_SAMPLES = 8;
/** 未唱的行從開始滑動前多久開始聚攏、聚攏多久。 */
const GATHER_LEAD = 1.6;
const GATHER = 1.8;

const smooth = (value: number) => {
    const t = Math.min(1, Math.max(0, value));
    return t * t * (3 - 2 * t);
};
const easeInOutCubic = (value: number) => {
    const t = Math.min(1, Math.max(0, value));
    return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};
/** 換位用更柔的正弦緩動：兩端的減速比三次曲線平緩，疊在漂移上不會有「停住」的感覺。 */
const easeInOutSine = (value: number) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, value)))) / 2;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpPoint = (a: Point, b: Point, k: number): Point => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });

/** 時刻 t 的當前行序號（-1 = 第一行之前）、滑動的線性進度 phase 與緩動後的 slide。 */
export const resolveWindowCursor = (lines: readonly Line[], time: number) => {
    let current = -1;
    for (let i = 0; i < lines.length; i += 1) {
        if (lines[i]!.startTime - LEAD <= time) current = i;
        else break;
    }
    const phase = current < 0 ? 1 : clamp01((time - (lines[current]!.startTime - LEAD)) / SLIDE);
    return { current, phase, slide: easeInOutSine(phase) };
};

/** 某一行在這次換行裡的滑動進度：按它落到的新位置（relative）錯開起步。 */
export const resolveLinePhase = (lines: readonly Line[], current: number, relative: number, time: number) => {
    if (current < 0) return { phase: 1, start: Number.NEGATIVE_INFINITY };
    const start = lines[current]!.startTime - LEAD + (SLIDE_LAG[Math.max(-2, Math.min(2, relative))] ?? 0);
    return { phase: clamp01((time - start) / SLIDE), start };
};

type SpotGlyph = { timing: GlyphTiming; center: number };

/** 行內的演唱位置（以字為單位的連續值，0 = 第一個字之前，n = 唱完）。 */
const singingPosition = (glyphs: readonly SpotGlyph[], time: number) => {
    let position = 0;
    for (const glyph of glyphs) position += glyphProgress(glyph.timing, time);
    return position;
};

/** 連續位置 → 行內座標：在相鄰字心之間線性插值。 */
const positionToX = (glyphs: readonly SpotGlyph[], position: number) => {
    const n = glyphs.length;
    if (n === 0) return 0;
    const index = Math.min(n - 1, Math.max(0, position - 0.5));
    const lower = Math.floor(index);
    const upper = Math.min(n - 1, lower + 1);
    return glyphs[lower]!.center + (glyphs[upper]!.center - glyphs[lower]!.center) * (index - lower);
};

/**
 * 追字光斑在行內的座標（沿行的方向）：對過去 window 秒裡的位置取平均（仍只由 t 決定）。
 * window = 0 時就是不平滑的逐字位置。
 */
export const resolveSpotX = (glyphs: readonly SpotGlyph[], time: number, window = SPOT_WINDOW) => {
    if (window <= 0) return positionToX(glyphs, singingPosition(glyphs, time));
    let x = 0;
    for (let s = 0; s < SPOT_SAMPLES; s += 1) {
        x += positionToX(glyphs, singingPosition(glyphs, time - (window * s) / (SPOT_SAMPLES - 1)));
    }
    return x / SPOT_SAMPLES;
};

/**
 * 崩解的漂離量（以字號為單位）：字點亮 delay 秒之後開始，按 age^1.5 緩慢加速。
 * 3 秒後約 0.4、5 秒約 0.9、8 秒約 1.8 個字號（× strength）：唱的時候只是開始鬆動，
 * 退到鄰行時明顯錯位，淡出前才散開。
 */
export const decayAmount = (decay: DecaySpec, litAt: number, time: number) => {
    const age = time - litAt - decay.delay;
    return age > 0 ? decay.strength * 0.08 * age ** 1.5 : 0;
};

/** 崩解到多遠開始淡出、多遠完全看不見（以字號為單位）。 */
const DISSOLVE_FROM = 1;
const DISSOLVE_SPAN = 2;

/**
 * 縱橫交錯時一行的自由落點：上一行（−1）在上半圈、下一行（+1）在下半圈，角度與遠近按種子；
 * 橫豎都可能，橫排的行傾斜得多一些。更遠的位置（±2）沿同一方向再推出去、透明。
 */
export const freePlacements = (random: () => number, region: WindowRegion, nextAlpha: number): Map<number, Slot> => {
    const placement = (upper: boolean, alpha: number): Slot => {
        const angle = upper ? Math.PI * (1.12 + random() * 0.76) : Math.PI * (0.12 + random() * 0.76);
        const rx = region.w * (0.24 + random() * 0.22);
        const ry = region.h * (0.3 + random() * 0.18);
        const vertical = random() < 0.5;
        return {
            dx: Math.cos(angle) * rx,
            dy: Math.sin(angle) * ry,
            scale: 0.5 + random() * 0.2,
            alpha,
            orient: vertical ? 1 : 0,
            rotation: (random() - 0.5) * (vertical ? 0.3 : 0.7),
            wrap: 0,
        };
    };
    const farther = (slot: Slot): Slot => ({ ...slot, dx: slot.dx * 1.45, dy: slot.dy * 1.45, scale: slot.scale * 0.85, alpha: 0 });
    const previous = placement(true, 0.9);
    const next = placement(false, nextAlpha);
    return new Map([[-1, previous], [1, next], [-2, farther(previous)], [2, farther(next)]]);
};

/**
 * 固定槽位裡鄰行與當前行之間的空隙（以字號為單位）：near 是 ±1 與當前行之間，far 是 ±2 與 ±1 之間。
 * 按單行單列（厚度一個字號）反推，單行時與原來的固定偏移完全一樣。
 */
const STACK_GAP = {
    vertical: { previous: 0.95, next: 0.88, farPrevious: 0.78, farNext: 0.7 },
    horizontal: { previous: 0.93, next: 0.735, farPrevious: 0.56, farNext: 0.56 },
};

/**
 * 橫排、豎排兩種排版的固定槽位（相對文字區中心，高度單位）。relative = 行號 − 當前行號。
 * 鄰行按實際厚度排開（豎排看寬度、橫排看高度），折成兩列 / 兩行的行不會壓到旁邊的行：
 * across(offset, scale) 是「當前行 + offset」那一行在這個槽位縮放下垂直於行方向的厚度（高度單位）。
 */
const fixedSlot = (
    typography: WindowTypography,
    relative: number,
    region: WindowRegion,
    fontH: number,
    nextAlpha: number,
    across: (offset: number, scale: number) => number,
): Slot => {
    const slot = (dx: number, dy: number, scale: number, alpha: number, orient: number): Slot => ({ dx, dy, scale, alpha, orient, rotation: 0, wrap: 0 });
    const vertical = typography === 'vertical';
    const orient = vertical ? 1 : 0;
    if (relative === 0) return slot(0, 0, 1, 1, orient);
    const previous = relative < 0;
    const far = Math.abs(relative) > 1;
    const nearScale = vertical ? 0.58 : 0.52;
    const scale = far ? (vertical ? 0.48 : 0.44) : nearScale;
    const gap = STACK_GAP[vertical ? 'vertical' : 'horizontal'];
    const sign = previous ? -1 : 1;
    let offset = across(0, 1) / 2 + (previous ? gap.previous : gap.next) * fontH;
    if (far) offset += across(sign, nearScale) + (previous ? gap.farPrevious : gap.farNext) * fontH;
    offset += across(relative, scale) / 2;
    const alpha = previous ? (far ? 0 : 0.9) : (far ? 0 : nextAlpha);
    if (vertical) {
        // 豎排從右往左讀：上一行在右、下一行在左。
        return slot(-sign * offset, sign * (far ? 0.07 : 0.03), scale, alpha, orient);
    }
    return slot(sign * region.w * (far ? 0.24 : 0.16), sign * offset, scale, alpha, orient);
};

/** 按需構建：當前行前後各畫幾行、往後預先建幾行、離開窗口多遠才釋放。 */
const WINDOW_REACH = 3;
const PREBUILD = 2;
const KEEP_MARGIN = 2;

/** 縱橫交錯時鄰行與當前行之間至少留的空隙（以字號為單位）。 */
const CROSSED_CLEARANCE = 0.5;

/** 堆疊軸：橫排與縱橫交錯時各行上下排開（y），豎排時左右排開（x）。 */
const stackX = (kind: WindowTypography) => (kind === 'vertical' ? 1 : 0);
/**
 * 當前行為 c、排版為 kind 時第 index 行背離當前行的方向（堆疊軸上的 ±1，當前行為 0）：橫排與縱橫交錯時
 * 上一行在上、下一行在下；豎排右起，上一行在右、下一行在左。
 */
const awayOf = (index: number, c: number, kind: WindowTypography) => (
    (index === c ? 0 : index < c ? -1 : 1) * (kind === 'vertical' ? -1 : 1)
);

const sameSlot = (a: Slot, b: Slot) => a.dx === b.dx && a.dy === b.dy && a.scale === b.scale
    && a.alpha === b.alpha && a.orient === b.orient && a.rotation === b.rotation && a.wrap === b.wrap;

export const createLyricWindow = (pixi: PixiModule, options: LyricWindowOptions): LyricWindow => {
    const { height, region, heroPx, sprites, typography, decay } = options;
    const view = new pixi.Container();
    const trackLayer = new pixi.Graphics();
    const halos = new pixi.Container();
    const glyphLayer = new pixi.Container();
    const stars = new pixi.Container();
    const spots = new pixi.Container();
    view.addChild(spots, trackLayer, halos, glyphLayer, stars);
    const spacing = options.letterSpacing ?? 0;
    const nextAlpha = options.neighbors >= 2 ? 0.95 : 0;
    // 長度上限：橫排用畫框內的整個寬度（縱橫交錯留一成給四周的行），豎排用畫框內的整個高度（避開底部字幕）。
    // 文字區只決定中心，不再限制行長。
    const band = frameBand(options.width, height);
    const columnCap = (band.bottom - band.top) * height;
    const maxWidthOf = (kind: WindowTypography) => (band.right - band.left) * height * (kind === 'crossed' ? 0.9 : 1);
    const measurer = createTextMeasurer(options.font, options.weight, spacing);
    const KEYWORDS = options.keywords && options.keywords.length > 0 ? options.keywords : undefined;

    const metas = buildLineMetas(options.lines);
    const lineCount = options.lines.length;
    /** 已構建的行（沒建的是 null）與它們的行號（升序）：各層裡的子節點按行號排，畫的先後與構建順序無關。 */
    const views: Array<LineView | null> = new Array<LineView | null>(lineCount).fill(null);
    const built: number[] = [];
    const buildContext = {
        pixi,
        font: options.font,
        weight: options.weight,
        resolution: options.resolution,
        heroPx,
        spacing,
        seed: options.seed,
        sprites,
        measurer,
        limits: { horizontal: maxWidthOf('horizontal'), vertical: columnCap },
        keywords: KEYWORDS,
        driftSpeed: DRIFT_SPEED,
        placementsOf: (lineIndex: number) => freePlacements(createRng(`${options.seed}:placements:${lineIndex}`), region, nextAlpha),
    };
    let tintedFor: Rgb | null = null;
    /** 把 child 插到 parent 裡行號 lineIndex 該在的位置（parent 裡每個已構建的行各有一個子節點）。 */
    const insertByLine = (parent: Container, child: Container, position: number) => {
        if (position >= parent.children.length) parent.addChild(child);
        else parent.addChildAt(child, position);
    };
    /** 構建第 index 行：隨機流跳到這一行的起點，結果與從第一行起順序構建時一樣。 */
    const buildLine = (index: number): LineView => {
        const meta = metas[index]!;
        const lineView = buildLineView(buildContext, index, meta, createRngAt(`${options.seed}:window`, meta.randomOffset));
        let position = 0;
        while (position < built.length && built[position]! < index) position += 1;
        built.splice(position, 0, index);
        insertByLine(glyphLayer, lineView.holder, position);
        insertByLine(halos, lineView.haloLayer, position);
        insertByLine(stars, lineView.starLayer, position);
        insertByLine(spots, lineView.spot, position);
        if (tintedFor) for (const glyph of lineView.keywordGlyphs) glyph.tints = keywordTints(tintedFor, glyph.keyword!);
        views[index] = lineView;
        return lineView;
    };
    const releaseLine = (index: number) => {
        const lineView = views[index];
        if (!lineView) return;
        views[index] = null;
        built.splice(built.indexOf(index), 1);
        for (const item of [lineView.holder, lineView.haloLayer, lineView.starLayer, lineView.spot]) {
            item.parent?.removeChild(item);
            item.destroy({ children: true });
        }
        lineView.layout.destroy();
    };
    const lineOf = (index: number): LineView => views[index] ?? buildLine(index);

    const fontH = heroPx / height;
    const driftScale = options.drift ?? 1;
    /** 第 c 行成為當前行時的排版（c = −1 即第一行之前，按第一行的排版）。 */
    const typographyAt = (c: number): WindowTypography => (
        options.typographyOf ? options.typographyOf(Math.max(0, Math.min(lineCount - 1, c))) : typography
    );

    /**
     * 第 index 行在槽位縮放 scale、朝向 orient 下落定的樣子：單行縮到 SINGLE_MIN_FIT 還放不下才折，
     * 折了還放不下再整體縮小（鄰行本身已經小，很少需要折）。
     */
    const settle = (index: number, kind: WindowTypography, orient: 0 | 1, scale: number) => {
        const flow = lineOf(index).flow[orient];
        const budget = orient === 1 ? columnCap : maxWidthOf(kind);
        const wrap = shouldWrap(flow, budget, scale) ? 1 : 0;
        const variant: LineVariant = flow[wrap];
        return { wrap, variant, scale: scale * fitScale(variant.along, budget, scale) };
    };
    /** 第 index 行垂直於行方向的厚度（高度單位，已縮放）；不存在的行（第一行之前）按一個字號。 */
    const acrossOf = (index: number, kind: WindowTypography, orient: 0 | 1, scale: number) => {
        if (index < 0 || index >= lineCount) return fontH * scale;
        const settled = settle(index, kind, orient, scale);
        return (settled.variant.across / height) * settled.scale;
    };
    /** 把當前行整塊放進畫框的偏移（高度單位）：整個窗口一起挪，行距不變。文字區的中心仍是錨點。 */
    const windowShift = (current: number, kind: WindowTypography): Point => {
        if (current < 0 || current >= lineCount) return { x: 0, y: 0 };
        const orient = kind === 'vertical' ? 1 : 0;
        const { variant, scale } = settle(current, kind, orient, 1);
        const w = (variant.inkWidth / height) * scale;
        const h = (variant.inkHeight / height) * scale;
        return {
            x: clampInto(region.cx, w, band.left, band.right) - region.cx,
            y: clampInto(region.cy, h, band.top, band.bottom) - region.cy,
        };
    };

    // 槽位是（行、當前行、排版）的純函數，每幀會反覆查（徑跡還要回溯幾十個時刻），緩存起來。
    const slotCache = new Map<string, Slot>();
    /** 當前行為 current、排版為 kind 時第 index 行的槽位（含把當前行放進畫框的整體偏移與這一行的折行）。 */
    const slotOf = (index: number, current: number, kind: WindowTypography): Slot => {
        const key = `${index}|${current}|${kind}`;
        const cached = slotCache.get(key);
        if (cached) return cached;
        const view = lineOf(index);
        const clamped = Math.max(-2, Math.min(2, index - current));
        const shift = windowShift(current, kind);
        let slot: Slot;
        let wrap: number | null = null;
        if (kind === 'crossed' && clamped !== 0) {
            // 縱橫交錯：自由落點在當前行的上半圈 / 下半圈，但要讓開當前行（折成兩行時更高）：鄰行整塊的上下邊
            // 與當前行之間至少留一段空隙。豎著的鄰行很長，當前行與畫框之間放不下時先折成兩列，還放不下再縮小。
            const base = view.placements.get(clamped)!;
            const baseOrient = base.orient >= 0.5 ? 1 : 0;
            const sign = base.dy < 0 ? -1 : 1;
            const currentHalf = current >= 0 && current < lineCount
                ? (() => {
                    const settled = settle(current, kind, 0, 1);
                    return (settled.variant.inkHeight / height) * settled.scale / 2;
                })()
                : fontH / 2;
            const gap = fontH * CROSSED_CLEARANCE;
            const centerY = region.cy + shift.y;
            const room = sign < 0 ? centerY - currentHalf - gap - band.top : band.bottom - (centerY + currentHalf + gap);
            const flow = view.flow[baseOrient];
            const budget = baseOrient === 1 ? columnCap : maxWidthOf(kind);
            /** 在縮放 s、折法 w 下這一行整塊（含落點的傾斜）的高度（高度單位）。 */
            const tilt = Math.abs(base.rotation) + 0.03;
            const heightOf = (w: 0 | 1, s: number) => (
                ((flow[w].inkHeight * Math.cos(tilt) + flow[w].inkWidth * Math.sin(tilt)) / height) * s * fitScale(flow[w].along, budget, s)
            );
            let scale = base.scale;
            let w: 0 | 1 = settle(index, kind, baseOrient, scale).wrap ? 1 : 0;
            if (baseOrient === 1 && room > 0) {
                if (w === 0 && flow[1].lines > 1 && heightOf(0, scale) > room) w = 1;
                const tall = heightOf(w, scale);
                if (tall > room) scale = Math.max(base.scale * 0.5, scale * (room / tall));
            }
            wrap = w;
            const clearance = currentHalf + gap + heightOf(w, scale) / 2;
            const dy = sign * Math.max(Math.abs(base.dy), clearance);
            // 豎著的鄰行折成兩列時更寬，沿原來的方向再推開多出來的那一半。
            const wider = baseOrient === 1 ? Math.max(0, acrossOf(index, kind, 1, scale) - fontH * scale) / 2 : 0;
            slot = { ...base, scale, dy, dx: base.dx + Math.sign(base.dx) * wider };
        } else {
            const orient = kind === 'vertical' ? 1 : 0;
            slot = fixedSlot(kind === 'crossed' ? 'horizontal' : kind, clamped, region, fontH, nextAlpha, (offset, scale) => (
                acrossOf(offset === clamped ? index : current + offset, kind, orient, scale)
            ));
        }
        const result: Slot = {
            ...slot,
            dx: slot.dx + shift.x,
            dy: slot.dy + shift.y,
            wrap: wrap ?? settle(index, kind, slot.orient >= 0.5 ? 1 : 0, slot.scale).wrap,
        };
        slotCache.set(key, result);
        return result;
    };

    /**
     * 時刻 time 起還沒「走完多時」的第一次換行（current + 1 = 全都走完了）：更早的換行對每一行都已滑完、徑跡也已收攏
     * （按最晚的起步 SLIDE_LAG 估，保守）。行的開始時刻是升序的，從當前行往回找幾步就到。
     */
    const firstLiveChange = (time: number, current: number) => {
        let c = current;
        while (c >= 0 && options.lines[c]!.startTime - LEAD + MAX_LAG + SLIDE + TRACK_TIME > time) c -= 1;
        return c + 1;
    };

    /**
     * 第 index 行在時刻 time 的位置（邏輯像素）、縮放、轉角、透明度與槽位切換信息。純函數，徑跡與爆閃也用它。
     *
     * 疊加式：位置 = 第一行開始前的槽位 + Σ 每次換行帶來的槽位差 × 這次換行對這一行的緩動進度。
     * 每次換行對各行錯開起步（離場的先走），兩行間隔很短、上一次還沒走完時也連續，不會跳。
     * 已經走完多時的換行進度都是 1，前後相消（槽位差首尾相接），所以直接從它們之後的槽位起疊：
     * 與從頭疊加結果相同，只用到當前行附近幾行的排版（整首歌一個單元時不用構建前面所有的行）。
     */
    const lineTransform = (index: number, time: number): LineTransform => {
        const view = lineOf(index);
        const { current } = resolveWindowCursor(options.lines, time);
        const first = firstLiveChange(time, current);
        const base = first - 1;
        const initialKind = typographyAt(base);
        const initial = slotOf(index, base, initialKind);
        let dx = initial.dx, dy = initial.dy, scale = initial.scale, rotation = initial.rotation;
        let alpha = initial.alpha, orient = initial.orient, wrap = initial.wrap;
        // 最近一次正在（或剛剛）作用於這一行的換行：給字的飛行曲線與徑跡用。
        let latest: { before: Slot; after: Slot; phase: number; start: number; kind: WindowTypography } | null = null;
        let restOrient = initial.orient;
        let restWrap = initial.wrap;
        const moves: LineTransform['moves'] = [];
        // 隨排版變化的量（寬度上限、錯落）也跟著換行疊加，排版切換時不跳。
        let widthCap = maxWidthOf(initialKind);
        let jitterOn = initialKind === 'crossed' ? 0 : 1;
        // 間隙：背離當前行的方向（x、y 各一份，堆疊軸上的 ±1 × 作為鄰行的權重）與作為當前行的權重，
        // 同樣按換行疊加，換行與排版切換時連續。
        let awayX = stackX(initialKind) * awayOf(index, base, initialKind);
        let awayY = (1 - stackX(initialKind)) * awayOf(index, base, initialKind);
        let hero = index === base ? 1 : 0;
        // 槽位差為 0 的換行直接跳過。
        const last = Math.min(lineCount - 1, current);
        for (let c = first; c <= last; c += 1) {
            const beforeKind = typographyAt(c - 1);
            const afterKind = typographyAt(c);
            const before = slotOf(index, c - 1, beforeKind);
            const after = slotOf(index, c, afterKind);
            const kindChanged = beforeKind !== afterKind;
            if (sameSlot(before, after) && !kindChanged) continue;
            const { phase, start } = resolveLinePhase(options.lines, c, index - c, time);
            const k = easeInOutSine(phase);
            if (kindChanged) {
                widthCap += (maxWidthOf(afterKind) - maxWidthOf(beforeKind)) * k;
                jitterOn += ((afterKind === 'crossed' ? 0 : 1) - (beforeKind === 'crossed' ? 0 : 1)) * k;
            }
            const awayBefore = awayOf(index, c - 1, beforeKind);
            const awayAfter = awayOf(index, c, afterKind);
            awayX += (stackX(afterKind) * awayAfter - stackX(beforeKind) * awayBefore) * k;
            awayY += ((1 - stackX(afterKind)) * awayAfter - (1 - stackX(beforeKind)) * awayBefore) * k;
            hero += ((index === c ? 1 : 0) - (index === c - 1 ? 1 : 0)) * k;
            // 透明度不跟位移同一條曲線：要淡出的先走（前 60%），要淡入的後到（後 60%）。
            const fade = after.alpha < before.alpha
                ? easeInOutCubic(phase / 0.6)
                : after.alpha > before.alpha ? easeInOutCubic((phase - 0.4) / 0.6) : k;
            dx += (after.dx - before.dx) * k;
            dy += (after.dy - before.dy) * k;
            scale += (after.scale - before.scale) * k;
            rotation += (after.rotation - before.rotation) * k;
            alpha += (after.alpha - before.alpha) * fade;
            orient += (after.orient - before.orient) * phase;
            wrap += (after.wrap - before.wrap) * k;
            if (phase > 0) latest = { before, after, phase, start, kind: afterKind };
            if (phase >= 1) {
                restOrient = after.orient;
                restWrap = after.wrap;
                moves.length = 0;
            } else if (phase > 0) {
                moves.push({
                    toOrient: after.orient,
                    toWrap: after.wrap,
                    phase,
                    fly: options.alwaysFly === true || afterKind === 'crossed' || before.orient !== after.orient,
                });
            }
        }
        // 太長時整體縮小，不出畫框（橫排看寬度、豎排看長度；單行 / 折行按折行程度混合）。
        const o = clamp01(orient);
        const w = clamp01(wrap);
        const [hSingle, hWrapped] = view.flow[0];
        const [vSingle, vWrapped] = view.flow[1];
        const fitH = lerp(fitScale(hSingle.along, widthCap, scale), fitScale(hWrapped.along, widthCap, scale), w);
        const fitV = lerp(fitScale(vSingle.along, columnCap, scale), fitScale(vWrapped.along, columnCap, scale), w);
        const fitted = scale * lerp(fitH, fitV, o);
        // 錯落只作用在固定槽位的鄰行上（橫排時橫向、豎排時縱向），當前行居中。
        const jitter = jitterOn * view.jitter * region.w * clamp01((1 - scale) / 0.5);
        // 固定槽位裡每一行沿自己的方向不出畫框（橫排左右、豎排上下）：鄰行排在垂直於行的方向上，挪了也壓不到
        // 當前行。縱橫交錯的鄰行是自由落點，沿行挪可能挪進當前行裡，保持原樣（和錯落一樣只作用在固定槽位上）。
        // 漂移不算在裡面，照常漂。
        const baseX = region.cx + dx + jitter * (1 - orient);
        const baseY = region.cy + dy + jitter * 0.5 * orient;
        const alongH = (lerp(hSingle.inkWidth, hWrapped.inkWidth, w) / height) * fitted;
        const alongV = (lerp(vSingle.inkHeight, vWrapped.inkHeight, w) / height) * fitted;
        const x = baseX + (clampInto(baseX, alongH, band.left, band.right) - baseX) * (1 - o) * jitterOn;
        const y = baseY + (clampInto(baseY, alongV, band.top, band.bottom) - baseY) * o * jitterOn;
        // 永不停止的漂移：以這一行開始唱的時刻為零點勻速漂（唱的時候正好在槽位上），再疊一點繞行、擺動與呼吸。
        // 讓開當前行（lineClearance）：鄰行朝當前行的那一份翻成背離；當前行不越漂越遠，繞一個小圓，速度不變。
        const age = time - view.line.startTime;
        const m = view.motionPhase;
        const { x: vx, y: vy } = view.velocity;
        const orbitX = Math.sin(time * 0.52 + m) * ORBIT;
        const orbitY = Math.cos(time * 0.41 + m * 1.3) * ORBIT * 0.7;
        const held = clamp01(hero);
        const driftX = lerp(awayDrift((vx * age + orbitX) * driftScale, awayX), (heldDrift(vx, vy, age, 0) + orbitX) * driftScale, held);
        const driftY = lerp(awayDrift((vy * age + orbitY) * driftScale, awayY), (heldDrift(vx, vy, age, 1) + orbitY) * driftScale, held);
        const settledOrient = latest ? latest.after.orient : initial.orient;
        const settledWrap = latest ? latest.after.wrap : initial.wrap;
        return {
            current,
            x: (x + driftX) * height,
            y: (y + driftY) * height,
            scale: fitted * (1 + 0.025 * Math.sin(time * 0.43 + m)),
            rotation: rotation + 0.03 * Math.sin(time * 0.23 + m * 0.7),
            alpha: clamp01(alpha),
            fromOrient: latest ? latest.before.orient : settledOrient,
            toOrient: settledOrient,
            fromWrap: latest ? latest.before.wrap : settledWrap,
            toWrap: settledWrap,
            wrap: w,
            orient: o,
            phase: latest ? latest.phase : 1,
            // 縱橫交錯時每次換槽位都飛；另兩種排版只在朝向變化時飛。
            fly: latest !== null && latest.phase < 1
                && (options.alwaysFly === true || latest.kind === 'crossed' || latest.before.orient !== latest.after.orient),
            slideStart: latest ? latest.start : Number.NEGATIVE_INFINITY,
            restOrient,
            restWrap,
            moves,
        };
    };

    /**
     * 字在行內的位置（未縮放）、轉角與縮放：換槽位時沿自己的貝塞爾曲線飛過去，途中縮小、轉動、發亮
     * （flying 為飛行強度 0..1）。再加上聚合、崩解與呼吸。
     */
    const glyphLocal = (view: LineView, glyph: GlyphView, time: number, transform: LineTransform) => {
        const at = (orient: number, wrap: number) => view.flow[orient >= 0.5 ? 1 : 0][wrap >= 0.5 ? 1 : 0].points[glyph.index]!;
        // 從上一次走完的換位的終點出發，依次疊上還在進行的換位：每一次都從上一次此刻的位置起飛（或滑過去），
        // 前一次還沒飛完就換行時，字接著從它在曲線上的位置出發，不會跳回起點。
        let point = at(transform.restOrient, transform.restWrap);
        let orientation = transform.restOrient;
        let flying = 0;
        for (const move of transform.moves) {
            const target = at(move.toOrient, move.toWrap);
            if (move.fly) {
                const s = flightProgress(glyph.flight, move.phase);
                point = flightPoint(glyph.flight, point, target, s);
                orientation = lerp(orientation, move.toOrient, s);
                flying = Math.max(flying, Math.sin(Math.PI * s));
            } else {
                // 不飛的時候，單行與折行之間（鄰行變成當前行、需要折開時）字隨滑動緩動過去。
                const k = easeInOutSine(move.phase);
                point = lerpPoint(point, target, k);
                orientation = lerp(orientation, move.toOrient, k);
            }
        }
        let x = point.x;
        let y = point.y;
        let rotation = glyph.vRotation * orientation + glyph.flight.spin * flying;
        const pulse = 1 - 0.28 * flying;
        // 聚合：未唱的行從散開的位置逐漸收攏。
        const gather = smooth((time - (view.line.startTime - LEAD - GATHER_LEAD)) / GATHER);
        const scatter = (1 - gather) ** 2 * decay.strength;
        x += glyph.scatter.x * heroPx * scatter;
        y += glyph.scatter.y * heroPx * scatter;
        // 崩解：點亮一會兒之後沿各自的方向漂離、轉動。
        const amount = decayAmount(decay, glyph.timing.start, time) * glyph.drift.speed;
        x += glyph.drift.dx * heroPx * amount;
        y += glyph.drift.dy * heroPx * amount;
        rotation += glyph.drift.spin * amount * 0.18;
        // 呼吸：一直有一點輕微晃動。
        const breath = heroPx * 0.022 * Math.min(1, decay.strength + 0.3);
        x += Math.sin(time * 0.9 + glyph.phase) * breath;
        y += Math.cos(time * 1.13 + glyph.phase * 1.7) * breath;
        return { x, y, rotation, gather, flying, scale: glyph.scale * pulse };
    };

    /** 行內座標 → 畫面座標（行的轉角、縮放、位置）。 */
    const toWorld = (transform: LineTransform, point: Point): Point => {
        const cos = Math.cos(transform.rotation);
        const sin = Math.sin(transform.rotation);
        return {
            x: transform.x + (point.x * cos - point.y * sin) * transform.scale,
            y: transform.y + (point.x * sin + point.y * cos) * transform.scale,
        };
    };

    /**
     * 徑跡：字在畫面上過去 TRACK_TIME 秒裡真正走過的路（疊加了行本身的移動、轉動與縮放），加一點
     * 垂直方向的抖動，像雲室裡的粒子徑跡；字到位後尾端追上來，徑跡收攏消失。只畫這一次滑動開始之後的部分。
     */
    const drawTracks = (index: number, view: LineView, time: number, transform: LineTransform, alpha: number, color: number) => {
        if (alpha <= 0.003 || !Number.isFinite(transform.slideStart)) return;
        if (time > transform.slideStart + SLIDE + TRACK_TIME) return;
        const from = Math.max(transform.slideStart, time - TRACK_TIME);
        if (time - from < 1e-3) return;
        const samples = Array.from({ length: TRACK_SAMPLES + 1 }, (_, i) => from + ((time - from) * i) / TRACK_SAMPLES);
        const transforms = samples.map(sample => lineTransform(index, sample));
        if (!transforms.some(sample => sample.fly)) return;
        const width = 1.2;
        view.glyphs.forEach(glyph => {
            if (glyph.blank) return;
            let length = 0;
            let previous: Point | null = null;
            let fontPx = heroPx;
            let flying = 0;
            samples.forEach((sample, i) => {
                const local = glyphLocal(view, glyph, sample, transforms[i]!);
                const world = toWorld(transforms[i]!, local);
                fontPx = heroPx * transforms[i]!.scale * local.scale;
                flying = local.flying;
                const wobble = Math.sin(i * 0.9 + glyph.flight.wobble + sample * 6) * heroPx * 0.02;
                const x = world.x + wobble;
                const y = world.y - wobble * 0.6;
                if (previous) {
                    length += Math.hypot(x - previous.x, y - previous.y);
                    trackLayer.lineTo(x, y);
                } else {
                    trackLayer.moveTo(x, y);
                }
                previous = { x, y };
            });
            // 徑跡越長（字飛得越快）越亮；幾乎不動的字不留徑跡。字頭落在當前行的保護框裡時，整條徑跡跟字一起壓暗
            // （與字身同一條規則，飛行途中不壓）。
            const strength = Math.min(1, length / (heroPx * 3));
            const head = previous as Point | null;
            const shield = head && protectCount > 0
                ? protectedAlpha(protectionAt(protectBoxes, protectCount, index, head.x, head.y, fontPx / 2) * (1 - flying))
                : 1;
            trackLayer.stroke({ width, color, alpha: strength > 0.05 ? alpha * 0.55 * strength * shield : 0, cap: 'round', join: 'round' });
        });
    };

    /** 關鍵字在當前光色下的顏色：光色不變時（通常整個單元都不變）只算一次；之後新建的行在構建時按它上色。 */
    const refreshKeywordTints = (litColor: Rgb) => {
        if (tintedFor && tintedFor[0] === litColor[0] && tintedFor[1] === litColor[1] && tintedFor[2] === litColor[2]) return;
        tintedFor = [litColor[0], litColor[1], litColor[2]];
        for (const index of built) {
            for (const glyph of views[index]!.keywordGlyphs) glyph.tints = keywordTints(litColor, glyph.keyword!);
        }
    };

    // 當前行的保護框：每幀最多幾個（換行交接時新舊當前行各一個，兩次換行捱得很近時再多一兩個），預先建好反覆用。
    const protectBoxes = [createProtectBox(), createProtectBox(), createProtectBox(), createProtectBox()];
    let protectCount = 0;
    const frameTransforms: LineTransform[] = new Array<LineTransform>(lineCount);

    /**
     * 這一幀的保護框：第 j 行作為當前行的權重 = 它這次換行的緩動進度 − 下一次換行的緩動進度（換行進度都是 t 的
     * 連續函數，所以權重也連續，求和為 1）。框是第 j 行此刻的墨跡框（橫豎 × 單行 / 折行按當前的朝向與折行程度混合），
     * 跟著它的位置、縮放與轉角。橫豎轉到一半時（字在飛、混合出來的框又寬又高，框邊掃得很快）框漸隱，轉完再回來。
     * 要先算好這一幀所有行的變換（frameTransforms）。
     */
    const buildProtectBoxes = (time: number, current: number, low: number) => {
        protectCount = 0;
        let later = 0;
        for (let j = current; j >= low && protectCount < protectBoxes.length; j -= 1) {
            const eased = easeInOutSine((time - (options.lines[j]!.startTime - LEAD)) / SLIDE);
            const transform = frameTransforms[j]!;
            const o = clamp01(transform.orient);
            const weight = (eased - later) * clamp01(transform.alpha) * (1 - 4 * o * (1 - o));
            later = eased;
            if (weight > 1e-4) {
                const [hSingle, hWrapped] = lineOf(j).flow[0];
                const [vSingle, vWrapped] = lineOf(j).flow[1];
                const w = transform.wrap;
                const inkW = lerp(lerp(hSingle.inkWidth, hWrapped.inkWidth, w), lerp(vSingle.inkWidth, vWrapped.inkWidth, w), transform.orient);
                const inkH = lerp(lerp(hSingle.inkHeight, hWrapped.inkHeight, w), lerp(vSingle.inkHeight, vWrapped.inkHeight, w), transform.orient);
                const box = protectBoxes[protectCount]!;
                box.line = j;
                box.x = transform.x;
                box.y = transform.y;
                box.cos = Math.cos(transform.rotation);
                box.sin = Math.sin(transform.rotation);
                box.halfW = (inkW / 2) * transform.scale;
                box.halfH = (inkH / 2) * transform.scale;
                box.margin = PROTECT_MARGIN * heroPx * transform.scale;
                box.weight = weight;
                protectCount += 1;
            }
            if (eased >= 1) break;
        }
    };

    /**
     * 這一幀要畫的行：當前行前後各 WINDOW_REACH 行，還在滑動（或徑跡還沒收攏）的換行再往前 WINDOW_REACH 行——
     * 槽位要看當前行 ±2 行的排版，更遠的行透明度都是 0。只由時刻決定。
     */
    const activeRange = (time: number) => {
        const { current } = resolveWindowCursor(options.lines, time);
        const first = firstLiveChange(time, current);
        return {
            current,
            low: Math.max(0, Math.min(current, first) - WINDOW_REACH),
            high: Math.min(lineCount - 1, Math.max(current, 0) + WINDOW_REACH),
        };
    };
    /** 窗口外的行藏起來，離得更遠的釋放（留一點餘量，來回拖動進度時不反覆重建）。 */
    const syncBuilt = (low: number, high: number) => {
        for (let k = built.length - 1; k >= 0; k -= 1) {
            const index = built[k]!;
            if (index >= low && index <= high) continue;
            if (index < low - KEEP_MARGIN || index > high + KEEP_MARGIN) {
                releaseLine(index);
                continue;
            }
            const lineView = views[index]!;
            lineView.holder.visible = false;
            lineView.haloLayer.visible = false;
            lineView.starLayer.visible = false;
            lineView.spot.visible = false;
        }
    };
    /** 往後預先建幾行（每幀最多一行），當前行換過去時不用當場構建。 */
    const prebuild = (high: number) => {
        for (let index = high + 1; index <= Math.min(lineCount - 1, high + PREBUILD); index += 1) {
            if (views[index]) continue;
            buildLine(index);
            const lineView = views[index]!;
            lineView.holder.visible = false;
            lineView.haloLayer.visible = false;
            lineView.starLayer.visible = false;
            lineView.spot.visible = false;
            return;
        }
    };

    const update = (frame: LyricWindowFrame) => {
        const { time, beams, litColor, unlitColor, unlitAlpha, intensity } = frame;
        trackLayer.visible = frame.hideTrails !== true;
        trackLayer.clear();
        if (KEYWORDS) refreshKeywordTints(litColor);
        const litHex = hexOf(litColor);
        const starHex = hexOf(mixRgb(litColor, WHITE, 0.5));
        const { low, high, current: cursor } = activeRange(time);
        syncBuilt(low, high);
        for (let index = low; index <= high; index += 1) frameTransforms[index] = lineTransform(index, time);
        buildProtectBoxes(time, cursor, low);

        for (let index = low; index <= high; index += 1) {
            const view = views[index]!;
            const transform = frameTransforms[index]!;
            const { current, scale } = transform;
            const lineAlpha = transform.alpha * intensity;
            const visible = lineAlpha > 0.003;
            view.holder.visible = visible;
            view.haloLayer.visible = visible;
            view.starLayer.visible = visible;
            view.holder.position.set(transform.x, transform.y);
            view.holder.scale.set(scale);
            view.holder.rotation = transform.rotation;
            const passed = index < current || (index === current && time > view.line.endTime);
            const passedAge = passed ? time - view.line.endTime : 0;
            const passedDim = passed ? lerp(1, 0.75, clamp01(passedAge / 2.5)) : 1;
            const lineFontPx = heroPx * scale;
            if (trackLayer.visible) drawTracks(index, view, time, transform, lineAlpha * passedDim, litHex);

            for (const glyph of view.glyphs) {
                if (glyph.blank) continue;
                if (!visible) {
                    glyph.glyph.visible = false;
                    glyph.halo.visible = false;
                    glyph.star.visible = false;
                    continue;
                }
                const local = glyphLocal(view, glyph, time, transform);
                glyph.glyph.position.set(local.x, local.y);
                glyph.glyph.rotation = local.rotation;
                glyph.glyph.scale.set(local.scale / MAX_WORD_SCALE);
                // 這個字實際的字號（光暈、閃點按它定大小）。
                const fontPx = lineFontPx * local.scale;
                const { x: gx, y: gy } = toWorld(transform, local);
                const lit = smooth((time - glyph.timing.start) / Math.max(glyph.timing.end - glyph.timing.start, LIGHT_UP));
                const flash = flashEnvelope(glyph.timing, time, 0.45);
                const illumination = compressLight(lightAt(beams, gx / height, gy / height));
                // 閃點主要由星形小亮點表現，字身只略微提亮：字身一旦接近白色，文字組的強 bloom 會把筆畫糊在一起。
                const heat = clamp01(illumination * 1.3 + flash * 0.2);
                // 崩解得越遠越淡，像散進煙裡。
                const dissolve = 1 - clamp01((decayAmount(decay, glyph.timing.start, time) * glyph.drift.speed - DISSOLVE_FROM) / DISSOLVE_SPAN);
                // 落進當前行的保護框就壓暗（字身、光暈、閃點一起），當前行始終清楚。飛行途中的字一閃而過、本來就在發亮，
                // 不壓（按飛行強度漸變）：否則它們高速穿過框邊時透明度會一幀一幀地陡變。
                const shield = protectCount > 0
                    ? protectedAlpha(protectionAt(protectBoxes, protectCount, index, gx, gy, fontPx / 2) * (1 - local.flying))
                    : 1;
                const glyphAlpha = lineAlpha * passedDim * dissolve * (0.35 + 0.65 * local.gather) * shield;

                glyph.glyph.visible = true;
                // 沒唱到的字也會被光柱照出來（冷色、半亮），唱到之後才是暖金色並帶輝光；飛行中的字像帶電粒子一樣發亮。
                const revealed = Math.min(1, unlitAlpha + illumination * 0.45 + local.flying * 0.4);
                glyph.glyph.alpha = glyphAlpha * (revealed * (1 - lit) + lit * Math.min(1, 0.55 + 0.4 * heat + 0.3 * local.flying));
                // 關鍵字：點亮後的字身、光暈、閃點換成關鍵字光色（未唱時仍是冷色）。
                const tints = glyph.tints;
                const hot = mixRgb(tints ? tints.glyph : litColor, WHITE, clamp01(0.08 * illumination + 0.1 * flash + 0.25 * local.flying));
                const cold = mixRgb(unlitColor, litColor, illumination * 0.35);
                glyph.glyph.tint = hexOf(mixRgb(cold, hot, lit));

                // bloom 已經很強，光暈與閃點只做「局部更亮」的那一點，不能疊成一團白。
                const haloAlpha = glyphAlpha * lit * (0.03 + 0.14 * illumination + 0.08 * flash) * (tints ? KEYWORD_HALO_GAIN : 1);
                glyph.halo.visible = haloAlpha > 0.003;
                if (glyph.halo.visible) {
                    glyph.halo.position.set(gx, gy);
                    const size = fontPx * (2.2 + 0.8 * illumination);
                    glyph.halo.width = size;
                    glyph.halo.height = size * 0.9;
                    glyph.halo.alpha = haloAlpha;
                    glyph.halo.tint = tints ? tints.halo : litHex;
                }

                const starAlpha = lineAlpha * flash * 0.55 * shield;
                glyph.star.visible = starAlpha > 0.003;
                if (glyph.star.visible) {
                    // 亮點避開筆畫中心，按種子上下錯落；閃的過程中略微轉動。
                    const star = glyph.starShape;
                    glyph.star.position.set(gx + fontPx * star.dx, gy + fontPx * star.dy);
                    glyph.star.rotation = star.rotation * (1 + (1 - flash) * 0.6);
                    const size = fontPx * star.size * (0.8 + 0.5 * flash);
                    glyph.star.width = size;
                    glyph.star.height = size;
                    glyph.star.alpha = starAlpha;
                    glyph.star.tint = tints ? tints.star : starHex;
                }
            }

            // 追字光斑：沿行內連續移動，並對過去 SPOT_WINDOW 秒的位置取平均（仍只由 t 決定），
            // 字與字之間的停頓、快慢變化都被抹平；唱前 0.3s 淡入，唱完 0.6s 淡出。
            const spotAlpha = visible
                ? lineAlpha * smooth((time - view.singStart + 0.3) / 0.3) * (1 - smooth((time - view.singEnd) / 0.6))
                : 0;
            view.spot.visible = spotAlpha > 0.003;
            if (view.spot.visible) {
                // 光斑沿行心線（橫排）或列心線（豎排）按閱讀順序走：折行時走完一行（一列）跳到下一行（下一列）的開頭，
                // 兩個座標用同一套插值，跳的那一下也被時間平均抹平。
                const vertical = transform.toOrient >= 0.5;
                const spotOf = (wrap: 0 | 1): Point => {
                    const path = view.flow[vertical ? 1 : 0][wrap].spots;
                    return {
                        x: resolveSpotX(view.glyphs.map(glyph => ({ timing: glyph.timing, center: path[glyph.index]!.x })), time),
                        y: resolveSpotX(view.glyphs.map(glyph => ({ timing: glyph.timing, center: path[glyph.index]!.y })), time),
                    };
                };
                const local = transform.wrap <= 0 ? spotOf(0) : transform.wrap >= 1 ? spotOf(1) : lerpPoint(spotOf(0), spotOf(1), transform.wrap);
                const position = toWorld(transform, local);
                const size = lineFontPx * 5;
                view.spot.position.set(position.x, position.y);
                view.spot.rotation = transform.rotation;
                view.spot.width = size * (vertical ? 1 : 1.6);
                view.spot.height = size * (vertical ? 1.6 : 1);
                view.spot.alpha = 0.07 * spotAlpha;
                view.spot.tint = litHex;
            }
        }
        prebuild(high);
    };

    return {
        view,
        update,
        glyphTimes: lineIndex => {
            const meta = metas[lineIndex];
            if (!meta) return [];
            return meta.graphemes.flatMap((char, glyphIndex) => (
                char.trim().length === 0 ? [] : [{ glyphIndex, start: (lineTimingOf(meta).timings[glyphIndex] ?? { start: meta.line.startTime }).start }]
            ));
        },
        glyphAnchor: (lineIndex, glyphIndex, time) => {
            const transform = lineTransform(lineIndex, time);
            const view = lineOf(lineIndex);
            const local = glyphLocal(view, view.glyphs[glyphIndex]!, time, transform);
            const world = toWorld(transform, local);
            return { x: world.x, y: world.y, fontPx: heroPx * transform.scale * local.scale };
        },
        lineAnchor: (lineIndex, time) => {
            const transform = lineTransform(lineIndex, time);
            return { x: transform.x, y: transform.y, scale: transform.scale, alpha: transform.alpha };
        },
        glyphKeyword: (lineIndex, glyphIndex) => {
            const meta = metas[lineIndex];
            if (!meta || (meta.graphemes[glyphIndex] ?? '').trim().length === 0) return null;
            return keywordColorsOf(meta, KEYWORDS)?.[glyphIndex] ?? null;
        },
        destroy: () => {
            for (let k = built.length - 1; k >= 0; k -= 1) releaseLine(built[k]!);
            // trackLayer 是自建 context 的 Graphics，帶 context: true 才會連 GPU 批數據一起放掉（見 lineArt 的 destroy）。
            view.destroy({ children: true, context: true });
        },
    };
};
