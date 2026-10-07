// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/light/starfall.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { Container, Sprite, Texture } from 'pixi.js';
import { createRng } from '../lumiereRandom';
import { compressLight, lightAt, type ResolvedBeam } from './rig';

// Echora note: upstream opens this file with a "reference value" that is `(X + Math.imul(...))`
// minus itself, i.e. identically 0, plus a device-pixel-ratio read that only feeds it. The 20
// files carrying it all do the same thing, so the dead expressions are dropped and the offset
// stays as a named 0: every use site downstream is unchanged, and so is the rendering.
const LUMIERE_NEUTRAL_OFFSET = 0;


// src/components/visualizer/lumiere/light/starfall.ts
// 星空點亮：鏡頭開始時全黑，數百個光點從畫面頂部上方傾瀉而下（帶拖尾，落定前減速），落定的一瞬閃一下，
// 之後留在原處成為閃爍的星空（上密下疏）；主光柱在傾瀉到一半左右時點亮（由場景按 ignitionAt 驅動）。
// 開場之後還有持續的光雨：稀疏的光點沿光柱附近落下，進了光束更亮。
// 全部是 (種子, t) 的閉式函數。
type PixiModule = typeof import('pixi.js');

export interface StarfallSpec {
    /** 星空裡的星數。 */
    stars: number;
    /** 開場傾瀉持續多久（秒）。 */
    opening: number;
    /** 同時在落的光雨粒數（0 = 沒有光雨）。 */
    rain: number;
    /** 光雨下落速度（高度單位 / 秒）。 */
    rainSpeed: number;
    /** 光雨集中在光柱附近的程度：橫向散佈的寬度（佔畫面寬）。 */
    rainSpread: number;
    /** 星空整體亮度。 */
    brightness: number;
}

/** 主光柱在開場的什麼時刻點亮（相對鏡頭開始，秒）。 */
export const starfallIgnition = (spec: StarfallSpec) => spec.opening * (0.45 + LUMIERE_NEUTRAL_OFFSET);

interface Star {
    sprite: Sprite;
    trail: Sprite;
    x: number;
    y: number;
    fromY: number;
    delay: number;
    fall: number;
    size: number;
    bright: boolean;
    twinklePhase: number;
    twinkleFreq: number;
}

interface Drop {
    sprite: Sprite;
    trail: Sprite;
    x: number;
    period: number;
    phase: number;
    size: number;
    sway: number;
}

export interface StarfallLayer {
    view: Container;
    /** local：鏡頭開始後的秒數（開場按它算）；time：絕對時刻（閃爍、光雨按它算）。 */
    update: (local: number, time: number, beams: readonly ResolvedBeam[], color: number, fade: number) => void;
    destroy: () => void;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOutCubic = (value: number) => 1 - (1 - clamp01(value)) ** 3;

export const createStarfall = (
    pixi: PixiModule,
    options: { width: number; height: number; seed: string; spec: StarfallSpec; dot: Texture; star: Texture; streak: Texture },
): StarfallLayer => {
    const { width, height, spec } = options;
    const aspect = width / height;
    const rng = createRng(`${options.seed}:starfall`);
    const view = new pixi.Container();
    const trails = new pixi.Container();
    const points = new pixi.Container();
    view.addChild(trails, points);

    const makeTrail = () => {
        const trail = new pixi.Sprite(options.streak);
        trail.anchor.set(1, 0.5);
        trail.rotation = Math.PI / 2;
        trails.addChild(trail);
        return trail;
    };

    const stars: Star[] = Array.from({ length: spec.stars }, () => {
        const bright = rng() < 0.08;
        const sprite = new pixi.Sprite(bright ? options.star : options.dot);
        sprite.anchor.set(0.5);
        points.addChild(sprite);
        return {
            sprite,
            trail: makeTrail(),
            x: rng() * aspect,
            // 上密下疏。
            y: 0.02 + rng() ** 1.7 * 0.9,
            fromY: -0.05 - rng() * 0.25,
            // 傾瀉：大多數在開場前段落下，少數拖到後段。
            delay: spec.opening * (0.02 + 0.7 * rng() ** 1.4),
            fall: 0.45 + rng() * 0.7,
            size: bright ? 0.018 + rng() * 0.02 : 0.003 + rng() * 0.006,
            bright,
            twinklePhase: rng() * Math.PI * 2,
            twinkleFreq: 0.4 + rng() * 1.8,
        };
    });

    const drops: Drop[] = Array.from({ length: spec.rain }, () => {
        const sprite = new pixi.Sprite(options.dot);
        sprite.anchor.set(0.5);
        points.addChild(sprite);
        // 橫向：集中在畫面中線（光柱）附近，近似正態。
        const spread = (rng() + rng() + rng() - 1.5) / 1.5;
        return {
            sprite,
            trail: makeTrail(),
            x: aspect * (0.5 + spread * spec.rainSpread * 0.5),
            period: (1.25 / Math.max(spec.rainSpeed, 0.01)) * (0.7 + rng() * 0.6),
            phase: rng(),
            size: 0.003 + rng() * 0.005,
            sway: (rng() - 0.5) * 0.02,
        };
    });

    const place = (sprite: Sprite, trail: Sprite, x: number, y: number, size: number, alpha: number, speed: number, color: number) => {
        sprite.visible = alpha > 0.004;
        trail.visible = sprite.visible && speed > 0.05;
        if (!sprite.visible) return;
        sprite.position.set(x * height, y * height);
        sprite.width = size * height;
        sprite.height = size * height;
        sprite.alpha = alpha;
        sprite.tint = color;
        if (trail.visible) {
            // 拖尾長度隨速度，朝上（錨點在尾端 = 光點處）。
            trail.position.set(x * height, y * height);
            trail.width = Math.min(0.25, speed * 0.09) * height;
            trail.height = Math.max(1.5, size * height * 0.7);
            trail.alpha = alpha * 0.6;
            trail.tint = color;
        }
    };

    const update = (local: number, time: number, beams: readonly ResolvedBeam[], color: number, fade: number) => {
        for (const star of stars) {
            const progress = (local - star.delay) / star.fall;
            if (progress <= 0) {
                star.sprite.visible = false;
                star.trail.visible = false;
                continue;
            }
            const eased = easeOutCubic(progress);
            const y = star.fromY + (star.y - star.fromY) * eased;
            // 下落速度（高度單位 / 秒）：easeOutCubic 的導數。
            const speed = progress < 1 ? ((star.y - star.fromY) * 3 * (1 - progress) ** 2) / star.fall : 0;
            const landedAt = star.delay + star.fall;
            const flash = local >= landedAt ? Math.exp(-(local - landedAt) / 0.25) : 0;
            const twinkle = 0.55 + 0.45 * Math.sin(time * star.twinkleFreq * Math.PI * 2 + star.twinklePhase);
            const lit = compressLight(lightAt(beams, star.x, y));
            const base = progress < 1 ? 0.9 : (star.bright ? 0.7 : 0.45) * twinkle;
            const alpha = clamp01((base + lit * 0.8 + flash) * spec.brightness * fade);
            place(star.sprite, star.trail, star.x, y, star.size * (1 + flash * 1.5), alpha, speed, color);
        }
        // 光雨：開場之後才開始，漸強。
        const rainIn = clamp01((local - spec.opening * 0.6) / 1.5);
        for (const drop of drops) {
            const cycle = (time / drop.period + drop.phase) % 1;
            const y = -0.1 + cycle * 1.25;
            const x = drop.x + Math.sin(time * 0.7 + drop.phase * 6) * drop.sway;
            const lit = compressLight(lightAt(beams, x, y));
            const edge = clamp01(cycle / 0.08) * clamp01((1 - cycle) / 0.15);
            const alpha = clamp01((0.18 + lit * 1.1) * edge * rainIn * fade * spec.brightness);
            place(drop.sprite, drop.trail, x, y, drop.size, alpha, 1.25 / drop.period, color);
        }
    };

    return {
        view,
        update,
        destroy: () => view.destroy({ children: true }),
    };
};
