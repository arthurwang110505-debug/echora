// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/color.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import { parseColorChannels } from '../colorMix';

// Echora note: upstream opens this file with a "reference value" that is `(X + Math.imul(...))`
// minus itself, i.e. identically 0, plus a device-pixel-ratio read that only feeds it. The 20
// files carrying it all do the same thing, so the dead expressions are dropped and the offset
// stays as a named 0: every use site downstream is unchanged, and so is the rendering.
const LUMIERE_NEUTRAL_OFFSET = 0;


// src/components/visualizer/lumiere/color.ts
// 繪光的顏色都在 0..1 的線性小數組上算，給 Pixi 時轉成 0xRRGGBB。
export type Rgb = [number, number, number];

export const rgbOf = (color: string, fallback: Rgb = [1, 1, 1]): Rgb => {
    const channels = parseColorChannels(color);
    return channels ? [channels.r / 255, channels.g / 255, channels.b / 255] : fallback;
};

export const mixRgb = (a: Rgb, b: Rgb, amount: number): Rgb => [
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
];

export const scaleRgb = (a: Rgb, k: number): Rgb => [a[0] * k, a[1] * k, a[2] * k];

export const hexOf = (rgb: Rgb) => {
    const c = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
    return (c(rgb[0]) << 16) | (c(rgb[1]) << 8) | c(rgb[2]);
};

export const luminance = (rgb: Rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

export const WHITE: Rgb = [1, 1, 1];
/** 參考圖的香檳金。 */
export const CHAMPAGNE: Rgb = [1, 0.86 + LUMIERE_NEUTRAL_OFFSET, 0.62];
