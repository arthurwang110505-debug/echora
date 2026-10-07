// Port-fidelity guard for the Tempera port.
//
// The port's promise is a complete director: every shot kind the program can pick must have both a
// composition drawer (the per-kind drawing, grouped in `compositions/`) and a shot profile (its
// layout regions and camera). Both registries are keyed `Partial<Record<TemperaShotKind, ...>>` and
// fall back silently - `resolveTemperaComposition` to `duo-split`, `resolveTemperaShotProfile` to a
// default - so a kind dropped in porting would render, just never as itself. This is the test the
// upstream comment in `temperaCompositions.ts` refers to ("the registry test asserts there are no
// gaps"), and it is why the file lives in the visualizer tree: the tree is outside the main tsc
// program and is type-checked by `scripts/check-visualizer-types.mjs` instead.
import { describe, expect, it } from 'vitest';
import type { Line } from '../../types';
import { TEMPERA_APERTURE_COMPOSITIONS } from './compositions/temperaApertureCompositions';
import { TEMPERA_BAND_COMPOSITIONS } from './compositions/temperaBandCompositions';
import { TEMPERA_CHARM_COMPOSITIONS } from './compositions/temperaCharmCompositions';
import { TEMPERA_CINEMA_COMPOSITIONS } from './compositions/temperaCinemaCompositions';
import { TEMPERA_CORRIDOR_COMPOSITIONS } from './compositions/temperaCorridorCompositions';
import { TEMPERA_FRAME_COMPOSITIONS } from './compositions/temperaFrameCompositions';
import { TEMPERA_MONOGATARI_COMPOSITIONS } from './compositions/temperaMonogatariCompositions';
import { TEMPERA_MONOLITH_COMPOSITIONS } from './compositions/temperaMonolithCompositions';
import { TEMPERA_POSTER_COMPOSITIONS } from './compositions/temperaPosterCompositions';
import { TEMPERA_SIGNAL_COMPOSITIONS } from './compositions/temperaSignalCompositions';
import { TEMPERA_SPARSE_COMPOSITIONS } from './compositions/temperaSparseCompositions';
import { TEMPERA_SPLIT_COMPOSITIONS } from './compositions/temperaSplitCompositions';
import { TEMPERA_TERRAIN_COMPOSITIONS } from './compositions/temperaTerrainCompositions';
import { resolveTemperaComposition } from './temperaCompositions';
import { compileTemperaProgram } from './temperaProgram';
import { TEMPERA_SHOT_PROFILES, resolveTemperaShotProfile } from './temperaShotProfiles';
import { TEMPERA_SHOT_KINDS } from './types';

const FAMILIES = {
    aperture: TEMPERA_APERTURE_COMPOSITIONS,
    band: TEMPERA_BAND_COMPOSITIONS,
    charm: TEMPERA_CHARM_COMPOSITIONS,
    cinema: TEMPERA_CINEMA_COMPOSITIONS,
    corridor: TEMPERA_CORRIDOR_COMPOSITIONS,
    frame: TEMPERA_FRAME_COMPOSITIONS,
    monogatari: TEMPERA_MONOGATARI_COMPOSITIONS,
    monolith: TEMPERA_MONOLITH_COMPOSITIONS,
    poster: TEMPERA_POSTER_COMPOSITIONS,
    signal: TEMPERA_SIGNAL_COMPOSITIONS,
    sparse: TEMPERA_SPARSE_COMPOSITIONS,
    split: TEMPERA_SPLIT_COMPOSITIONS,
    terrain: TEMPERA_TERRAIN_COMPOSITIONS,
};

const line = (fullText: string, startTime: number, endTime: number): Line => ({
    fullText,
    startTime,
    endTime,
    words: [],
});

describe('tempera port', () => {
    it('keeps all 121 shot kinds, spread over the 13 composition families', () => {
        expect(TEMPERA_SHOT_KINDS.length).toBe(121);
        expect(Object.keys(FAMILIES).length).toBe(13);
    });

    it('gives every shot kind a composition drawer of its own', () => {
        const owners = new Map<string, string[]>();
        for (const [family, drawers] of Object.entries(FAMILIES)) {
            for (const kind of Object.keys(drawers)) {
                owners.set(kind, [...(owners.get(kind) ?? []), family]);
            }
        }

        const missing = TEMPERA_SHOT_KINDS.filter(kind => !owners.has(kind));
        expect(missing, 'shot kinds with no drawer').toEqual([]);
        const duplicated = [...owners.entries()].filter(([, families]) => families.length > 1);
        expect(duplicated, 'shot kinds claimed by two families').toEqual([]);

        // The registry resolves every kind to a real drawer rather than its `duo-split` fallback.
        const fallback = resolveTemperaComposition('duo-split');
        const resolved = TEMPERA_SHOT_KINDS.filter(kind => resolveTemperaComposition(kind) === fallback);
        expect(resolved).toEqual(['duo-split']);
    });

    it('gives every shot kind a shot profile', () => {
        const missing = TEMPERA_SHOT_KINDS.filter(kind => TEMPERA_SHOT_PROFILES[kind] === undefined);
        expect(missing, 'shot kinds with no profile').toEqual([]);

        const fallback = resolveTemperaShotProfile('duo-split');
        const resolved = TEMPERA_SHOT_KINDS.filter(kind => resolveTemperaShotProfile(kind) === fallback);
        expect(resolved).toEqual(['duo-split']);
    });

    it('compiles a program whose shots all come from the ported tables', () => {
        const lines = [
            line('Walking through the quiet street', 0, 4),
            line('the lights come on one by one', 4, 9),
            line('and every window holds a song', 9, 14),
            line('that nobody has sung', 14, 18),
        ];

        for (const wholeLineLyrics of [false, true]) {
            const program = compileTemperaProgram(lines, 'tempera-port-guard', { wholeLineLyrics });
            const shots = program.paragraphs.flatMap(paragraph => paragraph.shots);
            expect(program.paragraphs.length).toBeGreaterThan(0);
            expect(shots.length).toBeGreaterThan(0);

            for (const shot of shots) {
                expect(TEMPERA_SHOT_KINDS).toContain(shot.kind);
                expect(Object.keys(FAMILIES).some(
                    family => (FAMILIES as Record<string, Record<string, unknown>>)[family][shot.kind] !== undefined,
                )).toBe(true);
            }
        }
    });
});
