// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/text/reveal.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { Line } from '../../../types';
import { buildLineGraphemeTimeline } from '../../../utils/lyrics/graphemeTiming';

// src/components/visualizer/lumiere/text/reveal.ts
// 逐字的點亮時刻與進度。時刻取自解析器的逐字時間軸（詞內按音節，沒有音節按比例，同 fume 的 reveal），
// 進度與閃點包絡都是 t 的純函數。
export interface GlyphTiming {
    start: number;
    end: number;
}

export const buildGlyphTimings = (line: Line): GlyphTiming[] => (
    buildLineGraphemeTimeline(line).map(timing => ({ start: timing.startTime, end: timing.endTime }))
);

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** 0 = 還沒唱到，1 = 已唱完。字的時長太短時至少給 80ms，點亮不至於一閃而過。 */
export const glyphProgress = (timing: GlyphTiming, time: number) => (
    clamp01((time - timing.start) / Math.max(timing.end - timing.start, 0.08))
);

/** 點亮瞬間的閃點：attack 秒平滑升起，之後按 decay 秒指數衰減。 */
export const flashEnvelope = (timing: GlyphTiming, time: number, decay = 0.5, attack = 0.15) => {
    const age = time - timing.start;
    if (age <= 0) return 0;
    if (age < attack) {
        const t = age / attack;
        return t * t * (3 - 2 * t);
    }
    return Math.exp(-(age - attack) / decay);
};
