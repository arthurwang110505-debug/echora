// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/credits.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { Line, Theme } from '../../types';
import { createRng } from './lumiereRandom';
import { resolveThemeFontStack, resolveThemeFontWeight } from '../../utils/fontStacks';
import type { CreditsFrame, SongMetadata } from './lumiereKernel';
import { hexOf, type Rgb } from './color';
import { createBloomFilter } from './light/bloomFilter';
import { createLightField } from './light/lightFieldShader';
import { createMotes } from './light/motes';
import { resolveBeams, type LightRig } from './light/rig';
import type { LightSprites } from './light/sprites';
import { createLineArt } from './lineart/lineArt';
import { mergeSpecs, protractorHalo, scatteredSparks, viewfinderFrame } from './lineart/recipes';
import { FOG, GLARE, MOTES, shaft } from './rigs/base';
import { LUMIERE_SHADER_NO_DARK, resolveLumierePalette } from './scene';
import { createLyricWindow } from './text/lyricWindow';
import { LUMIERE_BLOOM, type LumiereSceneTuning } from './types';

// Echora note: upstream opens this file with a "reference value" that is `(X + Math.imul(...))`
// minus itself, i.e. identically 0, plus a device-pixel-ratio read that only feeds it. The 20
// files carrying it all do the same thing, so the dead expressions are dropped and the offset
// stays as a named 0: every use site downstream is unchanged, and so is the rendering.
const LUMIERE_NEUTRAL_OFFSET = 0;


// src/components/visualizer/lumiere/credits.ts
// 繪光的片尾卡：最後一句唱完，歌詞失焦熄去，一束天井光重新落下，曲名在光裡逐字點亮
// （與歌詞同一套刻字、閃光與光暈），藝人在上、專輯在下慢慢顯影；量角器光環與取景框描出來。
// 全部只由片尾開始後的時間決定（可隨意拖動進度）。
type PixiModule = typeof import('pixi.js');

const smooth = (value: number) => {
    const t = Math.min(1, Math.max(0, value));
    return t * t * (3 - 2 * t);
};

/** 曲名開始點亮的時刻（片尾卡內的時間），以及每個字的時長上限。 */
const TITLE_START = 1.5 + LUMIERE_NEUTRAL_OFFSET;
const TITLE_SPAN = 2.4;
const TITLE_STEP = 0.14;

/**
 * 片尾的時間線：歌詞 1.6 秒內失焦熄去（像熄燈）；片尾卡從 0.5 秒起 1.4 秒淡入、略微放大到位。
 * 卡里的光與字自己再慢慢點亮（見 update）。
 */
export const resolveLumiereCreditsFrame = (time: number, finalEndTime: number): CreditsFrame => {
    const elapsed = time - finalEndTime;
    if (elapsed <= 0) return { active: false, lyricAlpha: 1, lyricBlur: 0, posterAlpha: 0, posterOffsetY: 0, posterScale: 0.985 };
    const exit = smooth(elapsed / 1.6);
    const enter = smooth((elapsed - 0.5) / 1.4);
    return {
        active: true,
        lyricAlpha: 1 - exit,
        lyricBlur: exit * 10,
        posterAlpha: enter,
        posterOffsetY: 0,
        posterScale: 0.985 + 0.015 * enter,
    };
};

const clean = (value: string | null | undefined) => value?.trim() ?? '';

export const hasLumiereCredits = (metadata: SongMetadata) => Boolean(clean(metadata.title) || clean(metadata.artist) || clean(metadata.album));

/** 把曲名做成一行「歌詞」：每個字依次點亮。 */
const titleLine = (title: string): Line => {
    const chars = Array.from(title);
    const step = Math.min(TITLE_STEP, TITLE_SPAN / Math.max(chars.length, 1));
    return {
        fullText: title,
        startTime: TITLE_START,
        endTime: TITLE_START + step * chars.length + 0.6,
        words: chars.map((text, i) => ({ text, startTime: TITLE_START + i * step, endTime: TITLE_START + (i + 1) * step })),
    };
};

export interface LumiereCredits {
    view: import('pixi.js').Container;
    /** 圖形組與文字組（運行時按畫質調整 bloom 與分辨率）。 */
    graphics: import('pixi.js').Container;
    text: import('pixi.js').Container;
    update: (elapsed: number) => void;
    destroy: () => void;
}

export const createLumiereCredits = (pixi: PixiModule, options: {
    width: number;
    height: number;
    resolution: number;
    theme: Theme;
    metadata: SongMetadata;
    tuning: LumiereSceneTuning;
    sprites: LightSprites;
}): LumiereCredits => {
    const { width, height, tuning, sprites, theme } = options;
    const aspect = width / height;
    const palette = resolveLumierePalette(theme, tuning.themeColorMix);
    const lightHex = hexOf(palette.light);
    const title = clean(options.metadata.title);
    const artist = clean(options.metadata.artist);
    const album = clean(options.metadata.album);
    const random = createRng('lumiere:credits');

    // 光：一束落在曲名上的天井光，外面一圈淡淡的光扇。
    const rig: LightRig = {
        beams: [
            shaft({ spread: 0.1, width: 0.06, length: 0.9, intensity: 0.85 }),
            shaft({ spread: 0.3, width: 0.1, length: 0.6, softness: 0.9, intensity: 0.22, streaks: 0.85, streakFreq: 26, core: 0.3 }),
        ],
        fog: { ...FOG, density: 0.9 },
        glare: { ...GLARE, intensity: 0.8 },
    };

    const view = new pixi.Container();
    const graphics = new pixi.Container();
    const field = createLightField(pixi, width, height);
    const art = createLineArt(pixi, {
        height,
        spec: mergeSpecs(
            protractorHalo({ cx: aspect * 0.5, cy: 0.03, radius: 0.3, alpha: 0.55 }),
            viewfinderFrame({ aspect, left: 0.16, top: 0.27, right: 0.84, bottom: 0.7, delay: 0.1, alpha: 0.32 }),
            scatteredSparks({ aspect, count: 14, random, delay: 0.3 }),
        ),
        starTexture: sprites.star,
    });
    art.view.visible = tuning.lineArt;
    const motes = createMotes(pixi, {
        width, height, seed: 'lumiere:credits:motes', texture: sprites.dot,
        spec: { ...MOTES, count: Math.round(MOTES.count * tuning.moteAmount) },
    });
    graphics.addChild(field.view, art.view, motes.view);
    graphics.filterArea = new pixi.Rectangle(0, 0, width, height);

    const text = new pixi.Container();
    const font = resolveThemeFontStack(theme);
    const window = title
        ? createLyricWindow(pixi, {
            width,
            height,
            lines: [titleLine(title)],
            font,
            weight: resolveThemeFontWeight(theme, 600),
            resolution: options.resolution,
            region: { cx: 0.5 * aspect, cy: 0.49, w: 0.6 * aspect, h: 0.2 },
            heroPx: 0.1 * height,
            neighbors: 1,
            typography: 'horizontal',
            decay: { strength: 0, delay: 1 },
            drift: 0,
            seed: 'lumiere:credits:title',
            sprites,
            letterSpacing: 0.06,
        })
        : null;
    if (window) text.addChild(window.view);

    const detailStyle = (size: number, color: Rgb, spacing: number) => new pixi.TextStyle({
        fontFamily: font,
        fontWeight: String(resolveThemeFontWeight(theme, 500)) as import('pixi.js').TextStyleFontWeight,
        fontSize: size,
        fill: hexOf(color),
        letterSpacing: size * spacing,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: width * 0.6,
    });
    const detailSize = Math.max(13, height * 0.028);
    const details = [
        artist ? { text: artist.toLocaleUpperCase(), y: 0.35, size: detailSize, spacing: 0.32, color: palette.lit, delay: 0.9 } : null,
        album ? { text: album, y: 0.65, size: detailSize * 0.85, spacing: 0.16, color: palette.unlit, delay: 1.2 } : null,
    ].filter(item => item !== null).map(item => {
        const label = new pixi.Text({ text: item.text, style: detailStyle(item.size, item.color, item.spacing), resolution: options.resolution });
        label.anchor.set(0.5);
        label.position.set(width / 2, item.y * height);
        label.alpha = 0;
        text.addChild(label);
        return { label, delay: item.delay + (title ? TITLE_START + Math.min(TITLE_SPAN, TITLE_STEP * Array.from(title).length) - 0.6 : 0) };
    });

    view.addChild(graphics, text);
    const graphicsBloom = createBloomFilter(pixi, { ...LUMIERE_BLOOM.graphics, strength: LUMIERE_BLOOM.graphics.strength * tuning.bloom, padding: 0, tint: [1, 1, 1] });
    const textBloom = createBloomFilter(pixi, { ...LUMIERE_BLOOM.text, strength: LUMIERE_BLOOM.text.strength * tuning.textBloom, padding: 0, tint: [1, 1, 1] });
    // 與場景的文字組相同：固定的 bloom 區域（被視口裁剪成整個畫面），光暈才不會隨字的運動抖動。
    text.filterArea = new pixi.Rectangle(-width, -height, width * 3, height * 3);
    graphics.filters = tuning.bloom > 0 ? [graphicsBloom] : [];
    text.filters = tuning.textBloom > 0 ? [textBloom] : [];
    // 僅顯示歌詞文字：片尾卡只留曲名與藝人 / 專輯，光、煙、線稿、浮塵不畫。
    graphics.renderable = !tuning.textOnly;

    const update = (elapsed: number) => {
        const time = Math.max(0, elapsed);
        // 光從 0.6 秒起 1.6 秒升滿，點亮的一瞬光源處閃一下。
        const rise = smooth((time - 0.6) / 1.6);
        const ignite = time >= 0.9 ? 1.2 * Math.exp(-(time - 0.9) / 0.4) : 0;
        const beams = resolveBeams(rig, time, aspect, { intensity: rise * tuning.lightIntensity, bass: 0, color: palette.light, local: time });
        if (!tuning.textOnly) {
            field.update({
                beams,
                rig,
                time,
                fogScale: tuning.fogDensity,
                color: palette.light,
                glareScale: rise * tuning.lightIntensity * (1 + ignite),
                dark: LUMIERE_SHADER_NO_DARK,
                octaves: tuning.fogOctaves,
            });
            const draw = (time - 0.8) / 3.6;
            art.view.visible = tuning.lineArt && draw > 0;
            if (art.view.visible) art.update(time, draw, smooth((time - 0.8) / 1.2), beams, lightHex);
            motes.update(time, beams, lightHex, rise);
        }
        window?.update({
            time,
            beams,
            litColor: palette.lit,
            unlitColor: palette.unlit,
            unlitAlpha: tuning.unlitOpacity,
            hideTrails: tuning.hideTrails,
            intensity: smooth((time - 0.4) / 0.8),
        });
        details.forEach(({ label, delay }) => {
            label.alpha = smooth((time - delay) / 1.4) * 0.9;
        });
    };
    update(0);

    return {
        view,
        graphics,
        text,
        update,
        destroy: () => {
            graphics.filters = [];
            text.filters = [];
            graphicsBloom.destroy();
            textBloom.destroy();
            field.destroy();
            art.destroy();
            motes.destroy();
            window?.destroy();
            view.destroy({ children: true });
        },
    };
};
