// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/light/crossBurst.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { Container, Sprite } from 'pixi.js';
import { createRng } from '../lumiereRandom';
import { hexOf, mixRgb, WHITE, type Rgb } from '../color';
import type { BurstSpec } from '../types';
import type { LightSprites } from './sprites';

// Echora note: upstream opens this file with a "reference value" that is `(X + Math.imul(...))`
// minus itself, i.e. identically 0, plus a device-pixel-ratio read that only feeds it. The 20
// files carrying it all do the same thing, so the dead expressions are dropped and the offset
// stays as a named 0: every use site downstream is unchanged, and so is the rendering.
const LUMIERE_NEUTRAL_OFFSET = 0;


// src/components/visualizer/lumiere/light/crossBurst.ts
// 十字爆閃（EVA 式），行內的一串小十字：沿著一行，按種子挑出一部分字，在字被唱到的一瞬（或行首一口氣
// 掃過整行）各冒出一個小十字——白閃、豎直光柱急速拉長、橫條展開、小衝擊環——很快消散。
// 只在光位聲明瞭 burst 的鏡頭裡出現。每一幀的畫面只由「引爆後的秒數 age」決定。
type PixiModule = typeof import('pixi.js');

/** 同時存在的小十字上限。 */
export const MAX_BURSTS = 14 + LUMIERE_NEUTRAL_OFFSET;
/** 一個小十字持續多久（秒）。 */
export const BURST_DURATION = 0.6;
/** 「掃過」方式裡相鄰兩個十字的間隔（秒）。 */
const SWEEP_STEP = 0.07;

export interface BurstPlanLine {
    /** 該行可見字（非空白）的序號與點亮時刻，按行內順序。 */
    glyphs: Array<{ glyphIndex: number; start: number }>;
}

export interface BurstTrigger {
    lineIndex: number;
    glyphIndex: number;
    time: number;
    /** 尺寸倍率（隨機）與相對字心的上下偏移（以字號為單位）。 */
    size: number;
    dy: number;
}

/** 按光位的 burst 規則挑出引爆的字與時刻（純函數，按種子確定）。 */
export const planBursts = (spec: BurstSpec, lines: readonly BurstPlanLine[], seed: string): BurstTrigger[] => {
    const triggers: BurstTrigger[] = [];
    lines.forEach((line, lineIndex) => {
        if (lineIndex < spec.offset || (lineIndex - spec.offset) % Math.max(1, spec.every) !== 0) return;
        const rng = createRng(`${seed}:burst:${lineIndex}`);
        const chosen = line.glyphs.filter(() => rng() < spec.density);
        // 至少一個：密度低、行又短時也要有。
        if (chosen.length === 0 && line.glyphs.length > 0) chosen.push(line.glyphs[Math.floor(rng() * line.glyphs.length)]!);
        const sweepStart = line.glyphs[0]?.start ?? 0;
        chosen.forEach((glyph, order) => triggers.push({
            lineIndex,
            glyphIndex: glyph.glyphIndex,
            time: spec.mode === 'sweep' ? sweepStart + order * SWEEP_STEP : glyph.start,
            size: 0.7 + rng() * 0.6,
            dy: (rng() - 0.5) * 0.9,
        }));
    });
    return triggers.sort((a, b) => a.time - b.time);
};

export interface BurstEvent {
    /** 引爆後的秒數。 */
    age: number;
    /** 爆點（邏輯像素）。 */
    x: number;
    y: number;
    /** 豎向光柱的長度（邏輯像素）。 */
    length: number;
    /** 光色（已乘過 tint）。 */
    color: Rgb;
}

interface BurstSprites {
    holder: Container;
    flash: Sprite;
    verticalGlow: Sprite;
    verticalCore: Sprite;
    horizontalGlow: Sprite;
    horizontalCore: Sprite;
    ring: Sprite;
}

export interface CrossBurstLayer {
    view: Container;
    update: (events: readonly BurstEvent[]) => void;
    destroy: () => void;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOutExpo = (value: number) => {
    const t = clamp01(value);
    return t >= 1 ? 1 : 1 - 2 ** (-10 * t);
};
const easeOutCubic = (value: number) => 1 - (1 - clamp01(value)) ** 3;

/** 一個小十字給光場的提亮（多個疊加時由調用方封頂）。 */
export const burstLightBoost = (age: number) => (age < 0 ? 0 : 0.18 * Math.exp(-age / 0.1));

export const createCrossBurst = (pixi: PixiModule, options: { sprites: LightSprites }): CrossBurstLayer => {
    const { sprites } = options;
    const view = new pixi.Container();
    const pool: BurstSprites[] = Array.from({ length: MAX_BURSTS }, () => {
        const holder = new pixi.Container();
        const make = (texture: typeof sprites.dot) => {
            const sprite = new pixi.Sprite(texture);
            sprite.anchor.set(0.5);
            holder.addChild(sprite);
            return sprite;
        };
        const ring = make(sprites.bokeh);
        const verticalGlow = make(sprites.streak);
        const horizontalGlow = make(sprites.streak);
        const verticalCore = make(sprites.streak);
        const horizontalCore = make(sprites.streak);
        const flash = make(sprites.dot);
        verticalGlow.rotation = Math.PI / 2;
        verticalCore.rotation = Math.PI / 2;
        holder.visible = false;
        view.addChild(holder);
        return { holder, flash, verticalGlow, verticalCore, horizontalGlow, horizontalCore, ring };
    });

    const update = (events: readonly BurstEvent[]) => {
        pool.forEach((burst, index) => {
            const event = events[index];
            if (!event || event.age < 0 || event.age > BURST_DURATION) {
                burst.holder.visible = false;
                return;
            }
            burst.holder.visible = true;
            const { age } = event;
            const L = event.length;
            const glowColor = hexOf(event.color);
            const coreColor = hexOf(mixRgb(event.color, WHITE, 0.75));
            // 30ms 點亮，之後快速衰減（0.16s 常數），0.6s 內基本消失。
            const envelope = clamp01(age / 0.03) * Math.exp(-Math.max(0, age - 0.03) / 0.16);
            const spread = 1 + age * 2;

            burst.holder.position.set(event.x, event.y);

            // 豎直光柱：從字腳下 0.3L 到字上方 0.7L（拉丁十字），80ms 內拉滿。
            const verticalLength = L * easeOutExpo(age / 0.08);
            for (const [sprite, thickness, alpha, tint] of [
                [burst.verticalGlow, L * 0.1 * spread, 0.6, glowColor],
                [burst.verticalCore, L * 0.02 * spread, 1, coreColor],
            ] as const) {
                sprite.position.set(0, -L * 0.2);
                sprite.width = Math.max(1, verticalLength);
                sprite.height = thickness;
                sprite.alpha = alpha * envelope;
                sprite.tint = tint;
            }

            // 橫條：晚 20ms，100ms 內展開，交點在光柱上段。
            const horizontalLength = L * 0.62 * easeOutExpo((age - 0.02) / 0.1);
            for (const [sprite, thickness, alpha, tint] of [
                [burst.horizontalGlow, L * 0.09 * spread, 0.55, glowColor],
                [burst.horizontalCore, L * 0.018 * spread, 0.95, coreColor],
            ] as const) {
                sprite.position.set(0, -L * 0.42);
                sprite.width = Math.max(1, horizontalLength);
                sprite.height = thickness;
                sprite.alpha = alpha * envelope * clamp01((age - 0.02) / 0.03);
                sprite.tint = tint;
            }

            // 引爆的白閃。
            const flashSize = L * (0.35 + age * 0.8);
            burst.flash.position.set(0, -L * 0.42);
            burst.flash.width = flashSize;
            burst.flash.height = flashSize;
            burst.flash.alpha = Math.exp(-age / 0.07);
            burst.flash.tint = coreColor;

            // 小衝擊環。
            const ring = easeOutCubic(age / 0.4);
            const ringSize = L * 0.9 * ring;
            burst.ring.position.set(0, -L * 0.42);
            burst.ring.width = ringSize;
            burst.ring.height = ringSize;
            burst.ring.alpha = 0.35 * (1 - ring) * clamp01(age / 0.03);
            burst.ring.tint = glowColor;
        });
    };

    return {
        view,
        update,
        destroy: () => view.destroy({ children: true }),
    };
};
