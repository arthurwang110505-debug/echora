// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/lumiereUnit.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { Theme } from '../../types';
import { profileOf } from './catalog';
import { cameraBetween, type Affine, type LumiereAudioFrame } from './lumiereKernel';
import type { LightSprites } from './light/sprites';
import type { LumiereParagraph, LumiereShot } from './program';
import { createLumiereScene, type LumiereScene, type SceneShot } from './scene';
import type { WindowTypography } from './text/lyricWindow';
import type { LumiereSceneTuning } from './types';

// src/components/visualizer/lumiere/lumiereUnit.ts
// 一個段落 → 一個場景單元：把編譯出的 LumiereParagraph 換成 createLumiereScene 的參數（鏡頭覆蓋的行換成
// 單元內的下標、熄燈轉場換成場景的收光窗口、按程序種子與段落 id 播種），再給出運鏡矩陣與當前鏡頭。
// 對應 lumisynth 繪光 adapter 的 buildUnit；運行時（phase B）每個可見段落建一個，按播放時間調 update。
type PixiModule = typeof import('pixi.js');

export interface LumiereUnitOptions {
    paragraph: LumiereParagraph;
    /** 畫面邏輯尺寸（CSS 像素）與渲染倍率（devicePixelRatio × 畫質縮放）。 */
    width: number;
    height: number;
    resolution: number;
    /** 程序種子（LumiereProgram.seed）；場景按 `${programSeed}:${paragraph.id}` 播種。 */
    programSeed: string;
    theme: Theme;
    tuning: LumiereSceneTuning;
    /** 全局共享的光點紋理（createLightSprites），由運行時持有與銷燬。 */
    sprites: LightSprites;
    audioAt?: (time: number) => LumiereAudioFrame;
    /** 統一覆蓋排版（不給則按光位）。 */
    typography?: WindowTypography;
}

export interface LumiereUnit {
    paragraph: LumiereParagraph;
    scene: LumiereScene;
    update: (time: number) => void;
    /**
     * 時刻 time 的運鏡矩陣：把沒有運鏡時的畫面座標映射到有運鏡時的座標（場景自己已經套過運鏡）。
     * 別的圖層要跟著場景運鏡時，用 `container.setFromMatrix(new pixi.Matrix(m.a, m.b, m.c, m.d, m.tx, m.ty))`。
     */
    cameraMatrix: (time: number) => Affine;
    /** 時刻 time 的鏡頭（第一個鏡頭之前算第一個）。 */
    shotAt: (time: number) => LumiereShot | undefined;
    destroy: () => void;
}

/** 段落的鏡頭 → 場景鏡頭：行號換成單元內的下標（options.lines = paragraph.lines）。 */
export const buildLumiereSceneShots = (paragraph: LumiereParagraph): SceneShot[] => {
    const localLine = new Map(paragraph.lineIndices.map((lineIndex, index) => [lineIndex, index]));
    const shots: SceneShot[] = paragraph.shots.map(shot => ({
        profile: profileOf(shot.kind),
        startTime: shot.startTime,
        endTime: shot.endTime,
        lines: shot.lineIndices.map(index => localLine.get(index)).filter((index): index is number => index !== undefined),
    }));
    if (shots.length === 0) {
        // 編譯器保證每段至少一個鏡頭；防禦：給一個覆蓋整段的天井。
        shots.push({ profile: profileOf(''), startTime: paragraph.startTime, endTime: paragraph.endTime, lines: [] });
    }
    return shots;
};

export const createLumiereUnit = (pixi: PixiModule, options: LumiereUnitOptions): LumiereUnit => {
    const { paragraph } = options;
    const scene = createLumiereScene(pixi, {
        width: options.width,
        height: options.height,
        resolution: options.resolution,
        seed: `${options.programSeed}:${paragraph.id}`,
        theme: options.theme,
        tuning: options.tuning,
        lines: paragraph.lines,
        shots: buildLumiereSceneShots(paragraph),
        startTime: paragraph.startTime,
        endTime: paragraph.endTime,
        sprites: options.sprites,
        opening: paragraph.opening,
        fadeOut: paragraph.transitionOut?.kind === 'lights-out'
            ? { start: paragraph.transitionOut.startTime, end: paragraph.transitionOut.endTime }
            : null,
        audioAt: options.audioAt,
        typography: options.typography,
        sections: paragraph.sections,
    });
    const shotAt = (time: number) => {
        let found = paragraph.shots[0];
        for (const shot of paragraph.shots) if (shot.startTime <= time) found = shot;
        return found;
    };
    return {
        paragraph,
        scene,
        update: time => scene.update(time),
        cameraMatrix: time => cameraBetween(scene.rest, scene.camera(time)),
        shotAt,
        destroy: () => scene.destroy(),
    };
};
