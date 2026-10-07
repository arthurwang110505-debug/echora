// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/lumiereTransitions.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { LumiereTransitionKind } from './program';
import { LUMIERE_TRANSITION_KINDS } from './program';

// src/components/visualizer/lumiere/lumiereTransitions.ts
// 繪光的段落轉場：熄燈 lights-out、閃白 flare-cut、拉焦 focus-pull。光學感主要在場景內部做（熄燈時場景自己
// 在轉場窗口裡收光、開場星落），外層只配一個簡單的幀：熄燈 = 透明度；閃白 = 輕微放大 + 模糊的峰值落在邊界；
// 拉焦 = 模糊出、模糊入。lumisynth 裡這一幀由內核套在單元容器上，folia 沒有內核，由運行時按同樣的規則套：
//   - 出場：transitionOut 窗口裡對舊段落的容器套 resolveFrame('exit', 進度)；
//   - 進場：邊界之後 enterDuration 秒（上一段轉場窗口的長度鉗在 enterClamp）裡對新段落的容器套 resolveFrame('enter', 進度)；
//   運行時也可以簡化成兩段交叉漸變，只要熄燈的收光（場景的 fadeOut）照常生效。

export interface LumiereTransitionFrame {
    alpha: number;
    scale: number;
    /** 模糊強度（邏輯像素，Pixi BlurFilter 的 strength）。 */
    blur: number;
}

export interface LumiereTransitionDef {
    kind: LumiereTransitionKind;
    label: string;
    /** 段落邊界處的時長；gap 為兩段之間的空隙（下一段開始 − 這一段最後一行唱完）。 */
    duration: (gap: number) => number;
    /** 邊界之後進入階段時長的鉗制（進入時長 = 上一段轉場窗口的長度鉗在這個區間裡）。 */
    enterClamp: [number, number];
    /** exit：0 → 1 走向邊界；enter：0 → 1 離開邊界。 */
    resolveFrame: (phase: 'enter' | 'exit', progress: number) => LumiereTransitionFrame;
}

const smooth = (value: number) => {
    const t = Math.min(1, Math.max(0, value));
    return t * t * (3 - 2 * t);
};

const LABELS: Record<LumiereTransitionKind, string> = { 'lights-out': '熄燈', 'flare-cut': '閃白', 'focus-pull': '拉焦' };

export const LUMIERE_TRANSITIONS: Record<LumiereTransitionKind, LumiereTransitionDef> = Object.fromEntries(
    LUMIERE_TRANSITION_KINDS.map(kind => [kind, {
        kind,
        label: LABELS[kind],
        duration: (gap: number) => (kind === 'focus-pull'
            ? Math.min(0.6, Math.max(0.35, gap > 0 ? gap * 0.5 : 0.45))
            : Math.min(1.1, Math.max(0.5, gap > 0 ? gap * 0.6 : 0.8))),
        enterClamp: kind === 'focus-pull' ? [0.3, 0.6] : [0.4, 0.9],
        resolveFrame: (phase: 'enter' | 'exit', progress: number): LumiereTransitionFrame => {
            // 越靠近邊界 near 越大。
            const near = phase === 'exit' ? smooth(progress) : 1 - smooth(progress);
            if (kind === 'lights-out') return { alpha: 1 - near, scale: 1, blur: 0 };
            if (kind === 'flare-cut') return { scale: 1 + 0.03 * near, blur: 7 * near * near, alpha: 1 - 0.35 * near * near };
            return { alpha: 1, blur: 12 * near, scale: 1 + 0.015 * near };
        },
    } satisfies LumiereTransitionDef]),
) as Record<LumiereTransitionKind, LumiereTransitionDef>;

/** 進入階段的時長：上一段 transitionOut 窗口（startTime..endTime）的長度鉗在轉場的 enterClamp 裡。 */
export const resolveLumiereEnterDuration = (kind: LumiereTransitionKind, startTime: number, endTime: number) => {
    const [min, max] = LUMIERE_TRANSITIONS[kind].enterClamp;
    return Math.max(min, Math.min(max, endTime - startTime));
};

/** 選轉場：不與這個模式上一次選的相同，按 (seed, 段落序號) 散列確定。 */
export const chooseLumiereTransition = (seed: string, paragraphIndex: number, previous: LumiereTransitionKind | null): LumiereTransitionKind => {
    const choices = LUMIERE_TRANSITION_KINDS.filter(kind => kind !== previous);
    let hash = 0;
    for (const char of `${seed}:${paragraphIndex}:transition`) hash = (hash * 31 + char.charCodeAt(0)) | 0;
    return choices[Math.abs(hash) % choices.length]!;
};
