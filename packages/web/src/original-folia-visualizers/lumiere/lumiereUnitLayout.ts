// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/lumiereUnitLayout.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { Theme } from '../../types';
import type { TransformParams } from './lumiereKernel';
import type { LumiereSection } from './program';
import type { WindowTypography } from './text/lyricWindow';
import type { LumiereProfile } from './types';

// src/components/visualizer/lumiere/lumiereUnitLayout.ts
// 一個場景單元裡由鏡頭列表決定的幾件事（純函數，場景與單測共用）：領頭光位、每行成為當前行時用的排版、運鏡。
// 整首歌一個單元（軌跡過渡）時它們決定了段落之間是否連續：領頭光位跳過前奏的間奏鏡頭；運鏡按原段落往返推拉，
// 段落邊界處位置連續、速度為 0。

/** 場景鏡頭裡這幾個函數用到的部分。 */
export interface UnitLayoutShot {
    profile: LumiereProfile;
    lines: number[];
}

/**
 * 領頭光位（文字區、字號、運鏡、浮塵、星空按它）：第一個有歌詞的鏡頭。按段落切單元時就是第一個鏡頭；
 * 整首歌一個單元時跳過前奏的間奏鏡頭，免得整首歌的字都排在間奏光位的文字區裡。
 */
export const resolveLumiereLeadShot = <T extends UnitLayoutShot>(shots: readonly T[]): T => (
    shots[Math.max(0, shots.findIndex(shot => shot.lines.length > 0))]!
);

/** 第 i 行成為當前行時用它所在鏡頭的排版（不在任何鏡頭裡的行跟隨前一個有歌詞的鏡頭）。 */
export const lumiereTypographyOfLine = (shots: readonly UnitLayoutShot[]) => (lineIndex: number): WindowTypography => {
    let found = shots[0]!;
    for (const shot of shots) {
        if (shot.lines.includes(lineIndex)) return shot.profile.typography;
        if (shot.lines.length > 0 && shot.lines[0]! < lineIndex) found = shot;
    }
    return found.profile.typography;
};

/**
 * 運鏡的推近進度（0..1，已緩入緩出）：沒有 sections 時整個單元推一次（原來的行為）；
 * 有 sections 時每個段落推一次、下一段拉回來，往返交替——段落邊界處速度為 0 且位置連續，
 * 整首歌一個單元時運鏡也保持段落的節奏，而不是用 5 分鐘推完一次。
 */
export const resolveLumiereCameraProgress = (
    time: number,
    span: { startTime: number; endTime: number },
    sections?: readonly LumiereSection[],
) => {
    const eased = (start: number, end: number) => {
        const linear = Math.min(1, Math.max(0, (time - start) / Math.max(end - start, 0.001)));
        return (1 - Math.cos(linear * Math.PI)) / 2;
    };
    if (!sections || sections.length === 0) return eased(span.startTime, span.endTime);
    let index = 0;
    for (let i = 0; i < sections.length; i += 1) if (sections[i]!.startTime <= time) index = i;
    const section = sections[index]!;
    const progress = eased(section.startTime, section.endTime);
    return index % 2 === 0 ? progress : 1 - progress;
};

export interface LumiereCameraOptions {
    width: number;
    height: number;
    /** 領頭光位的運鏡參數。 */
    camera: LumiereProfile['camera'];
    startTime: number;
    endTime: number;
    sections?: readonly LumiereSection[];
    animationIntensity?: Theme['animationIntensity'];
}

/** 運鏡：緩慢推近 + 平移（兩端緩入緩出，見 resolveLumiereCameraProgress），再疊持續的手持感浮動。只由 time 決定。 */
export const createLumiereCamera = (options: LumiereCameraOptions) => {
    const { width, height, camera } = options;
    const motion = options.animationIntensity === 'calm' ? 0.6 : options.animationIntensity === 'chaotic' ? 1.4 : 1;
    const span = { startTime: options.startTime, endTime: options.endTime };
    return (time: number): TransformParams => {
        const progress = resolveLumiereCameraProgress(time, span, options.sections);
        const floatX = (Math.sin(time * 0.21 + 0.4) * 0.6 + Math.sin(time * 0.53 + 1.9) * 0.4) * 0.006 * motion;
        const floatY = (Math.cos(time * 0.17 + 1.1) * 0.6 + Math.sin(time * 0.47 + 0.3) * 0.4) * 0.006 * motion;
        return {
            x: width / 2 + (camera.driftX * progress + floatX) * width,
            y: height / 2 + (camera.driftY * progress + floatY) * height,
            pivotX: width / 2,
            pivotY: height / 2,
            scale: (1 + camera.push * progress) * (1 + 0.008 * motion * Math.sin(time * 0.31 + 0.7)),
            rotation: 0.004 * motion * Math.sin(time * 0.13 + 2.1),
        };
    };
};

/** 舞臺座標（沒有運鏡時的畫面座標）經運鏡變換後的畫面座標（與 Pixi 容器 pivot / position / scale / rotation 相同）。 */
export const applyLumiereCamera = (transform: TransformParams, x: number, y: number) => {
    const cos = Math.cos(transform.rotation);
    const sin = Math.sin(transform.rotation);
    const dx = (x - transform.pivotX) * transform.scale;
    const dy = (y - transform.pivotY) * transform.scale;
    return { x: transform.x + dx * cos - dy * sin, y: transform.y + dx * sin + dy * cos };
};
