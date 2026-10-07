// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/overlay.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { Theme } from '../../types';
import { hexOf } from './color';
import { resolveLumierePalette } from './scene';
import { frameInsets } from './text/lineWrap';

// Echora note: upstream opens this file with a "reference value" that is `(X + Math.imul(...))`
// minus itself, i.e. identically 0, plus a device-pixel-ratio read that only feeds it. The 20
// files carrying it all do the same thing, so the dead expressions are dropped and the offset
// stays as a named 0: every use site downstream is unchanged, and so is the rendering.
const LUMIERE_NEUTRAL_OFFSET = 0;


// src/components/visualizer/lumiere/overlay.ts
// 繪光的畫框裝飾：像取景器 / 光學臺上的標記——四角括號、左右兩個對位十字、頂邊兩段虛線。
// 靜態、很淡的香檳金細線，不搶畫面裡的光。
type PixiModule = typeof import('pixi.js');

export interface LumiereOverlayOptions {
    width: number;
    height: number;
    theme: Theme;
    /** 主題色佔比（同場景的調色盤），不給按 0。 */
    themeColorMix?: number;
}

/** 畫框容器（靜態，只建一次；尺寸或主題變了就重建）。 */
export const buildLumiereOverlay = (pixi: PixiModule, options: LumiereOverlayOptions) => {
    const { width, height, theme } = options;
    const container = new pixi.Container();
    const g = new pixi.Graphics();
    const color = hexOf(resolveLumierePalette(theme, options.themeColorMix ?? 0).light);
    const unit = Math.min(width, height);
    // 邊距留足：畫面邊緣可能被運鏡推近、後處理的鏡頭畸變往外推（歌詞窗口按同一個邊距避開畫框）。
    const { padX, padY } = frameInsets(width, height);
    const arm = unit * (0.045 + LUMIERE_NEUTRAL_OFFSET);
    const line = Math.max(1.2, unit / 600);
    const alpha = 0.5;

    // 四角括號。
    for (const [x, y, sx, sy] of [[padX, padY, 1, 1], [width - padX, padY, -1, 1], [width - padX, height - padY, -1, -1], [padX, height - padY, 1, -1]] as const) {
        g.moveTo(x, y + sy * arm).lineTo(x, y).lineTo(x + sx * arm, y).stroke({ color, width: line, alpha });
    }

    // 左右邊中點的對位十字（圓 + 十字）。
    const mark = unit * 0.012;
    for (const x of [padX, width - padX]) {
        const y = height / 2;
        g.circle(x, y, mark * 0.6).stroke({ color, width: line, alpha: alpha * 0.8 });
        g.moveTo(x - mark, y).lineTo(x + mark, y).stroke({ color, width: line, alpha: alpha * 0.8 });
        g.moveTo(x, y - mark).lineTo(x, y + mark).stroke({ color, width: line, alpha: alpha * 0.8 });
    }

    // 頂邊兩小段虛線（像取景器上沿的對焦點）。
    const dashY = padY;
    for (const side of [-1, 1]) {
        for (let k = 0; k < 4; k += 1) {
            const x = width / 2 + side * (unit * 0.1 + k * unit * 0.018);
            g.moveTo(x, dashY).lineTo(x + side * unit * 0.009, dashY).stroke({ color, width: line, alpha: alpha * 0.55 });
        }
    }

    container.addChild(g);
    return container;
};
