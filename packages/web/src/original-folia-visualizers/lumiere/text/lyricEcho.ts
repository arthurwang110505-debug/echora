// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/text/lyricEcho.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { Container, Sprite } from 'pixi.js';
import type { Line } from '../../../types';
import { createRng } from '../lumiereRandom';
import { compressLight, lightAt, type ResolvedBeam } from '../light/rig';
import { splitLyricGraphemes } from '../../../utils/lyrics/graphemeTiming';
import { buildGlyphLine, type GlyphLine } from './glyphLine';
import { buildGlyphTimings } from './reveal';
import { segmentWords } from './wordStyle';
import type { WordColorMatcher } from '../../wordColoring';
import { hexOf, type Rgb } from '../color';
import { keywordEchoColor, resolveGlyphKeywordColors } from './keywordColors';

// src/components/visualizer/lumiere/text/lyricEcho.ts
// 背景的歌詞裝飾：不是整句，而是「採集」來的分詞。每個詞被唱到時，就在主光源附近出現一個巨大的空心字
// 碎片，隨後沿主光束的方向（跟著光束的擺動）緩慢漂下去，約 7 秒淡出；碎片的大小、傾斜、拉伸按種子，
// 許多碎片在光束裡互相重疊。漂的過程中詞會被拆開：字彼此散開、轉動、斜切。平時很淡，光束裡被照亮。
// 每一幀只由 t 決定。
//
// 按需柵格化：隨機量（落點、拆開方向）構建時一次抽完，與一次畫完整個單元時逐項相同；巨大的空心字畫布只在
// 這一行第一個碎片出現前 PREPARE 秒才畫（一幀最多提前畫一行），最後一個碎片消失後就釋放。整首歌一個單元
// （軌跡過渡）時背景字的畫布與紋理也只有正在漂的幾行，構建時不再畫整首歌的字。
type PixiModule = typeof import('pixi.js');

export interface LyricEchoOptions {
    width: number;
    height: number;
    lines: Line[];
    font: string;
    weight: number;
    resolution: number;
    seed: string;
    /** 碎片最大的字號（佔畫面高度）。 */
    size: number;
    /** 整體亮度倍率。 */
    opacity: number;
    /** 關鍵字著色的匹配器：關鍵字的碎片帶一點關鍵字色。不給或為空則不著色。 */
    keywords?: readonly WordColorMatcher[];
}

export interface LyricEchoFrame {
    time: number;
    beams: readonly ResolvedBeam[];
    color: number;
    intensity: number;
}

/** 一個碎片存在多久（秒）、沿光束漂多快（高度單位 / 秒）、從離光源多遠的地方出現。 */
const LIFE = 7;
const SPEED = 0.075;
const BIRTH_DISTANCE = 0.08;
/** 碎片出現前多久把這一行的空心字畫好（秒）。 */
const PREPARE = 3;

interface Fragment {
    /** 詞被唱到的時刻。 */
    birth: number;
    /** 橫向位置（佔光束半寬的倍數，−1.4..1.4）與漂移速度倍率。 */
    across: number;
    speed: number;
    /** 字號倍率（相對最大字號）、傾斜、橫向拉伸、斜切增長、自轉速度。 */
    scale: number;
    rotation: number;
    stretch: number;
    shear: number;
    spin: number;
    /** 詞在行裡的字（字形序號）範圍。 */
    start: number;
    end: number;
    glyphs: Array<{
        /** 這一行畫好之後才有。 */
        sprite: Sprite | null;
        blank: boolean;
        /** 字在詞裡的位置（邏輯像素，按最大字號）；畫好之後才有。 */
        offset: number;
        /** 拆開時的方向（單位向量）與速度、自己的轉動。 */
        dx: number;
        dy: number;
        speed: number;
        spin: number;
        /** 關鍵字色（不是關鍵字為 null）。 */
        keyword: Rgb | null;
    }>;
}

/** 一行：它的碎片（fragments 裡的下標範圍）、第一個與最後一個碎片出現的時刻、畫好的空心字（沒畫時為 null）。 */
interface EchoLine {
    text: string;
    first: number;
    last: number;
    from: number;
    to: number;
    layout: GlyphLine | null;
}

export interface LyricEcho {
    view: Container;
    update: (frame: LyricEchoFrame) => void;
    destroy: () => void;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
    const t = clamp01(value);
    return t * t * (3 - 2 * t);
};

export const createLyricEcho = (pixi: PixiModule, options: LyricEchoOptions): LyricEcho => {
    const { height } = options;
    const rng = createRng(`${options.seed}:echo`);
    const view = new pixi.Container();
    const fontPx = options.size * height;
    // 背景字本來就淡，分辨率不需要高；畫布邊長也封頂。
    const resolution = Math.min(options.resolution, 1.5);
    const fragments: Fragment[] = [];
    const holders: Container[] = [];
    const echoLines: EchoLine[] = [];

    // 隨機量一次抽完（順序與一次畫完時相同）；字形只按字素數算（與 buildGlyphLine 同一個切分），不畫。
    options.lines.forEach(line => {
        const graphemes = splitLyricGraphemes(line.fullText);
        const timings = buildGlyphTimings(line);
        const keywordColors = options.keywords && options.keywords.length > 0
            ? resolveGlyphKeywordColors(line.fullText, options.keywords)
            : null;
        const first = fragments.length;
        segmentWords(line).forEach(word => {
            if (word.blank) return;
            const end = Math.min(word.end, graphemes.length);
            if (end <= word.start) return;
            const holder = new pixi.Container();
            view.addChild(holder);
            holders.push(holder);
            fragments.push({
                birth: timings[word.start]?.start ?? line.startTime,
                across: (rng() - 0.5) * 2.8,
                speed: 0.7 + rng() * 0.7,
                scale: 0.4 + rng() * 0.6,
                rotation: (rng() - 0.5) * 0.9,
                stretch: 0.75 + rng() * 0.7,
                shear: (rng() - 0.5) * 0.12,
                spin: (rng() - 0.5) * 0.08,
                start: word.start,
                end,
                glyphs: graphemes.slice(word.start, end).map((char, offsetInWord) => {
                    const angle = rng() * Math.PI * 2;
                    return {
                        sprite: null,
                        blank: char.trim().length === 0,
                        offset: 0,
                        dx: Math.cos(angle),
                        dy: Math.sin(angle),
                        speed: 0.3 + rng() * 0.9,
                        spin: (rng() - 0.5) * 0.5,
                        keyword: keywordColors?.[word.start + offsetInWord] ?? null,
                    };
                }),
            });
        });
        const births = fragments.slice(first).map(fragment => fragment.birth);
        if (births.length === 0) return;
        echoLines.push({
            text: line.fullText,
            first,
            last: fragments.length,
            from: Math.min(...births),
            to: Math.max(...births),
            layout: null,
        });
    });

    /** 畫這一行的空心字，把字形掛到它的碎片上。 */
    const rasterize = (echoLine: EchoLine) => {
        const layout = buildGlyphLine(pixi, {
            text: echoLine.text,
            fontPx,
            font: options.font,
            weight: options.weight,
            resolution,
            letterSpacing: 0.04,
            outline: 0.012,
            maxCanvasPx: 4096,
        });
        echoLine.layout = layout;
        for (let index = echoLine.first; index < echoLine.last; index += 1) {
            const fragment = fragments[index]!;
            const slices = layout.glyphs.slice(fragment.start, fragment.end);
            const left = slices[0]!.charX;
            const right = slices[slices.length - 1]!.charX + slices[slices.length - 1]!.charWidth;
            const middle = (left + right) / 2;
            fragment.glyphs.forEach((glyph, offsetInWord) => {
                const slice = slices[offsetInWord]!;
                const sprite = new pixi.Sprite(slice.texture);
                sprite.anchor.set(slice.anchorX, slice.anchorY);
                sprite.visible = !glyph.blank;
                holders[index]!.addChild(sprite);
                glyph.sprite = sprite;
                glyph.offset = slice.charX + slice.charWidth / 2 - middle;
            });
        }
    };
    /** 釋放這一行的空心字（精靈與畫布紋理）。 */
    const release = (echoLine: EchoLine) => {
        for (let index = echoLine.first; index < echoLine.last; index += 1) {
            holders[index]!.removeChildren().forEach(child => child.destroy());
            fragments[index]!.glyphs.forEach(glyph => { glyph.sprite = null; });
        }
        echoLine.layout?.destroy();
        echoLine.layout = null;
    };
    /**
     * 按時間畫 / 釋放：碎片已經出現的行立刻畫；快出現的行一幀最多提前畫一行（把畫字的開銷攤開）；
     * 碎片全部消失、或時間退回到出現之前的行釋放。
     */
    const prepare = (time: number) => {
        let budget = 1;
        for (const echoLine of echoLines) {
            if (time < echoLine.from - PREPARE || time > echoLine.to + LIFE) {
                if (echoLine.layout) release(echoLine);
            } else if (!echoLine.layout && (time >= echoLine.from || budget-- > 0)) {
                rasterize(echoLine);
            }
        }
    };
    // 關鍵字碎片的顏色按光色緩存（光色通常整個單元不變）。
    const hasKeywords = fragments.some(fragment => fragment.glyphs.some(glyph => glyph.keyword));
    const keywordHex = new Map<Rgb, number>();
    let keywordFor = -1;
    const keywordTint = (color: number, keyword: Rgb) => {
        if (color !== keywordFor) {
            keywordHex.clear();
            keywordFor = color;
        }
        let hex = keywordHex.get(keyword);
        if (hex === undefined) {
            const light: Rgb = [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255];
            hex = hexOf(keywordEchoColor(light, keyword));
            keywordHex.set(keyword, hex);
        }
        return hex;
    };

    const update = ({ time, beams, color, intensity }: LyricEchoFrame) => {
        prepare(time);
        // 主光束（第一束）的幾何：原點、方向、半寬；沒有光束時退回畫面頂部中央豎直向下。
        const beam = beams[0];
        const ox = beam?.ox ?? (options.width / height) / 2;
        const oy = beam?.oy ?? 0;
        const bx = beam?.dx ?? 0;
        const by = beam?.dy ?? 1;
        const halfAt = (distance: number) => (beam ? beam.halfWidth + distance * beam.tanSpread : 0.08) + 0.04;

        fragments.forEach((fragment, index) => {
            const holder = holders[index]!;
            const age = time - fragment.birth;
            const presence = smooth(age / 0.9) * (1 - smooth((age - (LIFE - 2.5)) / 2.5));
            const alpha = presence * intensity * options.opacity;
            holder.visible = age >= 0 && age <= LIFE && alpha > 0.003;
            if (!holder.visible) return;
            // 沿光束漂：離光源的距離隨時間增長，橫向位置按光束在那裡的半寬換算（光束擺動時跟著走）。
            const distance = BIRTH_DISTANCE + SPEED * fragment.speed * age;
            const across = fragment.across * halfAt(distance);
            const x = (ox + bx * distance - by * across) * height;
            const y = (oy + by * distance + bx * across) * height;
            holder.position.set(x, y);
            holder.rotation = fragment.rotation + fragment.spin * age;
            holder.scale.set(fragment.scale * fragment.stretch, fragment.scale);
            holder.skew.set(fragment.shear * age, 0);
            // 拆開：字彼此散開（按 age^1.3 加速）、各自轉動。
            const split = 0.05 * age ** 1.3;
            const lit = compressLight(lightAt(beams, x / height, y / height));
            const glyphAlpha = alpha * (0.05 + 0.4 * lit);
            for (const glyph of fragment.glyphs) {
                if (!glyph.sprite) continue;
                glyph.sprite.position.set(
                    glyph.offset + glyph.dx * fontPx * split * glyph.speed,
                    glyph.dy * fontPx * split * glyph.speed,
                );
                glyph.sprite.rotation = glyph.spin * split * 4;
                glyph.sprite.alpha = glyphAlpha;
                glyph.sprite.tint = hasKeywords && glyph.keyword ? keywordTint(color, glyph.keyword) : color;
            }
        });
    };

    return {
        view,
        update,
        destroy: () => {
            view.destroy({ children: true });
            echoLines.forEach(echoLine => echoLine.layout?.destroy());
        },
    };
};
