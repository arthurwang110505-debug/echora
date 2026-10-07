// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/lumiereKernel.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { Line } from '../../types';

// src/components/visualizer/lumiere/lumiereKernel.ts
// 繪光原本依賴的 lumisynth 內核 / 編譯器類型的最小子集：mood、段落性質、運鏡變換、片尾卡幀、歌曲信息、音頻幀。
// folia 裡沒有內核，這些只是繪光自己的場景、編譯與片尾卡之間的約定；運行時（VisualizerLumiere）按這裡的含義去用。

/** 光位的情緒：quiet / neutral / loud。 */
export type Mood = 'quiet' | 'neutral' | 'loud';

/** 段落性質（與 tempera / sonnet 的分段分類相同）。 */
export type ParagraphKind = 'breath' | 'verse' | 'lift' | 'chorus' | 'break' | 'outro';

/** 段落從哪裡切開：歌曲開頭、時間空隙、歌詞元數據（blockIndex / songPart）變化、超出時長或行數上限；intro / instrumental 為繪光自己補的間奏段。 */
export type ParagraphBoundary = 'song-start' | 'time-gap' | 'metadata' | 'duration-cap' | 'line-cap' | 'intro' | 'instrumental';

/** 編譯時的一行：全曲行序號、行本身、視覺結束時間（不越過下一行開始）。 */
export interface StructureLine {
    sourceIndex: number;
    line: Line;
    renderEndTime: number;
}

/** 音頻特徵（0..1）：低頻推光束亮度、高頻推浮塵閃爍、整體響度推煙霧濃度。 */
export interface LumiereAudioFrame {
    bass: number;
    treble: number;
    power: number;
}

/** 片尾卡要顯示的歌曲信息。 */
export interface SongMetadata {
    title: string | null;
    artist: string | null;
    album: string | null;
}

/** 片尾卡的時間線幀：歌詞層的透明度與失焦、片尾卡本身的透明度、位移與縮放。 */
export interface CreditsFrame {
    active: boolean;
    lyricAlpha: number;
    lyricBlur: number;
    posterAlpha: number;
    posterOffsetY: number;
    posterScale: number;
}

/** 仿射矩陣：x' = a·x + c·y + tx，y' = b·x + d·y + ty。 */
export interface Affine {
    a: number;
    b: number;
    c: number;
    d: number;
    tx: number;
    ty: number;
}

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

/** 容器的變換參數（與 Pixi 相同的含義：先減 pivot，再縮放、旋轉，最後移到 position）。 */
export interface TransformParams {
    x: number;
    y: number;
    pivotX: number;
    pivotY: number;
    scale: number;
    rotation: number;
}

export const fromParams = ({ x, y, pivotX, pivotY, scale, rotation }: TransformParams): Affine => {
    const cos = Math.cos(rotation) * scale;
    const sin = Math.sin(rotation) * scale;
    return { a: cos, b: sin, c: -sin, d: cos, tx: x - (cos * pivotX - sin * pivotY), ty: y - (sin * pivotX + cos * pivotY) };
};

/** m ∘ n：先 n 再 m。 */
export const multiply = (m: Affine, n: Affine): Affine => ({
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    tx: m.a * n.tx + m.c * n.ty + m.tx,
    ty: m.b * n.tx + m.d * n.ty + m.ty,
});

export const invert = (m: Affine): Affine => {
    const det = m.a * m.d - m.b * m.c || 1e-12;
    return {
        a: m.d / det,
        b: -m.b / det,
        c: -m.c / det,
        d: m.a / det,
        tx: (m.c * m.ty - m.d * m.tx) / det,
        ty: (m.b * m.tx - m.a * m.ty) / det,
    };
};

export const applyAffine = (m: Affine, x: number, y: number) => ({ x: m.a * x + m.c * y + m.tx, y: m.b * x + m.d * y + m.ty });

/**
 * 運鏡變換：沒有運鏡的容器變換 rest → 當前的容器變換 current。返回的矩陣把「沒有運鏡時的畫面座標」映射到
 * 「有運鏡時的畫面座標」。想讓別的圖層（素材、字幕裝飾）跟著場景運鏡，就把它的 `setFromMatrix` 設成這個矩陣
 * （或先乘上圖層自己的變換再設）；場景自己的 view 已經在 update 裡套過運鏡，不需要再套。
 */
export const cameraBetween = (rest: TransformParams, current: TransformParams): Affine => multiply(fromParams(current), invert(fromParams(rest)));
