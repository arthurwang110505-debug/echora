// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/rigs/botany.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import { bigLeaf, bloom, canopy, cells, fernCurl, mergeDiagrams, molecule, seedRoots, vine } from '../lineart/diagrams';
import { mergeSpecs, protractorHalo, scatteredSparks, sprout, viewfinderFrame } from '../lineart/recipes';
import type { LumiereProfile, RigContext } from '../types';
import { fan, familyOf, GLARE, MOTES, rig, shaft, STARFALL } from './base';

// src/components/visualizer/lumiere/rigs/botany.ts
// 葉脈族（光合）：嫩葉、葉脈、林冠、花與藤的線稿在光裡生長。「萌芽」是 L0 的第一個光位（參考圖底部）。
export const botanySprout: LumiereProfile = {
    kind: 'botany-sprout',
    label: '萌芽',
    family: 'botany',
    mood: 'quiet',
    light: () => ({
        beams: [
            {
                x: 0.5, y: -0.05, angle: Math.PI / 2, spread: 0.075, width: 0.07, length: 1.2, softness: 0.7,
                intensity: 0.95, streaks: 0.5, streakFreq: 6, streakSpeed: 0.06, core: 0.7,
                sway: { amplitude: 0.008, period: 15, phase: 0.2 },
            },
            {
                x: 0.5, y: -0.05, angle: Math.PI / 2, spread: 0.26, length: 0.75, softness: 0.95,
                intensity: 0.42, streaks: 0.85, streakFreq: 30, streakSpeed: 0.04, core: 0.3,
            },
        ],
        fog: {
            density: 0.9, tyndallBase: 0.14, scale: 2, driftX: -0.006, driftY: -0.03, warp: 1.1, ambient: 0.025,
        },
        glare: { x: 0.5, y: -0.01, radius: 0.1, intensity: 0.9, streak: 0.35 },
    }),
    motes: {
        count: 200, sizeMin: 0.004, sizeMax: 0.011, driftX: -0.003, driftY: -0.012,
        swirl: 0.018, swirlPeriod: 11, twinkle: 0.55, ambient: 0.012, gain: 1.2,
    },
    front: {
        count: 6, sizeMin: 0.05, sizeMax: 0.12, driftX: -0.004, driftY: -0.002,
        swirl: 0.01, swirlPeriod: 16, twinkle: 0.2, ambient: 0.015, gain: 0.25,
    },
    lineArt: ({ aspect, random }) => mergeSpecs(
        sprout({ cx: aspect * 0.5, baseY: 0.78, size: 0.22, alpha: 1 }),
        protractorHalo({ cx: aspect * 0.5, cy: 0.02, radius: 0.22, alpha: 0.35, delay: 0.2 }),
        viewfinderFrame({ aspect, left: 0.07, top: 0.22, right: 0.93, bottom: 0.8, delay: 0.25, alpha: 0.22 }),
        scatteredSparks({ aspect, count: 12, random, delay: 0.35, region: [0.2, 0.3, 0.8, 0.9] }),
    ),
    // 豎排為主：當前行豎在光柱裡，像莖一樣從葉上長出來。
    region: { cx: 0.5, cy: 0.44, w: 0.72, h: 0.6 },
    heroSize: 0.08,
    // 光柱窄，背景碎片小一點。
    echo: { size: 0.28 },
    typography: 'vertical',
    decay: { strength: 0.75, delay: 1.2 },
    starfall: { stars: 300, opening: 3.6, rain: 50, rainSpeed: 0.16, rainSpread: 0.25, brightness: 0.85 },
    camera: { push: 0.03, driftX: 0, driftY: 0.004 },
};

// ---------------------------------------------------------------------------------------------
// 葉脈族其餘 9 種。排版（連萌芽）4 橫 / 3 豎 / 3 縱橫。

const botany = familyOf('botany', {
    motes: { ...MOTES, count: 220, driftY: -0.012 },
    // 葉、蕨、花、藤的線稿是這一族的主角。
    artGain: 1.7,
    starfall: { ...STARFALL, rain: 40 },
});

const sparks = ({ aspect, random }: RigContext) => scatteredSparks({ aspect, count: 12, random, delay: 0.3 });

/** 葉脈（n）：一片大葉斜在畫面上，脈絡被斜光一段段點亮。 */
export const botanyVeins = botany({
    kind: 'botany-veins',
    label: '葉脈',
    mood: 'neutral',
    light: rig([shaft({ x: 0.15, y: -0.05, angle: 1.1, spread: 0.12, width: 0.12, length: 1.4, intensity: 0.9, streaks: 0.5, streakFreq: 6 })],
        { density: 0.9 }, { ...GLARE, x: 0.15, y: -0.02, radius: 0.14, intensity: 0.8 }),
    lineArt: context => mergeDiagrams(bigLeaf(context.aspect * 0.52, 0.42, 0.62, -0.45), sparks(context)),
    region: { cx: 0.5, cy: 0.72, w: 0.72, h: 0.36 },
    typography: 'horizontal',
    decay: { strength: 1, delay: 1 },
});

/** 林冠（l）：仰視樹冠，幾道光從葉間射下。 */
export const botanyCanopy = botany({
    kind: 'botany-canopy',
    label: '林冠',
    mood: 'loud',
    light: rig([0.25, 0.48, 0.7].map((x, i) => shaft({
        x, y: -0.05, angle: 1.45 + i * 0.1, spread: 0.08, width: 0.08, length: 1.3, softness: 0.6, intensity: 0.85, streaks: 0.5, streakFreq: 6,
        gobo: { pattern: 'leaves', frequency: 9, duty: 0.5, drift: 0.14 }, sway: { amplitude: 0.03, period: 6 + i, phase: i * 0.3 },
    })), { density: 1.1, driftX: 0.008 }, null),
    lineArt: ({ aspect, random }) => mergeDiagrams(canopy(aspect, random), scatteredSparks({ aspect, count: 16, random, delay: 0.3 })),
    motes: { ...MOTES, count: 300, driftX: 0.008, driftY: 0.006, swirl: 0.03 },
    typography: 'crossed',
    decay: { strength: 1.2, delay: 0.8 },
    starfall: { ...STARFALL, rain: 90, rainSpread: 1.2 },
});

/** 蕨卷（n）：一枝蕨葉捲曲著，隨唱緩緩展開。 */
export const botanyFern = botany({
    kind: 'botany-fern',
    label: '蕨卷',
    mood: 'neutral',
    light: rig([shaft({ x: 0.3, spread: 0.08, intensity: 0.85 }), fan({ x: 0.3, intensity: 0.2 })]),
    lineArt: context => mergeDiagrams(fernCurl(context.aspect * 0.28, 0.42, 0.16), sparks(context)),
    region: { cx: 0.62, cy: 0.5, w: 0.5, h: 0.62 },
    typography: 'vertical',
    decay: { strength: 0.8, delay: 1.2 },
});

/** 種子（q）：一道光落在一粒種子上，根鬚往下長。 */
export const botanySeed = botany({
    kind: 'botany-seed',
    label: '種子',
    mood: 'quiet',
    light: rig([shaft({ spread: 0.04, width: 0.02, length: 1.2, intensity: 0.8, core: 0.9 })], { density: 0.7, ambient: 0.02 }, { ...GLARE, intensity: 0.6 }),
    lineArt: ({ aspect, random }) => mergeDiagrams(seedRoots(aspect * 0.5, 0.7, random), scatteredSparks({ aspect, count: 10, random, delay: 0.3 })),
    region: { cx: 0.5, cy: 0.38, w: 0.72, h: 0.4 },
    typography: 'horizontal',
    decay: { strength: 0.6, delay: 1.6 },
});

/** 綻放（l）：以光點為中心，花瓣線稿一片片打開。 */
export const botanyBloom = botany({
    kind: 'botany-bloom',
    label: '綻放',
    mood: 'loud',
    light: rig(Array.from({ length: 6 }, (_, k) => shaft({
        x: 0.5, y: 0.42, angle: (k / 6) * Math.PI * 2 + 0.26, spread: 0.12, width: 0.01, length: 0.6, softness: 0.7, intensity: 0.55,
        streaks: 0.5, streakFreq: 7, core: 0.4, reach: 0.45, sway: { amplitude: 0.05, period: 10, phase: k / 6 },
    })), { density: 0.9 }, { x: 0.5, y: 0.42, radius: 0.1, intensity: 1.2, streak: 0.4 }),
    lineArt: context => mergeDiagrams(bloom(context.aspect * 0.5, 0.42, 0.2, 8), sparks(context)),
    typography: 'crossed',
    burst: { mode: 'sweep', density: 0.5, every: 3, offset: 1, size: 3, tint: [1, 0.8, 0.7] },
    decay: { strength: 1.2, delay: 0.8 },
});

/** 藤旋（n）：藤蔓螺旋著向光攀升。 */
export const botanyVine = botany({
    kind: 'botany-vine',
    label: '藤旋',
    mood: 'neutral',
    light: rig([shaft({ x: 0.72, spread: 0.07, intensity: 0.9 }), fan({ x: 0.72, intensity: 0.2 })], {}, { ...GLARE, x: 0.72 }),
    lineArt: context => mergeDiagrams(vine(context.aspect * 0.72, 1.02, 0.08, 0.05, 4), sparks(context)),
    region: { cx: 0.36, cy: 0.5, w: 0.5, h: 0.62 },
    typography: 'vertical',
    decay: { strength: 1, delay: 1 },
});

/** 葉綠（q）：顯微鏡視野裡，葉綠體的小圓點在光裡發亮。 */
export const botanyChloro = botany({
    kind: 'botany-chloro',
    label: '葉綠',
    mood: 'quiet',
    light: rig([shaft({ spread: 0.2, width: 0.3, softness: 0.9, intensity: 0.6, core: 0.3 })], { density: 0.7 }, null,
        { caustic: { scale: 6, speed: 0.12, inBeam: 0.3, floor: { cx: 0.5, cy: 0.45, rx: 0.2, ry: 0.36, strength: 0.35 } } }),
    lineArt: ({ aspect, random }) => mergeDiagrams(cells(aspect * 0.5, 0.45, 0.36, random, 22), scatteredSparks({ aspect, count: 8, random, delay: 0.3 })),
    region: { cx: 0.5, cy: 0.5, w: 0.5, h: 0.5 },
    typography: 'crossed',
    decay: { strength: 0.6, delay: 1.6 },
});

/** 光合式（n）：分子結構的線稿與量角器光環，致敬參考圖裡的化學式。 */
export const botanyFormula = botany({
    kind: 'botany-formula',
    label: '光合式',
    mood: 'neutral',
    light: rig([shaft(), fan()]),
    lineArt: context => mergeDiagrams(
        molecule(context.aspect * 0.24, 0.3, 0.06),
        molecule(context.aspect * 0.78, 0.74, 0.05, { delay: 0.2 }),
        protractorHalo({ cx: context.aspect * 0.5, cy: 0.03, radius: 0.28, alpha: 0.5 }),
        sparks(context),
    ),
    typography: 'horizontal',
    decay: { strength: 1, delay: 1 },
});

/** 花粉（l）：斜光裡漂著大顆的花粉粒子。 */
export const botanyPollen = botany({
    kind: 'botany-pollen',
    label: '花粉',
    mood: 'loud',
    light: rig([shaft({ x: 0.2, y: -0.05, angle: 1.15, spread: 0.14, width: 0.16, length: 1.5, intensity: 1, streaks: 0.5 }), fan({ x: 0.2, angle: 1.15, intensity: 0.3 })],
        { density: 1, driftX: 0.012, driftY: -0.01 }, { ...GLARE, x: 0.2, y: 0.0 }),
    lineArt: sparks,
    motes: { count: 360, sizeMin: 0.006, sizeMax: 0.022, driftX: 0.012, driftY: -0.006, swirl: 0.04, swirlPeriod: 10, twinkle: 0.4, ambient: 0.02, gain: 1.6 },
    typography: 'horizontal',
    decay: { strength: 1.2, delay: 0.8 },
});

export const BOTANY_PROFILES: LumiereProfile[] = [
    botanySprout, botanyVeins, botanyCanopy, botanyFern, botanySeed,
    botanyBloom, botanyVine, botanyChloro, botanyFormula, botanyPollen,
];
