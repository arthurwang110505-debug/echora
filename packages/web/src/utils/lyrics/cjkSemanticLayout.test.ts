import { describe, expect, it } from 'vitest';
import { buildDisplayWordsFromLayoutUnits, buildPostLyricLayoutUnits } from './cjkSemanticLayout';
import type { Line, Word } from '../../types';

// src/utils/lyrics/cjkSemanticLayout.test.ts
//
// The layout layer classic and partita render through. Two things it must never do: produce units
// that do not add up to the line (the layout would silently drop or duplicate glyphs), and disagree
// with the parser words about timing (per-character highlighting would drift).
//
// This file lives under src/utils, which tsconfig excludes, so it is not type-checked — vitest
// transpiles it. The module under test is excluded for the same reason and carries pre-existing
// unresolvable imports.

const line = (fullText: string, words: Word[], wordSegments?: string[]): Line => ({
    fullText,
    words,
    wordSegments,
    startTime: words[0]?.startTime ?? 0,
    endTime: words[words.length - 1]?.endTime ?? 0,
});

// Parser words as a per-character source (yrc/qrc) produces them.
const perCharacter = (text: string): Word[] => Array.from(text).map((character, index) => ({
    text: character,
    startTime: index,
    endTime: index + 1,
}));

describe('buildPostLyricLayoutUnits with a saved word segmentation', () => {
    const text = '把回忆拼好给你';

    it('groups parser words by the user’s boundaries instead of the default split', () => {
        const units = buildPostLyricLayoutUnits(line(text, perCharacter(text), ['把', '回忆', '拼好', '给', '你']), { semantic: true });
        expect(units.map(unit => unit.text)).toEqual(['把', '回忆', '拼好', '给', '你']);
        // Timing still comes from the parser's own words: a unit spans its first and last word.
        expect(units[1]).toMatchObject({ startTime: 1, endTime: 3 });
    });

    it('reproduces the line exactly through the units', () => {
        const units = buildPostLyricLayoutUnits(line(text, perCharacter(text), ['把', '回忆', '拼好', '给', '你']), { semantic: true, sticky: true });
        expect(units.map(unit => unit.text).join('')).toBe(text);
        expect(units.flatMap(unit => unit.words)).toHaveLength(text.length);
    });

    it('ignores a stale split that no longer rebuilds the line', () => {
        const units = buildPostLyricLayoutUnits(line(text, perCharacter(text), ['完', '全', '不', '同']), { semantic: true });
        expect(units.map(unit => unit.text).join('')).toBe(text);
    });

    it('keeps whitespace between words as its own unit boundary, not inside a word', () => {
        const spaced = 'ひとつ ふたつ';
        const words: Word[] = [
            { text: 'ひ', startTime: 0, endTime: 1 },
            { text: 'と', startTime: 1, endTime: 2 },
            { text: 'つ', startTime: 2, endTime: 3 },
            { text: ' ', startTime: 3, endTime: 4 },
            { text: 'ふ', startTime: 4, endTime: 5 },
            { text: 'た', startTime: 5, endTime: 6 },
            { text: 'つ', startTime: 6, endTime: 7 },
        ];
        const units = buildPostLyricLayoutUnits(line(spaced, words, ['ひとつ ', 'ふたつ']), { semantic: true });
        expect(units.map(unit => unit.text).join('')).toBe(spaced);
    });

    it('renders a semantic unit as its original words, so per-character timing survives', () => {
        const units = buildPostLyricLayoutUnits(line(text, perCharacter(text), ['把', '回忆', '拼好', '给', '你']), { semantic: true, sticky: true });
        const displayed = buildDisplayWordsFromLayoutUnits(units);
        expect(displayed).toHaveLength(text.length);
    });
});
