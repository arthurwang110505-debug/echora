// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/text/keywordColors.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { Theme } from '../../../types';
import { splitLyricGraphemes } from '../../../utils/lyrics/graphemeTiming';
import { parseColorChannels } from '../../colorMix';
import {
    buildWordColorRangesFromMatchers,
    prepareWordColorMatchers,
    resolveTokenColorMap,
    type WordColorMatcher,
} from '../../wordColoring';
import { hexOf, mixRgb, scaleRgb, WHITE, type Rgb } from '../color';

// src/components/visualizer/lumiere/text/keywordColors.ts
// 繪光的關鍵字著色：關鍵字與顏色是主題的 wordColors，匹配走 folia 共用的 wordColoring（中日韓按短語包含、
// 英文按詞，按字符區間落到字上，所以「花火」不會染到「火車」的「火」）。每行只在構建時匹配一次，得到逐字
// （grapheme）的關鍵字色；逐幀只做與光色的混合。
//
// 混合：關鍵字色與光色按比例混合，再把最亮的通道拉回光色的亮度——字仍是「被光照亮」的樣子，只是帶上了
// 關鍵字的色相；暗色的關鍵字（淺色主題常見）不會變成一塊灰。未點亮的字保持冷色，不參與。

/** 各處關鍵字色的佔比（其餘是光色）：字身、光暈、閃點、十字爆閃、背景碎片。 */
export const KEYWORD_MIX = {
    glyph: 0.6,
    halo: 0.75,
    star: 0.55,
    burst: 0.7,
    echo: 0.3,
} as const;
/** 閃點在關鍵字光色之上再摻多少白（普通字是 0.5）：閃光帶色，但仍是一顆亮星。 */
export const KEYWORD_STAR_WHITE = 0.35;
/** 關鍵字的光暈比普通字亮一點，顏色才看得出來。 */
export const KEYWORD_HALO_GAIN = 1.25;

export const prepareLumiereKeywords = (
    wordColors: Theme['wordColors'],
    enabled: boolean,
): WordColorMatcher[] => prepareWordColorMatchers(wordColors, enabled);

const parseRgb = (color: string): Rgb | null => {
    const channels = parseColorChannels(color);
    return channels ? [channels.r / 255, channels.g / 255, channels.b / 255] : null;
};

/**
 * 一行文字逐字（splitLyricGraphemes 的切法，與字形條一致）的關鍵字色；不是關鍵字的字為 null。
 * 沒有匹配器或沒有匹配時返回全 null 的數組。
 */
export const resolveGlyphKeywordColors = (text: string, matchers: readonly WordColorMatcher[]): Array<Rgb | null> => {
    const graphemes = splitLyricGraphemes(text);
    const colors: Array<Rgb | null> = graphemes.map(() => null);
    if (matchers.length === 0 || graphemes.length === 0) return colors;
    const ranges = buildWordColorRangesFromMatchers(text, [...matchers]);
    if (ranges.length === 0) return colors;
    let offset = 0;
    const tokens = graphemes.map((grapheme, index) => {
        const token = { key: String(index), timed: grapheme.trim().length > 0, startOffset: offset, endOffset: offset + grapheme.length };
        offset += grapheme.length;
        return token;
    });
    // 同一個顏色只解析一次，一行裡重複出現的關鍵字共用同一個數組。
    const parsed = new Map<string, Rgb | null>();
    resolveTokenColorMap(tokens, ranges).forEach((hex, key) => {
        if (!parsed.has(hex)) parsed.set(hex, parseRgb(hex));
        colors[Number(key)] = parsed.get(hex) ?? null;
    });
    return colors;
};

/**
 * 關鍵字色與光色按 amount 混合，最亮的通道拉回光色的亮度（保持發光觀感）。關鍵字色先提到滿亮度再混——
 * 只取它的色相與飽和度，不取明暗：淺色主題裡常見的深藍、深紅照樣能在光裡讀出顏色，不會被光色衝成白。
 */
export const keywordLight = (light: Rgb, keyword: Rgb, amount: number): Rgb => {
    const keywordPeak = Math.max(keyword[0], keyword[1], keyword[2]);
    const hue: Rgb = keywordPeak > 1e-4 ? scaleRgb(keyword, 1 / keywordPeak) : WHITE;
    const mixed = mixRgb(light, hue, amount);
    const peak = Math.max(mixed[0], mixed[1], mixed[2]);
    const target = Math.max(light[0], light[1], light[2]);
    return peak > 1e-4 ? scaleRgb(mixed, target / peak) : light;
};

/** 一個關鍵字在某個光色下的幾種顏色（字身、光暈、閃點），按光色緩存，逐幀直接取。 */
export interface KeywordTints {
    glyph: Rgb;
    halo: number;
    star: number;
}

export const keywordTints = (light: Rgb, keyword: Rgb): KeywordTints => ({
    glyph: keywordLight(light, keyword, KEYWORD_MIX.glyph),
    halo: hexOf(keywordLight(light, keyword, KEYWORD_MIX.halo)),
    star: hexOf(mixRgb(keywordLight(light, keyword, KEYWORD_MIX.star), WHITE, KEYWORD_STAR_WHITE)),
});

/** 十字爆閃落在關鍵字上：以關鍵字光色為主，保留一點光位的 tint。 */
export const keywordBurstColor = (burstColor: Rgb, light: Rgb, keyword: Rgb): Rgb => (
    mixRgb(burstColor, keywordLight(light, keyword, KEYWORD_MIX.burst), 0.8)
);

/** 背景碎片裡的關鍵字：只帶一點色。 */
export const keywordEchoColor = (light: Rgb, keyword: Rgb): Rgb => keywordLight(light, keyword, KEYWORD_MIX.echo);
