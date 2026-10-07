// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/rigs/motes.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import { horizon, mergeDiagrams } from '../lineart/diagrams';
import { scatteredSparks } from '../lineart/recipes';
import type { MotesSpec } from '../light/motes';
import type { LumiereProfile, RigContext } from '../types';
import { FRONT, familyOf, MOTES, rig, shaft, STARFALL } from './base';

// src/components/visualizer/lumiere/rigs/motes.ts
// 螢塵族：以煙與粒子為主，光很少——浮塵、螢火、煙縷、飛燼、光雪、散景、晨霧、光群、化塵、極光。
// 也是間奏鏡頭的主力。排版 4 橫 / 3 豎 / 3 縱橫。
const motesFamily = familyOf('motes', {
    starfall: { ...STARFALL, rain: 30 },
    lineArt: ({ aspect, random }: RigContext) => scatteredSparks({ aspect, count: 10, random, delay: 0.3 }),
});

const particles = (overrides: Partial<MotesSpec>): MotesSpec => ({ ...MOTES, ...overrides });

/** 浮塵（q）：暗室裡一束斜光，光裡的塵埃緩緩旋轉。 */
export const motesDust = motesFamily({
    kind: 'motes-dust',
    label: '浮塵',
    mood: 'quiet',
    light: rig([shaft({ x: 0.15, y: -0.05, angle: 1.05, spread: 0.1, width: 0.1, length: 1.5, intensity: 0.8, streaks: 0.4 })], { density: 0.8, ambient: 0.015 }, null),
    motes: particles({ count: 420, sizeMin: 0.003, sizeMax: 0.012, driftX: 0.002, driftY: -0.004, swirl: 0.035, swirlPeriod: 14, gain: 1.6 }),
    typography: 'horizontal',
    decay: { strength: 0.7, delay: 1.4 },
});

/** 螢火（q）：沒有光束，只有散落的螢光點，自己亮著、忽明忽暗。 */
export const motesFirefly = motesFamily({
    kind: 'motes-firefly',
    label: '螢火',
    mood: 'quiet',
    light: rig([shaft({ spread: 0.05, intensity: 0.15 })], { density: 0.6, ambient: 0.02 }, null),
    motes: particles({ count: 90, sizeMin: 0.008, sizeMax: 0.022, driftX: 0.003, driftY: -0.003, swirl: 0.06, swirlPeriod: 11, twinkle: 0.9, ambient: 0.55, gain: 0.8 }),
    front: { ...FRONT, count: 14, ambient: 0.12, twinkle: 0.7 },
    region: { cx: 0.5, cy: 0.5, w: 0.5, h: 0.62 },
    typography: 'vertical',
    decay: { strength: 0.6, delay: 1.6 },
});

/** 煙縷（n）：一縷縷上升的煙，被側光勾出輪廓。 */
export const motesSmoke = motesFamily({
    kind: 'motes-smoke',
    label: '煙縷',
    mood: 'neutral',
    light: rig([shaft({ x: -0.05, y: 0.55, angle: -0.08, spread: 0.18, width: 0.3, length: 1.6, softness: 0.7, intensity: 0.42, streaks: 0.2, core: 0.3, sway: undefined })],
        { density: 1.5, tyndallBase: 0.05, scale: 1.8, warp: 1.8, driftX: 0.004, driftY: -0.06, ambient: 0.05 }, null),
    motes: particles({ count: 140 }),
    typography: 'crossed',
    decay: { strength: 1, delay: 1 },
});

/** 飛燼（l）：暖紅的光從下面燒上來，火星往上飄。 */
export const motesEmbers = motesFamily({
    kind: 'motes-embers',
    label: '飛燼',
    mood: 'loud',
    light: rig([shaft({ x: 0.5, y: 1.05, angle: -Math.PI / 2, spread: 0.35, width: 0.3, length: 0.6, softness: 0.9, intensity: 0.8, streaks: 0.6, streakFreq: 8, core: 0.3,
        tint: [1, 0.55, 0.3], pulse: { amplitude: 0.2, period: 1.3, phase: 0 }, sway: undefined })], { density: 1.1, driftY: -0.05 }, null),
    motes: particles({ count: 380, sizeMin: 0.003, sizeMax: 0.01, driftX: 0.004, driftY: -0.07, swirl: 0.03, swirlPeriod: 5, twinkle: 0.8, ambient: 0.1, gain: 1.8 }),
    region: { cx: 0.5, cy: 0.44, w: 0.72, h: 0.46 },
    typography: 'horizontal',
    decay: { strength: 1.4, delay: 0.6 },
});

/** 光雪（q）：光點像雪一樣緩緩落下。 */
export const motesSnow = motesFamily({
    kind: 'motes-snow',
    label: '光雪',
    mood: 'quiet',
    light: rig([shaft({ spread: 0.2, width: 0.2, softness: 0.9, intensity: 0.5, core: 0.3 })], { density: 0.8, driftY: 0.01 }, null),
    motes: particles({ count: 460, sizeMin: 0.003, sizeMax: 0.012, driftX: 0.003, driftY: 0.035, swirl: 0.02, swirlPeriod: 8, twinkle: 0.3, ambient: 0.15, gain: 1 }),
    region: { cx: 0.5, cy: 0.5, w: 0.5, h: 0.62 },
    typography: 'vertical',
    decay: { strength: 0.6, delay: 1.6 },
    starfall: { ...STARFALL, rain: 60, rainSpeed: 0.12, rainSpread: 1.8, brightness: 0.7 },
});

/** 散景（n）：前景一片片大光斑虛化，焦點在字上。 */
export const motesBokeh = motesFamily({
    kind: 'motes-bokeh',
    label: '散景',
    mood: 'neutral',
    light: rig([shaft({ intensity: 0.6 })], { density: 0.8 }, null),
    motes: particles({ count: 120 }),
    front: { ...FRONT, count: 34, sizeMin: 0.06, sizeMax: 0.2, ambient: 0.1, gain: 0.5, twinkle: 0.3, driftX: 0.008 },
    typography: 'horizontal',
    decay: { strength: 1, delay: 1 },
});

/** 晨霧（q）：低伏的霧層，光從霧後面透出來。 */
export const motesMist = motesFamily({
    kind: 'motes-mist',
    label: '晨霧',
    mood: 'quiet',
    // 霧後的光：光束與眩光都壓低，眩光不拉橫絲（原來亮得發白，一條橫線貫穿畫面）。
    light: rig([shaft({ x: 0.7, y: 0.62, angle: -2.8, spread: 0.5, width: 0.3, length: 1.2, softness: 1, intensity: 0.55, streaks: 0.3, core: 0.2, sway: undefined })],
        { density: 1.5, tyndallBase: 0.1, scale: 1.2, warp: 0.6, driftX: 0.02, driftY: 0, ambient: 0.05 }, { x: 0.7, y: 0.62, radius: 0.16, intensity: 0.5, streak: 0.08 }),
    lineArt: ({ aspect, random }) => mergeDiagrams(horizon(aspect, 0.64), scatteredSparks({ aspect, count: 8, random, delay: 0.3, region: [0.05, 0.05, 0.95, 0.55] })),
    motes: particles({ count: 120, driftX: 0.01 }),
    region: { cx: 0.36, cy: 0.42, w: 0.44, h: 0.5 },
    typography: 'vertical',
    decay: { strength: 0.6, delay: 1.6 },
});

/** 光群（l）：粒子成群地繞著字流動，又散開。 */
export const motesSwarm = motesFamily({
    kind: 'motes-swarm',
    label: '光群',
    mood: 'loud',
    light: rig([shaft({ intensity: 0.8 }), shaft({ spread: 0.3, length: 0.6, softness: 0.9, intensity: 0.25, streaks: 0.8, streakFreq: 24 })]),
    motes: particles({ count: 460, sizeMin: 0.003, sizeMax: 0.012, driftX: 0, driftY: 0, swirl: 0.14, swirlPeriod: 6, twinkle: 0.6, ambient: 0.08, gain: 1.6 }),
    typography: 'crossed',
    decay: { strength: 1.3, delay: 0.7 },
});

/** 化塵（n）：字一唱完就碎成光塵飄散（銜接用）。 */
export const motesDissolve = motesFamily({
    kind: 'motes-dissolve',
    label: '化塵',
    mood: 'neutral',
    light: rig([shaft({ intensity: 0.7 })]),
    motes: particles({ count: 380, driftY: -0.02, swirl: 0.04, gain: 1.5 }),
    typography: 'crossed',
    decay: { strength: 2.2, delay: 0.3 },
});

/** 極光（l）：畫面上方簾子一樣流動的光幕。 */
export const motesAurora = motesFamily({
    kind: 'motes-aurora',
    label: '極光',
    mood: 'loud',
    light: rig([0.2, 0.4, 0.6, 0.8].map((x, i) => shaft({
        x, y: -0.1, angle: Math.PI / 2 + 0.1, spread: 0.06, width: 0.16, length: 0.7, softness: 0.8, intensity: 0.7, streaks: 0.9, streakFreq: 30, streakSpeed: 0.3,
        core: 0.2, spectrum: 0.5, tint: [0.6, 1, 0.8], sway: { amplitude: 0.12, period: 8 + i * 1.7, phase: i * 0.2 },
    })), { density: 0.9, ambient: 0.03 }, null),
    region: { cx: 0.5, cy: 0.62, w: 0.72, h: 0.4 },
    typography: 'horizontal',
    decay: { strength: 1.2, delay: 0.8 },
    starfall: { ...STARFALL, stars: 560, rain: 20 },
});

export const MOTES_PROFILES: LumiereProfile[] = [
    motesDust, motesFirefly, motesSmoke, motesEmbers, motesSnow,
    motesBokeh, motesMist, motesSwarm, motesDissolve, motesAurora,
];
