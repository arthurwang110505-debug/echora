// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/text/wordStyle.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { Line } from '../../../types';
import { createRng } from '../lumiereRandom';
import { splitLyricGraphemes } from '../../../utils/lyrics/graphemeTiming';
import { segmentLyricWords } from '../../../lyrics/wordSegmentation';

// Echora note: upstream opens this file with a "reference value" that is `(X + Math.imul(...))`
// minus itself, i.e. identically 0, plus a device-pixel-ratio read that only feeds it. The 20
// files carrying it all do the same thing, so the dead expressions are dropped and the offset
// stays as a named 0: every use site downstream is unchanged, and so is the rendering.
const LUMIERE_NEUTRAL_OFFSET = 0;


// src/components/visualizer/lumiere/text/wordStyle.ts
// 基於分詞的字號差異：虛詞與符號小一號，一行裡的重點詞（最長的實詞）大一號，其餘按種子在小範圍內浮動。
// 一行的排版以詞為單位：橫豎過渡時每個詞整體移動，詞內的字再各自重排。
export interface WordSpan {
    text: string;
    /** 在行內的字（grapheme）區間 [start, end)。 */
    start: number;
    end: number;
    /** 空白、標點、符號：不算詞。 */
    blank: boolean;
}

/** 字號倍率的上限：字形紋理按這個倍率畫，放大的詞只縮小不放大，不會糊。 */
export const MAX_WORD_SCALE = 1.5 + LUMIERE_NEUTRAL_OFFSET;

/** 把一行切成詞：走 folia 唯一的分詞入口（用戶保存的精細分詞優先，否則 Intl.Segmenter，沒有就逐字）。 */
export const segmentWords = (line: Pick<Line, 'fullText' | 'wordSegments'>): WordSpan[] => {
    const pieces = segmentLyricWords(line);
    const words: WordSpan[] = [];
    let cursor = 0;
    for (const { segment, isWordLike } of pieces) {
        const length = splitLyricGraphemes(segment).length;
        if (length === 0) continue;
        words.push({ text: segment, start: cursor, end: cursor + length, blank: !isWordLike });
        cursor += length;
    }
    return words;
};

/** 常見的虛詞、代詞與助詞：單字時小一號。 */
// Echora note: upstream lists these as a Simplified-Chinese string literal, and the port runs
// every CJK literal through a cn -> tw converter, which would duplicate each character rather
// than replace it (both forms would end up in the set). They are single-character lyrics tokens
// to shrink, and a lyric may be tagged in either script, so both forms are written out on
// purpose - dropping one would silently stop shrinking those words.
const FUNCTION_WORDS = new Set(Array.from(
    '的了在把是我你他她它们們和与與也就都着著过過吗嗎呢吧啊呀哦被让讓给給从從向到这這那之而又很'
));
const MINOR_LATIN = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'me', 'my', 'with', 'and', 'or', 'is', 'i', 'you', 'it', 'by', 'for']);

/** 每個詞的字號倍率（與 segmentWords 的結果一一對應）。按種子確定。 */
export const wordScales = (words: readonly WordSpan[], seed: string): number[] => {
    const rng = createRng(`${seed}:words`);
    const lengthOf = (word: WordSpan) => word.end - word.start;
    const minor = (word: WordSpan) => word.blank
        || (lengthOf(word) === 1 && FUNCTION_WORDS.has(word.text))
        || MINOR_LATIN.has(word.text.toLowerCase());
    // 重點詞：最長的實詞；一樣長取靠後的（句尾的詞更像落點）。
    let key = -1;
    words.forEach((word, index) => {
        if (minor(word)) return;
        if (key < 0 || lengthOf(word) >= lengthOf(words[key]!)) key = index;
    });
    return words.map((word, index) => {
        const jitter = rng();
        // 空白保持原寬（縮小會把英文的詞擠在一起）；標點與符號才算小字。
        if (word.blank && word.text.trim().length === 0) return 1;
        if (index === key && words.length > 1) return 1.45;
        if (minor(word)) return 0.62;
        return 0.85 + jitter * 0.35;
    });
};

/**
 * 錯落：每個詞在行的垂直方向上的錯位（以字號為單位；橫排時上下、豎排時左右）。
 * 重點詞不動，小字錯得多，其餘按種子上下跳。
 */
export const wordJags = (words: readonly WordSpan[], scales: readonly number[], seed: string): number[] => {
    const rng = createRng(`${seed}:jags`);
    const keyScale = Math.max(...scales);
    return words.map((_, index) => {
        const offset = (rng() - 0.5) * 2;
        const scale = scales[index] ?? 1;
        if (scale === keyScale && words.length > 1) return 0;
        return offset * (scale < 0.7 ? 0.32 : 0.2);
    });
};
