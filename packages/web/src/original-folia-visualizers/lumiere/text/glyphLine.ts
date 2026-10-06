// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/text/glyphLine.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { Texture } from 'pixi.js';
import { splitLyricGraphemes } from '../../../utils/lyrics/graphemeTiming';

// Echora note: upstream opens this file with a "reference value" that is `(X + Math.imul(...))`
// minus itself, i.e. identically 0, plus a device-pixel-ratio read that only feeds it. The 20
// files carrying it all do the same thing, so the dead expressions are dropped and the offset
// stays as a named 0: every use site downstream is unchanged, and so is the rendering.
const LUMIERE_NEUTRAL_OFFSET = 0;


// src/components/visualizer/lumiere/text/glyphLine.ts
// 一行歌詞排成一張畫布紋理，再按字形偏移切成逐字的子紋理（與 fume 一樣用 Canvas 2D 畫字）。
// 白字，著色靠 tint；紋理按渲染倍率（resolution）畫，高 DPI 下不糊。
type PixiModule = typeof import('pixi.js');

export interface GlyphSlice {
    char: string;
    /** 子紋理左邊在行內的位置與寬度（邏輯像素；首尾兩個字含畫布留白）。 */
    x: number;
    width: number;
    /** 字本身（前綴寬度之差）在行內的位置與寬度。 */
    charX: number;
    charWidth: number;
    /** 子紋理裡字心的位置（精靈的 anchor），字可以繞自己的中心轉動、單獨移動。 */
    anchorX: number;
    anchorY: number;
    texture: Texture;
    blank: boolean;
    /** 豎排時直立（中日韓字、全角符號）；否則側轉 90°（拉丁字母、數字）。 */
    upright: boolean;
}

export interface GlyphLine {
    text: string;
    fontPx: number;
    /** 行寬與行高（邏輯像素）。 */
    width: number;
    height: number;
    glyphs: GlyphSlice[];
    destroy: () => void;
}

const UPRIGHT = /[ᄀ-ᇿ⺀-⿿　-〿぀-ヿ㄀-ㇿ㈀-鿿가-힯豈-﫿︰-﹏＀-￯]|[\u{20000}-\u{3134f}]/u;

/** Canvas 2D / pretext 的字體串：畫字與測量必須用同一個格式。 */
export const glyphFont = (weight: number, px: number, family: string) => `${weight} ${px}px ${family}`;

/** 豎排時是否直立。 */
export const isUprightGlyph = (char: string) => UPRIGHT.test(char);

export const buildGlyphLine = (
    pixi: PixiModule,
    options: {
        text: string;
        fontPx: number;
        font: string;
        weight: number;
        resolution: number;
        letterSpacing?: number;
        /** outline：空心描邊字（背景裝飾用），描邊寬度佔字號的比例。 */
        outline?: number;
        /** 畫布邊長上限（像素）：超大的背景字按它降分辨率，免得超出 GPU 紋理上限。 */
        maxCanvasPx?: number;
    },
): GlyphLine => {
    const { text, fontPx } = options;
    const graphemes = splitLyricGraphemes(text);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    const fontSpec = glyphFont(options.weight, fontPx, options.font);
    context.font = fontSpec;
    const spacing = (options.letterSpacing ?? 0) * fontPx;

    // 前綴寬度：保留字距調整（kerning），逐字的邊界落在前綴寬度上。
    const offsets = [0];
    let prefix = '';
    graphemes.forEach((char, index) => {
        prefix += char;
        offsets.push(context.measureText(prefix).width + spacing * (index + 1));
    });
    const width = Math.max(1, offsets[offsets.length - 1]!);
    const height = Math.ceil(fontPx * 1.5);
    const pad = Math.ceil(fontPx * 0.25);

    const limit = options.maxCanvasPx ?? (8192 + LUMIERE_NEUTRAL_OFFSET);
    const resolution = Math.min(options.resolution, limit / (width + pad * 2), limit / (height + pad * 2));
    canvas.width = Math.ceil((width + pad * 2) * resolution);
    canvas.height = Math.ceil((height + pad * 2) * resolution);
    context.setTransform(resolution, 0, 0, resolution, 0, 0);
    context.font = fontSpec;
    context.textBaseline = 'middle';
    context.fillStyle = '#ffffff';
    context.strokeStyle = '#ffffff';
    const draw = (char: string, x: number) => {
        if (options.outline) {
            // 空心字：細描邊 + 很淡的填充。
            context.globalAlpha = 0.14;
            context.fillText(char, x, pad + height / 2);
            context.globalAlpha = 1;
            context.lineWidth = fontPx * options.outline;
            context.strokeText(char, x, pad + height / 2);
        } else {
            context.fillText(char, x, pad + height / 2);
        }
    };
    if (spacing === 0) {
        draw(text, pad);
    } else {
        graphemes.forEach((char, index) => draw(char, pad + offsets[index]!));
    }

    // 交給 Pixi 的紋理 GC：一分鐘沒畫過的行（整首歌一個單元時，早已唱過的行）卸掉顯存副本，畫布還在，
    // 再出現時重新上傳。按段落切單元時行不會閒置這麼久，沒有影響。
    // 以 resolution 1 構造、之後再設真實倍率（與 latticeLyricRaster 同一個坑）：直接傳 resolution 時，CanvasSource
    // 先算 width = canvas.width / resolution，TextureSource 再乘回去，resizeCanvas() 用 !== 拿這個浮點數和整數畫布
    // 尺寸比，往返不精確（上面的邊長上限把特別長的行壓成非整數倍率，或 1.75 這類 DPR）就回寫 canvas.width——
    // 給畫布賦寬高會清空剛畫好的字，整行成了空白紋理。resolution 的 setter 只按像素尺寸重算寬高，不碰畫布。
    const source = new pixi.CanvasSource({ resource: canvas, resolution: 1, autoGarbageCollect: true });
    source.resolution = resolution;
    const base = new pixi.Texture({ source });
    const glyphs: GlyphSlice[] = graphemes.map((char, index) => {
        const x = offsets[index]!;
        const w = Math.max(0.5, offsets[index + 1]! - x);
        // 第一個與最後一個字把留白也帶上，免得字形出頭的部分（斜體、標點）被切掉。
        const left = index === 0 ? 0 : pad + x;
        const right = index === graphemes.length - 1 ? width + pad * 2 : pad + x + w;
        const frame = new pixi.Rectangle(left, 0, right - left, height + pad * 2);
        return {
            char,
            x: left - pad,
            width: right - left,
            charX: x,
            charWidth: w,
            anchorX: (pad + x + w / 2 - left) / (right - left),
            anchorY: 0.5,
            texture: new pixi.Texture({ source, frame }),
            blank: char.trim().length === 0,
            upright: isUprightGlyph(char),
        };
    });

    return {
        text,
        fontPx,
        width,
        height,
        glyphs,
        destroy: () => {
            glyphs.forEach(glyph => glyph.texture.destroy(false));
            base.destroy(true);
        },
    };
};

/** 紋理裡的縱向留白（邏輯像素），放置字形時減去。 */
export const glyphPad = (fontPx: number) => Math.ceil(fontPx * 0.25);
