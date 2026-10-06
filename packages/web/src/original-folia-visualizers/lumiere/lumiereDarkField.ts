// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/lumiereDarkField.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { Container, Sprite } from 'pixi.js';
import type { Theme } from '../../types';
import { hexOf, luminance, rgbOf, scaleRgb, type Rgb } from './color';

// src/components/visualizer/lumiere/lumiereDarkField.ts
// 暗場底：光後面鋪一整塊主題背景色壓暗的底，壓住 folia 的共享背景層，光束才像打在煙裡的光。
// 它由運行時畫在所有段落場景（和片尾卡）之下，不隨段落轉場的透明度 / 模糊 / 縮放變化——
// 放在場景裡時，出場幀的透明度、邊界後的交叉漸變（兩層各半透明，疊起來蓋不滿）和片尾交接都會讓背景透出來閃一下。
// 光場著色器仍保留 uDark 通路，folia 裡恆傳 0。
type PixiModule = typeof import('pixi.js');

/** 主題背景亮度超過它就算淺色主題。 */
const BRIGHT_BACKGROUND_LUMINANCE = 0.18;
/** 淺色主題的暗場保底（lumisynth 定的「繪光始終在暗場裡」）：亮背景透出來光就不成立了。 */
export const LUMIERE_BRIGHT_DARK_FIELD_FLOOR = 0.94;
/** 暗場顏色 = 主題背景色 × 這個係數。 */
const DARK_FIELD_SHADE = 0.06;

export interface LumiereDarkField {
    color: Rgb;
    alpha: number;
}

/** 生效的暗場：深色主題 alpha = darkField；淺色主題取 max(darkField, 0.94)。顏色是主題背景色壓暗。 */
export const resolveLumiereDarkField = (theme: Pick<Theme, 'backgroundColor'>, darkField: number): LumiereDarkField => {
    const background = rgbOf(theme.backgroundColor, [0, 0, 0]);
    const strength = Number.isFinite(darkField) ? Math.min(1, Math.max(0, darkField)) : 0;
    const bright = luminance(background) > BRIGHT_BACKGROUND_LUMINANCE;
    return {
        color: scaleRgb(background, DARK_FIELD_SHADE),
        alpha: bright ? Math.max(strength, LUMIERE_BRIGHT_DARK_FIELD_FLOOR) : strength,
    };
};

/** 運行時的暗場層：一塊整屏的純色 sprite，每幀按當前主題、尺寸和 tuning 現算（只在變化時寫屬性）。 */
export class LumiereDarkFieldLayer {
    readonly view: Container;
    private readonly sprite: Sprite;
    private theme: Theme | null = null;
    private darkField = Number.NaN;
    private width = 0;
    private height = 0;

    constructor(pixi: PixiModule) {
        this.sprite = new pixi.Sprite(pixi.Texture.WHITE);
        this.sprite.visible = false;
        this.view = this.sprite;
    }

    update(theme: Theme, darkField: number, width: number, height: number) {
        if (theme !== this.theme || darkField !== this.darkField) {
            this.theme = theme;
            this.darkField = darkField;
            const field = resolveLumiereDarkField(theme, darkField);
            this.sprite.tint = hexOf(field.color);
            this.sprite.alpha = field.alpha;
            this.sprite.visible = field.alpha > 0.002;
        }
        if (width !== this.width || height !== this.height) {
            this.width = width;
            this.height = height;
            this.sprite.setSize(width, height);
        }
    }

    destroy() {
        this.sprite.destroy();
    }
}
