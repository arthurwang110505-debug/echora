// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/lumiereCreditsLayer.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { Container } from 'pixi.js';
import type { Theme } from '../../types';
import { createLumiereCredits, hasLumiereCredits, resolveLumiereCreditsFrame, type LumiereCredits } from './credits';
import type { CreditsFrame, SongMetadata } from './lumiereKernel';
import type { LumiereProgram } from './lumiereProgram';
import { applyLumiereSceneQuality, type LumiereSceneQuality } from './lumiereSceneEntry';
import type { LightSprites } from './light/sprites';
import type { LumiereSceneTuning } from './types';

// src/components/visualizer/lumiere/lumiereCreditsLayer.ts
// 運行時裡的片尾卡層：最後一句唱完前幾秒才建（它有自己的光場、線稿和曲名光柵化，整首歌都掛著不划算），
// 歌曲信息、主題、尺寸或需要重建的 tuning 變了就作廢，下次需要時再建。純音樂（lyricEndTime 為 null）
// 與沒有任何歌曲信息時沒有片尾卡，歌詞也不會淡出。
type PixiModule = typeof import('pixi.js');

/** 最後一句唱完前多少秒開始預建。 */
const PREBUILD_SECONDS = 4;

const INACTIVE: CreditsFrame = { active: false, lyricAlpha: 1, lyricBlur: 0, posterAlpha: 0, posterOffsetY: 0, posterScale: 1 };

export interface LumiereCreditsMetadata {
    title?: string | null;
    artist?: string | null;
    album?: string | null;
}

export interface LumiereCreditsBuildContext {
    width: number;
    height: number;
    resolution: number;
    theme: Theme;
    metadata: LumiereCreditsMetadata;
    tuning: LumiereSceneTuning;
    quality: LumiereSceneQuality;
}

const toSongMetadata = (metadata: LumiereCreditsMetadata): SongMetadata => ({
    title: metadata.title ?? null,
    artist: metadata.artist ?? null,
    album: metadata.album ?? null,
});

export class LumiereCreditsLayer {
    readonly holder: Container;
    private credits: LumiereCredits | null = null;
    private lyricEndTime = 0;

    constructor(private readonly pixi: PixiModule, private readonly sprites: LightSprites) {
        this.holder = new pixi.Container();
        this.holder.visible = false;
    }

    get built() {
        return this.credits !== null;
    }

    hasMetadata(metadata: LumiereCreditsMetadata) {
        return hasLumiereCredits(toSongMetadata(metadata));
    }

    /** 片尾時間線幀；沒有片尾卡時恆為 inactive（歌詞不淡出）。 */
    resolveFrame(time: number, program: LumiereProgram, metadata: LumiereCreditsMetadata): CreditsFrame {
        if (program.lyricEndTime === null || !this.hasMetadata(metadata)) return INACTIVE;
        this.lyricEndTime = program.lyricEndTime;
        return resolveLumiereCreditsFrame(time, program.lyricEndTime);
    }

    needsBuild(time: number, program: LumiereProgram, metadata: LumiereCreditsMetadata) {
        return !this.credits
            && program.lyricEndTime !== null
            && time >= program.lyricEndTime - PREBUILD_SECONDS
            && this.hasMetadata(metadata);
    }

    build(context: LumiereCreditsBuildContext) {
        this.invalidate();
        this.credits = createLumiereCredits(this.pixi, {
            width: context.width,
            height: context.height,
            resolution: context.resolution,
            theme: context.theme,
            metadata: toSongMetadata(context.metadata),
            tuning: context.tuning,
            sprites: this.sprites,
        });
        applyLumiereSceneQuality(this.credits, context.quality);
        this.holder.addChild(this.credits.view);
        this.holder.pivot.set(context.width / 2, context.height / 2);
    }

    applyQuality(quality: LumiereSceneQuality) {
        if (this.credits) applyLumiereSceneQuality(this.credits, quality);
    }

    /** 片尾卡以畫面中心縮放、上下偏移；沒激活時整層不畫。 */
    update(time: number, frame: CreditsFrame, width: number, height: number) {
        const credits = this.credits;
        this.holder.visible = Boolean(credits) && frame.active && frame.posterAlpha > 0.002;
        if (!credits || !this.holder.visible) return;
        this.holder.alpha = frame.posterAlpha;
        this.holder.position.set(width / 2, height / 2 + frame.posterOffsetY * height);
        this.holder.scale.set(frame.posterScale);
        credits.update(time - this.lyricEndTime);
    }

    /** 作廢當前片尾卡（下次需要時重建）。 */
    invalidate() {
        if (!this.credits) return;
        const credits = this.credits;
        this.credits = null;
        this.holder.removeChild(credits.view);
        // 運行時掛的共享直通 filter 不歸片尾卡銷燬。
        credits.graphics.filters = [];
        credits.destroy();
        this.holder.visible = false;
    }

    destroy() {
        this.invalidate();
        this.holder.destroy({ children: true });
    }
}
