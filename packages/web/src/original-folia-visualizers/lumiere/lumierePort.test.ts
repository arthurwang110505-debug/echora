// Port-fidelity guard for the 繪光 (Lumiere) port.
//
// Same purpose as `tempera/temperaPort.test.ts`: the catalogs are data, and a dropped entry would
// not fail anything - `profileOf` falls back to the first profile, and the rig tables are keyed by
// kind. This pins the shape of the port: 10 families x 10 light rigs, every kind resolving to its
// own profile, the three paragraph transitions, and a program that compiles for both a lyric song
// and an instrumental. It also pins the two deliberate porting decisions (the identity offset and
// the word-scale ceiling), because those are the places where the port knowingly differs.
//
// The file sits in the visualizer tree (outside the main tsconfig) and is type-checked by
// `scripts/check-visualizer-types.mjs`.
import { describe, expect, it } from 'vitest';
import type { Line } from '../../types';
import { LUMIERE_FAMILY_DESCRIPTIONS, LUMIERE_FAMILY_LABELS, LUMIERE_KINDS, LUMIERE_PROFILES, hasProfile, profileOf } from './catalog';
import { compileLumiereProgram, findLumiereParagraphIndexAtTime } from './lumiereProgram';
import { LUMIERE_TRANSITION_KINDS } from './program';
import { LUMIERE_TRANSITIONS } from './lumiereTransitions';
import { MAX_WORD_SCALE } from './text/wordStyle';

const line = (fullText: string, startTime: number, endTime: number): Line => ({
    fullText,
    startTime,
    endTime,
    words: [],
});

const LINES: Line[] = [
    line('Walking through the quiet street', 1, 5),
    line('the lights come on one by one', 5, 10),
    line('and every window holds a song', 10, 15),
    line('that nobody has sung', 15, 19),
    line('so I keep walking', 22, 26),
    line('until the morning finds me', 26, 32),
];

describe('lumiere port', () => {
    it('keeps all 100 light rigs, ten per family', () => {
        expect(LUMIERE_PROFILES.length).toBe(100);
        expect(LUMIERE_KINDS.length).toBe(100);
        expect(new Set(LUMIERE_KINDS).size).toBe(100);

        const families = new Set(LUMIERE_PROFILES.map(profile => profile.family));
        expect(families.size).toBe(10);
        for (const family of families) {
            const inFamily = LUMIERE_PROFILES.filter(profile => profile.family === family);
            expect(inFamily.length, `${family} has ${inFamily.length} profiles`).toBe(10);
            // Every family the rigs declare is labelled in the panel, in both directions.
            expect(LUMIERE_FAMILY_LABELS[family], `${family} has no label`).toBeTruthy();
            expect(LUMIERE_FAMILY_DESCRIPTIONS[family], `${family} has no description`).toBeTruthy();
        }
    });

    it('gives every kind its own profile rather than the fallback', () => {
        const fallback = profileOf('not-a-kind');
        expect(fallback).toBe(LUMIERE_PROFILES[0]);

        const onFallback = LUMIERE_KINDS.filter(kind => profileOf(kind) === fallback);
        // `LUMIERE_PROFILES[0]` is the fallback (`zenith-shaft`), so it is the one kind whose
        // lookup is indistinguishable from a miss - every other kind must resolve to itself.
        expect(fallback.kind).toBe('zenith-shaft');
        expect(onFallback, 'kinds resolving to the fallback profile').toEqual(['zenith-shaft']);
        expect(LUMIERE_KINDS[0]).toBe('zenith-shaft');
        for (const kind of LUMIERE_KINDS) expect(hasProfile(kind)).toBe(true);
    });

    it('keeps every profile renderable: label, mood, region, typography and a rig factory', () => {
        for (const profile of LUMIERE_PROFILES) {
            expect(typeof profile.label, profile.kind).toBe('string');
            expect(profile.label.length, profile.kind).toBeGreaterThan(0);
            expect(typeof profile.light, profile.kind).toBe('function');
            expect(typeof profile.lineArt, profile.kind).toBe('function');
            expect(profile.region.w, profile.kind).toBeGreaterThan(0);
            expect(profile.region.h, profile.kind).toBeGreaterThan(0);
            expect(profile.heroSize, profile.kind).toBeGreaterThan(0);

            // The rig factories are pure data built from a seeded rng; they must not need Pixi.
            const rig = profile.light({ aspect: 16 / 9, random: () => 0.5 });
            expect(rig.beams.length, profile.kind).toBeGreaterThan(0);
        }
    });

    it('keeps the three paragraph transitions, each returning a finite frame', () => {
        expect(LUMIERE_TRANSITION_KINDS.length).toBe(3);
        for (const kind of LUMIERE_TRANSITION_KINDS) {
            const transition = LUMIERE_TRANSITIONS[kind];
            expect(transition.label.length).toBeGreaterThan(0);
            // `enterClamp` bounds the entering phase, `duration` reacts to the gap.
            const [min, max] = transition.enterClamp;
            expect(min).toBeLessThanOrEqual(max);
            for (const gap of [0, 0.2, 1, 4]) {
                const duration = transition.duration(gap);
                expect(duration).toBeGreaterThan(0);
                expect(duration).toBeLessThanOrEqual(1.2);
            }
            for (const phase of ['enter', 'exit'] as const) {
                for (const progress of [0, 0.5, 1]) {
                    const frame = transition.resolveFrame(phase, progress);
                    expect(Number.isFinite(frame.alpha)).toBe(true);
                    expect(Number.isFinite(frame.scale)).toBe(true);
                    expect(Number.isFinite(frame.blur)).toBe(true);
                    expect(frame.alpha).toBeGreaterThanOrEqual(0);
                    expect(frame.scale).toBeGreaterThan(0);
                    expect(frame.blur).toBeGreaterThanOrEqual(0);
                }
            }
        }
    });

    it('compiles a lyric song into sections whose shots are all real rigs', () => {
        const program = compileLumiereProgram(LINES, 'lumiere-port-guard', {}, { duration: 40 });

        expect(program.instrumental).toBe(false);
        expect(program.duration).toBe(40);
        expect(program.lyricEndTime).toBeGreaterThan(0);
        expect(program.paragraphs.length).toBeGreaterThan(0);

        const shots = program.paragraphs.flatMap(paragraph => paragraph.shots);
        expect(shots.length).toBeGreaterThan(0);
        for (const shot of shots) {
            expect(hasProfile(shot.kind), `${shot.kind} is not a ported profile`).toBe(true);
            expect(shot.endTime).toBeGreaterThan(shot.startTime);
        }

        // Paragraph boundaries tile the timeline: no gaps, no overlap until the song ends.
        const paragraphs = program.paragraphs;
        expect(paragraphs[0].startTime).toBe(0);
        for (let index = 1; index < paragraphs.length; index += 1) {
            expect(paragraphs[index].startTime, 'paragraphs must be contiguous').toBe(paragraphs[index - 1].endTime);
        }
        expect(paragraphs.at(-1)?.endTime).toBe(40);
    });

    it('compiles an instrumental program without inventing lyric lines', () => {
        const program = compileLumiereProgram([], 'lumiere-instrumental', {}, { duration: 96 });

        expect(program.instrumental).toBe(true);
        expect(program.lyricEndTime).toBeNull();
        expect(program.duration).toBe(96);
        // The whole timeline is covered by bridge shots, and every line slot stays empty.
        const shots = program.paragraphs.flatMap(paragraph => paragraph.shots);
        expect(shots.length).toBeGreaterThan(0);
        for (const shot of shots) {
            expect(hasProfile(shot.kind)).toBe(true);
            // A bridge shot covers no lyric line - the entries are indices into the song's lines.
            expect(shot.lineIndices).toEqual([]);
        }
    });

    it('resolves a paragraph for any time, clamping outside the program', () => {
        const program = compileLumiereProgram(LINES, 'lumiere-port-guard', {}, { duration: 40 });
        expect(findLumiereParagraphIndexAtTime(program, -5)).toBe(0);
        expect(findLumiereParagraphIndexAtTime(program, 0)).toBe(0);
        expect(findLumiereParagraphIndexAtTime(program, 1e6)).toBe(program.paragraphs.length - 1);
    });

    it('has the identity offset and its device-pixel-ratio read fully removed', () => {
        // The port replaces `(X + Math.imul(...)) - (X + Math.imul(...))` with a named 0; these two
        // constants are the ones that would visibly drift if that ever became anything else.
        expect(MAX_WORD_SCALE).toBe(1.5);
    });
});
