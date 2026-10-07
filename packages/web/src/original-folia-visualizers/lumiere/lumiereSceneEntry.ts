// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/lumiereSceneEntry.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { BlurFilter, Container, Filter } from 'pixi.js';
import type { Theme } from '../../types';
import { applyLumiereGroupQuality, detachLumierePassthrough } from './lumiereGroupFilters';
import type { LumiereAudioFrame } from './lumiereKernel';
import type { LumiereProgram } from './lumiereProgram';
import { createLumiereUnit, type LumiereUnit } from './lumiereUnit';
import type { LightSprites } from './light/sprites';
import { LUMIERE_BLOOM, type LumiereSceneTuning } from './types';

// src/components/visualizer/lumiere/lumiereSceneEntry.ts
// 運行時緩存裡的一個段落場景：LumiereUnit 外面再包一層運行時自己的 holder。轉場的透明度、縮放和模糊
// 都套在 holder 上——場景自己在內部舞臺上做運鏡，scene.view 不動，兩套變換互不覆蓋。
type PixiModule = typeof import('pixi.js');

export interface LumiereSceneEntry {
    index: number;
    unit: LumiereUnit;
    holder: Container;
    /** 轉場 / 片尾失焦用的模糊，第一次需要時才建。 */
    blur: BlurFilter | null;
}

/** 圖形組、文字組的畫質參數（運行時按 tuning 與畫質檔算好，所有場景共用）。 */
export interface LumiereSceneQuality {
    bloom: number;
    textBloom: number;
    /** 圖形組 filter 分辨率；null = 滿分辨率。 */
    graphicsResolution: number | null;
    bloomLevelDrop: number;
    passthrough: Filter | null;
}

export interface LumiereSceneBuildContext {
    width: number;
    height: number;
    /** 文字光柵化與合成用的渲染分辨率（滿分辨率，不隨畫質降）。 */
    resolution: number;
    program: LumiereProgram;
    theme: Theme;
    tuning: LumiereSceneTuning;
    sprites: LightSprites;
    audioAt: (time: number) => LumiereAudioFrame;
    showText: boolean;
    quality: LumiereSceneQuality;
}

/** 模糊低於這個強度就摘掉 filter：一個掛著不用的 filter 也要多一次整屏離屏渲染。 */
const BLUR_EPSILON = 0.3;

export const applyLumiereSceneQuality = (
    groups: { graphics: Container; text: Container },
    quality: LumiereSceneQuality,
) => {
    applyLumiereGroupQuality(groups.graphics, {
        preset: LUMIERE_BLOOM.graphics,
        multiplier: quality.bloom,
        resolution: quality.graphicsResolution,
        levelDrop: quality.bloomLevelDrop,
        passthrough: quality.passthrough,
    });
    applyLumiereGroupQuality(groups.text, {
        preset: LUMIERE_BLOOM.text,
        multiplier: quality.textBloom,
        resolution: null,
        levelDrop: 0,
        passthrough: null,
    });
};

/** 建一個段落場景（整個運行時裡最貴的調用：光柵化這一段的全部歌詞）。 */
export const buildLumiereSceneEntry = (
    pixi: PixiModule,
    context: LumiereSceneBuildContext,
    index: number,
): LumiereSceneEntry => {
    const { width, height } = context;
    const unit = createLumiereUnit(pixi, {
        paragraph: context.program.paragraphs[index]!,
        width,
        height,
        resolution: context.resolution,
        programSeed: context.program.seed,
        theme: context.theme,
        tuning: context.tuning,
        sprites: context.sprites,
        audioAt: context.audioAt,
    });
    unit.scene.text.visible = context.showText;
    applyLumiereSceneQuality(unit.scene, context.quality);
    const holder = new pixi.Container();
    holder.addChild(unit.scene.view);
    holder.pivot.set(width / 2, height / 2);
    holder.position.set(width / 2, height / 2);
    holder.zIndex = index;
    return { index, unit, holder, blur: null };
};

/** 套轉場幀：透明度、以畫面中心為原點的縮放、模糊（按需掛 / 摘）。 */
export const applyLumiereLayerFrame = (
    pixi: PixiModule,
    entry: LumiereSceneEntry,
    frame: { alpha: number; scale: number; blur: number },
    blurResolution: number,
) => {
    entry.holder.alpha = frame.alpha;
    entry.holder.scale.set(frame.scale);
    if (frame.blur > BLUR_EPSILON) {
        if (!entry.blur) {
            // 模糊的內容不需要滿分辨率：半分辨率跑模糊，開銷是整屏的四分之一。
            entry.blur = new pixi.BlurFilter({ strength: frame.blur, quality: 3, resolution: blurResolution });
        }
        entry.blur.strength = frame.blur;
        if (!entry.holder.filters?.includes(entry.blur)) entry.holder.filters = [entry.blur];
    } else if (entry.holder.filters?.length) {
        entry.holder.filters = [];
    }
};

export const destroyLumiereSceneEntry = (entry: LumiereSceneEntry, passthrough: Filter | null) => {
    entry.holder.parent?.removeChild(entry.holder);
    entry.holder.filters = [];
    entry.blur?.destroy();
    entry.blur = null;
    // 共享的直通 filter 先摘下來，場景的 destroy 只處理它自己建的 bloom。
    detachLumierePassthrough(entry.unit.scene.graphics, passthrough);
    entry.holder.removeChild(entry.unit.scene.view);
    entry.unit.destroy();
    entry.holder.destroy();
};
