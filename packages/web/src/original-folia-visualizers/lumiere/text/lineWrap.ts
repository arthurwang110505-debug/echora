// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/text/lineWrap.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import { measureNaturalWidth, prepareWithSegments } from '@chenglou/pretext';
import { measureRichInlineStats, prepareRichInline, walkRichInlineLineRanges, type RichInlineItem, type RichInlineLineRange } from '@chenglou/pretext/rich-inline';
import { glyphFont } from './glyphLine';
import type { WordSpan } from './wordStyle';

// src/components/visualizer/lumiere/text/lineWrap.ts
// 歌詞窗口的折行：一行太長時先給它更大的地方（橫排用畫框內的整個寬度、豎排用畫框內的整個高度），再允許
// 輕微整體縮小（到 SINGLE_MIN_FIT），仍放不下才折成兩行 / 兩列（豎排右起），兩行 / 兩列之後才繼續整體縮小。
// 寬度全部用 pretext 量：每個詞是一個原子行內盒（break: 'never'），帶自己的字號與字距；斷行走 pretext 的
// rich-inline，行寬與詞的位置直接取它給出的 gapBefore / occupiedWidth。這裡只算數，不碰 Pixi。

interface Point {
    x: number;
    y: number;
}

/** 畫框（overlay 的四角括號）裡放字的範圍（高度單位，x 從左、y 從上）。 */
export interface FrameBand {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

/** 畫框四角括號的邊距（邏輯像素）：邊緣可能被運鏡推近、後處理的鏡頭畸變往外推，留足。overlay 也用它。 */
export const frameInsets = (width: number, height: number) => ({
    padX: Math.max(30, width * 0.065),
    padY: Math.max(30, height * 0.085),
});

/** 字離左右對位十字、上沿對焦虛線再留的距離（高度單位）。 */
const FRAME_CLEARANCE_X = 0.04;
const FRAME_CLEARANCE_TOP = 0.035;
/**
 * 底部給共享字幕（翻譯 / 下一句）讓出的高度（高度單位）：folia 的字幕層 bottom 約 112px（基線 32 + 淨空 80），
 * 再加一行字高，900px 高的窗口裡字幕上沿約在 0.83；再留 0.03 給行的漂移、繞行與運鏡推近。
 */
const SUBTITLE_CLEARANCE = 0.2;

export const frameBand = (width: number, height: number): FrameBand => {
    const { padX, padY } = frameInsets(width, height);
    const left = padX / height + FRAME_CLEARANCE_X;
    return {
        left,
        right: width / height - left,
        top: padY / height + FRAME_CLEARANCE_TOP,
        bottom: Math.max(padY / height + FRAME_CLEARANCE_TOP + 0.2, 1 - SUBTITLE_CLEARANCE),
    };
};

/** 單行（單列）最多整體縮小到這個比例；再小就折成兩行（兩列）。 */
export const SINGLE_MIN_FIT = 0.8;
/** 最多折成幾行 / 幾列。 */
export const MAX_LINES = 2;
/** 行距（橫排兩行的行心距）與列距（豎排兩列的列心距），以字號為單位。 */
export const ROW_PITCH = 1.6;
export const COLUMN_PITCH = 1.6;

/** pretext 測量：字體串與 glyphLine 畫字時同一個格式；每次建場景一個，按（字號、文字）緩存。 */
export interface TextMeasurer {
    font: (px: number) => string;
    /** 字距（邏輯像素）。 */
    spacing: (px: number) => number;
    /** 不折行的自然寬度（pretext 的算法：每個字後面都帶字距，含最後一個字，與畫布逐字寬度一致）。 */
    natural: (text: string, px: number) => number;
}

export const createTextMeasurer = (family: string, weight: number, letterSpacing: number): TextMeasurer => {
    const cache = new Map<string, number>();
    const font = (px: number) => glyphFont(weight, px, family);
    const spacing = (px: number) => letterSpacing * px;
    return {
        font,
        spacing,
        natural: (text, px) => {
            const key = `${px}|${text}`;
            let width = cache.get(key);
            if (width === undefined) {
                const ls = spacing(px);
                width = measureNaturalWidth(prepareWithSegments(text, font(px), ls === 0 ? undefined : { letterSpacing: ls }));
                cache.set(key, width);
            }
            return width;
        },
    };
};

export interface FlowGlyph {
    char: string;
    /** 所在詞的字號倍率。 */
    scale: number;
    /** 畫布量出的橫向寬度（已按字號倍率縮放）：只用來在一個詞裡分攤 pretext 量出的詞寬，給逐字定位。 */
    advance: number;
    /** 豎排時直立（中日韓字、全角符號），否則側轉 90°。 */
    upright: boolean;
    /** 詞的錯落（邏輯像素，橫排上下、豎排左右）。 */
    jag: number;
}

/** 一行在某種朝向、某種折法下的排版：每個字相對整塊中心的位置，追字光斑走的路，整塊的尺寸（邏輯像素，未縮放）。 */
export interface LineVariant {
    points: Point[];
    /** 追字光斑沿著走的點：行心線（橫排）或列心線（豎排）上，按閱讀順序。 */
    spots: Point[];
    /** 沿行方向的長度（最長一行 / 一列）與垂直於行方向的厚度。 */
    along: number;
    across: number;
    /** 幾行（幾列）。 */
    lines: number;
    /**
     * 字面實際佔的寬高（以整塊中心對稱取，邏輯像素）：含詞的字號差異與錯落，比 along / across 大一點。
     * 放進畫框時按它算；鄰行的間距仍按 across（單行時與原來的固定偏移一致）。
     */
    inkWidth: number;
    inkHeight: number;
}

/** 一行的四種排版：[朝向 0 橫 / 1 豎][0 單行 / 1 折行]。折不開（只有一個原子單位）時折行版與單行版相同。 */
export type LineFlow = [[LineVariant, LineVariant], [LineVariant, LineVariant]];

/** 斷行的原子單位：一個詞，帶上黏著它的標點；太長的詞拆成單字。 */
interface Unit {
    start: number;
    end: number;
    /** 決定字體的那段文字（詞本身，不含黏著的標點）與字號。 */
    text: string;
    px: number;
}

/** 前置標點黏後一個詞，其餘標點黏前一個詞。 */
const OPENING = /^[([{（【《「『〈〔［“‘]+$/u;

type Span = { start: number; end: number; kind: 'word' | 'punct' | 'space' };

/** 把分詞切成段：詞兩端的空白單獨成段（rich-inline 會把它們收成詞間距），沒被分詞覆蓋的字各成一段。 */
const spansOf = (glyphs: readonly FlowGlyph[], words: readonly WordSpan[]): Span[] => {
    const isSpace = (index: number) => glyphs[index]!.char.trim().length === 0;
    const ranges: Array<{ start: number; end: number; word: boolean }> = [];
    let cursor = 0;
    for (const word of words) {
        const start = Math.max(cursor, Math.min(glyphs.length, word.start));
        const end = Math.min(glyphs.length, word.end);
        for (let index = cursor; index < start; index += 1) ranges.push({ start: index, end: index + 1, word: false });
        if (end > start) ranges.push({ start, end, word: !word.blank });
        cursor = Math.max(cursor, end);
    }
    for (let index = cursor; index < glyphs.length; index += 1) ranges.push({ start: index, end: index + 1, word: false });
    const spans: Span[] = [];
    for (const range of ranges) {
        let { start, end } = range;
        const lead: Span[] = [];
        const tail: Span[] = [];
        while (start < end && isSpace(start)) lead.push({ start, end: ++start, kind: 'space' });
        while (end > start && isSpace(end - 1)) tail.unshift({ start: end - 1, end: end--, kind: 'space' });
        spans.push(...lead);
        if (end > start) spans.push({ start, end, kind: range.word ? 'word' : 'punct' });
        spans.push(...tail);
    }
    return spans;
};

const textOf = (glyphs: readonly FlowGlyph[], start: number, end: number) => glyphs.slice(start, end).map(glyph => glyph.char).join('');

/**
 * 斷行單位：詞黏上緊挨著的標點（中間沒有空白），標點不會落到行首或與它的詞分開。
 * 返回單位與夾在中間的空白段（給 rich-inline 當詞間距）。
 */
const unitsOf = (glyphs: readonly FlowGlyph[], spans: readonly Span[], heroPx: number) => {
    type Piece = { kind: 'unit'; unit: Unit } | { kind: 'space'; span: Span };
    const pieces: Piece[] = [];
    const pxOf = (index: number) => heroPx * glyphs[index]!.scale;
    let pendingOpen: Span | null = null;
    spans.forEach((span, index) => {
        if (span.kind === 'space') {
            if (pendingOpen) pieces.push({ kind: 'unit', unit: { start: pendingOpen.start, end: pendingOpen.end, text: textOf(glyphs, pendingOpen.start, pendingOpen.end), px: pxOf(pendingOpen.start) } });
            pendingOpen = null;
            pieces.push({ kind: 'space', span });
            return;
        }
        const previous = pieces[pieces.length - 1];
        const next = spans[index + 1];
        if (span.kind === 'punct') {
            const text = textOf(glyphs, span.start, span.end);
            if (OPENING.test(text) && next && next.kind !== 'space') {
                pendingOpen = pendingOpen ? { ...pendingOpen, end: span.end } : span;
                return;
            }
            if (!pendingOpen && previous?.kind === 'unit' && previous.unit.end === span.start) {
                previous.unit.end = span.end;
                return;
            }
        }
        const start = pendingOpen ? pendingOpen.start : span.start;
        pendingOpen = null;
        pieces.push({ kind: 'unit', unit: { start, end: span.end, text: textOf(glyphs, span.start, span.end), px: pxOf(span.start) } });
    });
    const open = pendingOpen as Span | null;
    if (open) pieces.push({ kind: 'unit', unit: { start: open.start, end: open.end, text: textOf(glyphs, open.start, open.end), px: pxOf(open.start) } });
    return pieces;
};

/**
 * 按行（列）排一行：units 的沿行長度來自 advances（逐字），rich-inline 斷行（extraWidth 把 pretext 自己量的
 * 寬度補成這裡的長度），maxWidth 為 Infinity 時不折行。返回每個字所在的行、在行內的起點偏移與每行長度。
 */
const breakLines = (
    measurer: TextMeasurer,
    glyphs: readonly FlowGlyph[],
    pieces: ReadonlyArray<{ kind: 'unit'; unit: Unit } | { kind: 'space'; span: Span }>,
    advances: readonly number[],
    heroPx: number,
    lines: number,
) => {
    const extentOf = (unit: Unit) => advances.slice(unit.start, unit.end).reduce((sum, advance) => sum + advance, 0);
    const items: RichInlineItem[] = [];
    const unitOfItem: Array<Unit | null> = [];
    let widest = 0;
    let widestGap = 0;
    for (const piece of pieces) {
        if (piece.kind === 'space') {
            const px = heroPx * glyphs[piece.span.start]!.scale;
            items.push({ text: textOf(glyphs, piece.span.start, piece.span.end), font: measurer.font(px), letterSpacing: measurer.spacing(px) });
            unitOfItem.push(null);
            // 詞間距（收攏後的一個空格）：pretext 單獨量空白是 0，用「a a」與「aa」之差。
            widestGap = Math.max(widestGap, measurer.natural('a a', px) - measurer.natural('aa', px));
            continue;
        }
        const { unit } = piece;
        const extent = extentOf(unit);
        items.push({
            text: unit.text,
            font: measurer.font(unit.px),
            letterSpacing: measurer.spacing(unit.px),
            break: 'never',
            extraWidth: extent - measurer.natural(unit.text, unit.px),
        });
        unitOfItem.push(unit);
        widest = Math.max(widest, extent);
    }
    const prepared = prepareRichInline(items);
    const walk = (maxWidth: number) => {
        const rows: RichInlineLineRange[] = [];
        walkRichInlineLineRanges(prepared, maxWidth, line => { rows.push(line); });
        return rows;
    };
    let rows = walk(Number.POSITIVE_INFINITY);
    if (lines > 1 && rows.length === 1 && rows[0]!.fragments.length > 1) {
        // 兩行均衡：目標行寬 = (總寬 + 最寬的詞) / 2 + 一個詞間距——貪心填第一行時它不會比第二行長出一個詞以上，
        // 剩下的也一定放得進第二行；pretext 確認只有兩行，否則放寬一次（詞間距的算法差異）。
        const total = rows[0]!.width;
        let target = (total + widest) / 2 + widestGap;
        if (measureRichInlineStats(prepared, target).lineCount > lines) target = total / 2 + widest + widestGap;
        rows = walk(target);
        if (rows.length > lines) {
            // 兜底：多出來的行並進最後一行（不會發生在正常的詞寬上）。
            const kept = rows.slice(0, lines - 1);
            const rest = rows.slice(lines - 1);
            const fragments = rest.flatMap((row, index) => row.fragments.map((fragment, k) => (
                index > 0 && k === 0 ? { ...fragment, gapBefore: widestGap } : fragment
            )));
            rows = [...kept, { fragments, width: fragments.reduce((sum, f) => sum + f.gapBefore + f.occupiedWidth, 0), end: rest[rest.length - 1]!.end }];
        }
    }

    const row = new Array<number>(glyphs.length).fill(-1);
    const offset = new Array<number>(glyphs.length).fill(0);
    const lengths = rows.map(line => line.width);
    rows.forEach((line, r) => {
        let cursor = 0;
        for (const fragment of line.fragments) {
            const unit = unitOfItem[fragment.itemIndex];
            const gapStart = cursor;
            cursor += fragment.gapBefore;
            if (!unit) continue;
            // 詞前面的空白字：落在詞間距中間（行首則落在行首）。
            for (let index = unit.start - 1; index >= 0 && row[index] === -1 && glyphs[index]!.char.trim().length === 0; index -= 1) {
                row[index] = r;
                offset[index] = gapStart + fragment.gapBefore / 2;
            }
            // 詞寬按逐字寬度分攤，字心落在各自那一份的中間。
            const extent = extentOf(unit);
            const ratio = extent > 0 ? fragment.occupiedWidth / extent : 0;
            let inner = cursor;
            for (let index = unit.start; index < unit.end; index += 1) {
                const advance = advances[index]! * ratio;
                row[index] = r;
                offset[index] = inner + advance / 2;
                inner += advance;
            }
            cursor += fragment.occupiedWidth;
        }
    });
    // 行尾、行首剩下的空白：跟著前一個字（沒有就後一個）。
    for (let index = 0; index < glyphs.length; index += 1) {
        if (row[index] !== -1) continue;
        const previous = index > 0 ? index - 1 : -1;
        if (previous >= 0 && row[previous] !== -1) {
            row[index] = row[previous]!;
            offset[index] = offset[previous]! + (advances[previous]! / 2);
        }
    }
    for (let index = glyphs.length - 1; index >= 0; index -= 1) {
        if (row[index] !== -1) continue;
        row[index] = index + 1 < glyphs.length && row[index + 1] !== -1 ? row[index + 1]! : 0;
        offset[index] = index + 1 < glyphs.length ? Math.max(0, offset[index + 1]! - advances[index + 1]! / 2) : 0;
    }
    return { row, offset, lengths: lengths.length ? lengths : [0] };
};

/** 太長的單位（一個詞就超過行長上限）拆成單字，標點仍黏在前一個字上。 */
const splitLongUnits = (
    glyphs: readonly FlowGlyph[],
    pieces: ReturnType<typeof unitsOf>,
    advances: readonly number[],
    limit: number,
    heroPx: number,
): ReturnType<typeof unitsOf> => pieces.flatMap(piece => {
    if (piece.kind === 'space') return [piece];
    const { unit } = piece;
    const extent = advances.slice(unit.start, unit.end).reduce((sum, advance) => sum + advance, 0);
    if (extent <= limit || unit.end - unit.start < 2) return [piece];
    const out: ReturnType<typeof unitsOf> = [];
    for (let index = unit.start; index < unit.end; index += 1) {
        const char = glyphs[index]!.char;
        const last = out[out.length - 1];
        if (last && last.kind === 'unit' && !/[\p{L}\p{N}]/u.test(char)) {
            last.unit.end = index + 1;
            continue;
        }
        out.push({ kind: 'unit', unit: { start: index, end: index + 1, text: char, px: heroPx * glyphs[index]!.scale } });
    }
    return out;
});

/**
 * 一行的四種排版（橫 / 豎 × 單行 / 兩行）。limits 為橫排行長、豎排列長的上限（邏輯像素）：只用來決定哪些詞
 * 長到必須拆字；要不要折行由歌詞窗口按槽位的縮放判斷（shouldWrap）。
 * 橫排：每行居中，行從上往下；豎排：列從右往左，各列居中對齊（列心在同一條橫線上，單列時就是原來的居中豎排）。
 */
export const flowLine = (
    measurer: TextMeasurer,
    glyphs: readonly FlowGlyph[],
    words: readonly WordSpan[],
    options: { heroPx: number; limits: { horizontal: number; vertical: number } },
): LineFlow => {
    const { heroPx } = options;
    const spans = spansOf(glyphs, words);
    const basePieces = unitsOf(glyphs, spans, heroPx);

    // 橫排逐字寬度：每段（詞 / 標點 / 空白）的 pretext 寬度按畫布寬度分攤到字上。
    const horizontal = new Array<number>(glyphs.length).fill(0);
    for (const span of spans) {
        const px = heroPx * glyphs[span.start]!.scale;
        const text = textOf(glyphs, span.start, span.end);
        const width = measurer.natural(text, px);
        const canvas = glyphs.slice(span.start, span.end).reduce((sum, glyph) => sum + glyph.advance, 0);
        for (let index = span.start; index < span.end; index += 1) {
            horizontal[index] = canvas > 0 ? (width * glyphs[index]!.advance) / canvas : width / (span.end - span.start);
        }
    }
    // 豎排逐字長度：直立的字佔一個字號（加字距），側轉的拉丁字母、數字佔它的橫排寬度。
    const vertical = glyphs.map((glyph, index) => (
        glyph.upright ? heroPx * glyph.scale * (1 + measurer.spacing(1)) : horizontal[index]!
    ));

    const variant = (orient: 0 | 1, lines: number): LineVariant => {
        const advances = orient === 0 ? horizontal : vertical;
        const pieces = splitLongUnits(glyphs, basePieces, advances, orient === 0 ? options.limits.horizontal : options.limits.vertical, heroPx);
        const { row, offset, lengths } = breakLines(measurer, glyphs, pieces, advances, heroPx, lines);
        const count = lengths.length;
        const along = Math.max(...lengths);
        const pitch = (orient === 0 ? ROW_PITCH : COLUMN_PITCH) * heroPx;
        const points: Point[] = [];
        const spots: Point[] = [];
        let inkX = 0;
        let inkY = 0;
        glyphs.forEach((glyph, index) => {
            const r = row[index]!;
            // 字面：橫排寬 = 逐字寬度、高 = 字號；豎排寬 = 字號（側轉的字也是）、高 = 逐字長度。
            const size = heroPx * glyph.scale;
            let point: Point;
            if (orient === 0) {
                const x = offset[index]! - lengths[r]! / 2;
                const rowY = (r - (count - 1) / 2) * pitch;
                point = { x, y: rowY + (1 - glyph.scale) * heroPx * 0.32 + glyph.jag };
                spots.push({ x, y: rowY });
                if (glyph.char.trim()) {
                    inkX = Math.max(inkX, Math.abs(point.x) + advances[index]! / 2);
                    inkY = Math.max(inkY, Math.abs(point.y) + size / 2);
                }
            } else {
                const columnX = ((count - 1) / 2 - r) * pitch;
                // 各列按自己的長度居中：列心都落在同一條橫線上（短的那列不貼頂）。
                const y = offset[index]! - lengths[r]! / 2;
                point = { x: columnX + glyph.jag * 0.8, y };
                spots.push({ x: columnX, y });
                if (glyph.char.trim()) {
                    inkX = Math.max(inkX, Math.abs(point.x) + size / 2);
                    inkY = Math.max(inkY, Math.abs(point.y) + advances[index]! / 2);
                }
            }
            points.push(point);
        });
        return { points, spots, along, across: (count - 1) * pitch + heroPx, lines: count, inkWidth: inkX * 2, inkHeight: inkY * 2 };
    };
    return [
        [variant(0, 1), variant(0, MAX_LINES)],
        [variant(1, 1), variant(1, MAX_LINES)],
    ];
};

/** 在縮放 scale 下，沿行長度 along 放進 budget 要再縮多少（不放大）。 */
export const fitScale = (along: number, budget: number, scale = 1) => Math.min(1, budget / Math.max(scale * along, 1e-6));

/** 這一行在縮放 scale 下要不要折：單行縮到 SINGLE_MIN_FIT 仍放不下，且折得開。 */
export const shouldWrap = (flow: readonly [LineVariant, LineVariant], budget: number, scale: number) => (
    flow[1].lines > 1 && scale * flow[0].along * SINGLE_MIN_FIT > budget
);

/** 把中心 center 放進 [lo, hi]：整塊長 extent，放不下時居中。 */
export const clampInto = (center: number, extent: number, lo: number, hi: number) => {
    if (extent >= hi - lo) return (lo + hi) / 2;
    return Math.min(hi - extent / 2, Math.max(lo + extent / 2, center));
};
