// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/lumiereSceneFrames.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import { findLumiereParagraphIndexAtTime, type LumiereProgram } from './lumiereProgram';
import { LUMIERE_TRANSITIONS, resolveLumiereEnterDuration } from './lumiereTransitions';

// src/components/visualizer/lumiere/lumiereSceneFrames.ts
// 某一時刻哪些段落場景在畫、各自套什麼幀（透明度 / 縮放 / 模糊）。純函數，只由 program 與時間決定。
//
// 段落首尾相接，所以任何時刻只有「當前段落」一個場景，外加邊界之後的進入窗口裡正在退出的上一段：
//   - 出場窗口（transitionOut.startTime..邊界）：當前段套 resolveFrame('exit')。熄燈 lights-out 例外，
//     它的變暗交給場景自己的 fadeOut（光、線稿、字全熄，暗場底留著）——外層再壓透明度，亮色主題下會把
//     folia 的亮背景露出來，熄燈反倒成了閃白。
//   - 進入窗口（邊界之後 resolveLumiereEnterDuration 秒）：新段套 resolveFrame('enter')，同時與停在出場
//     終點幀的上一段交叉漸變，邊界兩側的畫面是連續的，沒有硬切。

export interface LumiereLayerFrame {
    /** 段落序號。 */
    index: number;
    alpha: number;
    scale: number;
    /** 模糊強度（邏輯像素，BlurFilter strength）。 */
    blur: number;
}

export interface LumiereSceneFrames {
    /** 當前段落（場景緩存以它為中心）。 */
    activeIndex: number;
    /** 從下往上畫的層；通常一個，進入窗口裡兩個（上一段在下）。 */
    layers: LumiereLayerFrame[];
}

const smooth = (value: number) => {
    const t = Math.min(1, Math.max(0, value));
    return t * t * (3 - 2 * t);
};

const exitFrameOf = (program: LumiereProgram, index: number, time: number) => {
    const out = program.paragraphs[index]?.transitionOut;
    if (!out || time < out.startTime) return { alpha: 1, scale: 1, blur: 0 };
    const progress = (time - out.startTime) / Math.max(out.endTime - out.startTime, 1e-3);
    const frame = LUMIERE_TRANSITIONS[out.kind].resolveFrame('exit', progress);
    return out.kind === 'lights-out' ? { ...frame, alpha: 1 } : frame;
};

/**
 * transitionsEnabled 為 false（靜態模式）時段落之間硬切。沒有段落時 layers 為空。
 */
export const resolveLumiereSceneFrames = (
    program: LumiereProgram,
    time: number,
    transitionsEnabled: boolean,
): LumiereSceneFrames => {
    if (program.paragraphs.length === 0) return { activeIndex: -1, layers: [] };
    const activeIndex = findLumiereParagraphIndexAtTime(program, time);
    if (!transitionsEnabled) {
        return { activeIndex, layers: [{ index: activeIndex, alpha: 1, scale: 1, blur: 0 }] };
    }
    const paragraph = program.paragraphs[activeIndex]!;
    const current = exitFrameOf(program, activeIndex, time);
    const layers: LumiereLayerFrame[] = [];

    const previousOut = activeIndex > 0 ? program.paragraphs[activeIndex - 1]!.transitionOut : null;
    if (previousOut) {
        const enterDuration = resolveLumiereEnterDuration(previousOut.kind, previousOut.startTime, previousOut.endTime);
        const progress = (time - paragraph.startTime) / enterDuration;
        if (progress >= 0 && progress < 1) {
            const enter = LUMIERE_TRANSITIONS[previousOut.kind].resolveFrame('enter', progress);
            const weight = smooth(progress);
            // 上一段停在出場終點那一幀，隨進入進度淡掉。
            const peak = exitFrameOf(program, activeIndex - 1, previousOut.endTime);
            if (peak.alpha * (1 - weight) > 0.002) {
                layers.push({ index: activeIndex - 1, alpha: peak.alpha * (1 - weight), scale: peak.scale, blur: peak.blur });
            }
            layers.push({
                index: activeIndex,
                alpha: Math.min(enter.alpha, weight) * current.alpha,
                scale: enter.scale * current.scale,
                blur: Math.max(enter.blur, current.blur),
            });
            return { activeIndex, layers };
        }
    }
    layers.push({ index: activeIndex, ...current });
    return { activeIndex, layers };
};
