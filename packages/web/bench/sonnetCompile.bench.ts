import { describe, expect, it } from 'vitest';
import { compileSonnetProgram } from '../src/original-folia-visualizers/sonnet/sonnetProgram';
import type { Line, Word } from '../src/types';

// bench/sonnetCompile.bench.ts
//
// A measurement, kept out of the unit suite and run on purpose: `pnpm bench`.
//
// It measures the compile half of Sonnet's compile-then-render pipeline. `compileSonnetProgram` is
// pure data (no canvas, Pixi or DOM), so unlike the scene build it can be measured in Node with no
// shims. Upstream keeps the equivalent numbers in `test/manual/*.mts` and runs its render probes
// single-worker on purpose, because "a render count is only attributable on a machine that is not
// otherwise busy" - the same caveat applies here: run it on an idle machine, and read the median.
//
// The scene build (layout + one Pixi Text per glyph) is measured on the real device by the stage
// probe instead: `?stageProbe=1` then `__echoraStageReport()` (see docs/stage-measurement.zh-TW.md).

const LINE_COUNT = 120;
const RUNS = 7;

/**
 * Median compile budget for a 120-line song, in milliseconds.
 *
 * Recorded median on the reference machine: 33 ms for a 120-line song. The budget is set well
 * above it on purpose - a CI machine is slower and noisier, and this gate exists to catch a change
 * of order (an O(n^2) paragraph scan, a memo that stopped memoising), not a few percent of jitter.
 * When the recorded median moves, move the budget with it and note the new number in the doc.
 */
const BUDGET_MEDIAN_MS = 90;

const LATIN = [
    'the light comes through the window',
    'and every word we said is still here',
    'I count the hours like a metronome',
    'nothing moves but the dust in the air',
];

const CJK = [
    '光はまだ窓の向こうに',
    '私たちの言葉はここに残っている',
    '時計のように時間を数えて',
    '空気の中の埃だけが動く',
];

const splitWords = (text: string): { text: string; weight: number }[] => {
    const parts = text.split(' ').filter(Boolean);
    if (parts.length > 1) return parts.map(part => ({ text: part, weight: part.length }));
    // CJK without word segmentation: a word per character is what the parser produces.
    return Array.from(text).map(char => ({ text: char, weight: 1 }));
};

/** Deterministic word-timed fixture: mixed CJK/Latin, short lines, and a 3.2 s gap every 4 lines. */
const buildFixture = (lineCount: number): Line[] => {
    const lines: Line[] = [];
    let cursor = 0;
    for (let index = 0; index < lineCount; index += 1) {
        const source = index % 3 === 0 ? CJK[index % CJK.length] : LATIN[index % LATIN.length];
        const duration = index % 5 === 0 ? 1.2 : 3.4;
        const parts = splitWords(source);
        const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
        let wordCursor = cursor;
        const words: Word[] = parts.map(part => {
            const wordDuration = (part.weight / totalWeight) * duration;
            const word: Word = { text: part.text, startTime: wordCursor, endTime: wordCursor + wordDuration };
            wordCursor += wordDuration;
            return word;
        });
        lines.push({ words, startTime: cursor, endTime: cursor + duration, fullText: source });
        cursor += duration + (index % 4 === 3 ? 3.2 : 0.25);
    }
    return lines;
};

const median = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
};

describe('sonnet program compile budget', () => {
    it(`compiles a ${LINE_COUNT}-line song within ${BUDGET_MEDIAN_MS} ms (median of ${RUNS})`, () => {
        const lines = buildFixture(LINE_COUNT);
        const samples: number[] = [];
        let paragraphs = 0;
        let shots = 0;

        // One untimed run so the samples measure the compiler, not the JIT's first pass over it.
        compileSonnetProgram(lines, 'echora-bench-warmup');

        for (let run = 0; run < RUNS; run += 1) {
            const startedAt = performance.now();
            const program = compileSonnetProgram(lines, 'echora-bench');
            samples.push(performance.now() - startedAt);
            paragraphs = program.paragraphs.length;
            shots = program.paragraphs.reduce((sum, paragraph) => sum + paragraph.shots.length, 0);
        }

        const medianMs = median(samples);
        const perLineMs = medianMs / LINE_COUNT;

        console.log([
            '[bench] sonnet program compile',
            `  fixture   ${LINE_COUNT} lines (CJK + Latin, word-timed, 3.2s gaps)`,
            `  compiled  ${paragraphs} paragraphs / ${shots} shots`,
            `  best      ${Math.min(...samples).toFixed(2)} ms`,
            `  median    ${medianMs.toFixed(2)} ms  (${perLineMs.toFixed(3)} ms per line)`,
            `  worst     ${Math.max(...samples).toFixed(2)} ms`,
            `  budget    ${BUDGET_MEDIAN_MS} ms`,
        ].join('\n'));

        // The compile also has to produce a program, not just finish quickly.
        expect(paragraphs).toBeGreaterThan(0);
        expect(shots).toBeGreaterThanOrEqual(paragraphs);
        expect(medianMs).toBeLessThan(BUDGET_MEDIAN_MS);
    });
});
