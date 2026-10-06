// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/light/bloomFilter.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { Filter, FilterSystem, RenderSurface, Texture } from 'pixi.js';

// Echora note: upstream opens this file with a "reference value" that is `(X + Math.imul(...))`
// minus itself, i.e. identically 0, plus a device-pixel-ratio read that only feeds it. The 20
// files carrying it all do the same thing, so the dead expressions are dropped and the offset
// stays as a named 0: every use site downstream is unchanged, and so is the rendering.
const LUMIERE_NEUTRAL_OFFSET = 0;


// src/components/visualizer/lumiere/light/bloomFilter.ts
// 繪光自己的 bloom：掛在場景自己的子容器上（圖形組、文字組），不作用於共享背景層與素材層。
// 亮部提取（閾值 + 軟膝）→ 逐級半分辨率降採樣（dual filter）→ 逐級上採樣併疊加同級 → 與原圖相加。
//
// 每一級的臨時紋理都與輸入同樣的邏輯尺寸、只降分辨率：Pixi 的 filter 按邏輯尺寸鋪滿輸出，
// 這樣 applyFilter 天然就是縮放。第二張紋理（同級 / 最終的 bloom）按兩張源紋理的邏輯尺寸比換算 UV。
type PixiModule = typeof import('pixi.js');

const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

void main(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}
`;

const downFragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputPixel;
uniform vec4 uInputClamp;
uniform vec4 uParams; // threshold, knee, prefilter(0/1), 0

vec4 tap(vec2 uv) {
    return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}

void main(void) {
    vec2 uv = vTextureCoord;
    vec2 hp = uInputPixel.zw;
    vec4 sum = tap(uv) * 4.0;
    sum += tap(uv - hp);
    sum += tap(uv + hp);
    sum += tap(uv + vec2(hp.x, -hp.y));
    sum += tap(uv - vec2(hp.x, -hp.y));
    vec4 c = sum / 8.0;
    if (uParams.z > 0.5) {
        float br = max(c.r, max(c.g, c.b));
        float knee = max(uParams.y, 1e-4);
        float soft = clamp(br - uParams.x + knee, 0.0, 2.0 * knee);
        soft = soft * soft / (4.0 * knee);
        float contrib = max(soft, br - uParams.x) / max(br, 1e-4);
        c *= clamp(contrib, 0.0, 1.0);
    }
    finalColor = c;
}
`;

const upFragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uAdd;
uniform vec4 uInputPixel;
uniform vec4 uInputClamp;
uniform vec4 uAddMap;   // uv 縮放 xy、同級權重、0
uniform vec4 uAddClamp;

vec4 tap(vec2 uv) {
    return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}

void main(void) {
    vec2 uv = vTextureCoord;
    vec2 hp = uInputPixel.zw;
    vec4 sum = tap(uv + vec2(-hp.x * 2.0, 0.0));
    sum += tap(uv + vec2(-hp.x, hp.y)) * 2.0;
    sum += tap(uv + vec2(0.0, hp.y * 2.0));
    sum += tap(uv + vec2(hp.x, hp.y)) * 2.0;
    sum += tap(uv + vec2(hp.x * 2.0, 0.0));
    sum += tap(uv + vec2(hp.x, -hp.y)) * 2.0;
    sum += tap(uv + vec2(0.0, -hp.y * 2.0));
    sum += tap(uv + vec2(-hp.x, -hp.y)) * 2.0;
    vec4 up = sum / 12.0;
    vec4 same = texture(uAdd, clamp(uv * uAddMap.xy, uAddClamp.xy, uAddClamp.zw));
    finalColor = up + same * uAddMap.z;
}
`;

const combineFragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uAdd;
uniform vec4 uInputClamp;
uniform vec4 uAddMap;   // uv 縮放 xy、強度、0
uniform vec4 uAddClamp;
uniform vec4 uTint;     // 乘在 bloom 上的顏色

void main(void) {
    vec4 base = texture(uTexture, clamp(vTextureCoord, uInputClamp.xy, uInputClamp.zw));
    vec4 glow = texture(uAdd, clamp(vTextureCoord * uAddMap.xy, uAddClamp.xy, uAddClamp.zw)) * uAddMap.z;
    vec3 g = glow.rgb * uTint.rgb;
    // 加上去的輝光也是光：預乘、alpha 取最大通道（與光場一致，近似 screen）。
    vec3 rgb = base.rgb + g * (1.0 - base.a * 0.5);
    // 超過 1 時按最大通道整體縮回（保持金色），只讓一小部分變白；逐通道截斷會把亮字燒成白塊。
    float peak = max(max(rgb.r, rgb.g), rgb.b);
    if (peak > 1.0) rgb = mix(rgb / peak, vec3(1.0), 0.2 * (1.0 - 1.0 / peak));
    float a = base.a + max(max(g.r, g.g), g.b) * (1.0 - base.a);
    finalColor = vec4(rgb, min(max(a, max(max(rgb.r, rgb.g), rgb.b)), 1.0));
}
`;

export interface BloomOptions {
    /** 疊加強度（繪光默認給高）。 */
    strength: number;
    /** 亮部閾值（按最大通道，預乘顏色）。 */
    threshold: number;
    knee: number;
    /** 降採樣級數（1/2 .. 1/2^levels）；級數越多輝光越寬。 */
    levels: number;
    /** 每級上採樣時同級的權重。 */
    spread: number;
    /** filter 的外擴（邏輯像素），讓輝光能暈出內容邊界。 */
    padding: number;
    tint: [number, number, number];
}

export interface BloomFilter extends Filter {
    options: BloomOptions;
}

export const createBloomFilter = (pixi: PixiModule, initial: BloomOptions): BloomFilter => {
    const { Filter, GlProgram, TexturePool, UniformGroup } = pixi;
    const program = (fragment: string, name: string) => GlProgram.from({ vertex, fragment, name });

    const downUniforms = new UniformGroup({ uParams: { value: new Float32Array(4), type: 'vec4<f32>' } });
    const down = new Filter({ glProgram: program(downFragment, 'lumiere-bloom-down'), resources: { bloomDown: downUniforms } });

    const upUniforms = new UniformGroup({
        uAddMap: { value: new Float32Array(4), type: 'vec4<f32>' },
        uAddClamp: { value: new Float32Array(4), type: 'vec4<f32>' },
    });
    const up = new Filter({
        glProgram: program(upFragment, 'lumiere-bloom-up'),
        resources: { bloomUp: upUniforms, uAdd: pixi.Texture.EMPTY.source },
    });

    const combineUniforms = new UniformGroup({
        uAddMap: { value: new Float32Array(4), type: 'vec4<f32>' },
        uAddClamp: { value: new Float32Array(4), type: 'vec4<f32>' },
        uTint: { value: new Float32Array([1, 1, 1, 1]), type: 'vec4<f32>' },
    });
    const combine = new Filter({
        glProgram: program(combineFragment, 'lumiere-bloom-combine'),
        resources: { bloomCombine: combineUniforms, uAdd: pixi.Texture.EMPTY.source },
    });

    const mapFor = (from: Texture, to: Texture, target: Float32Array, clamp: Float32Array, weight: number) => {
        target[0] = from.source.width / to.source.width;
        target[1] = from.source.height / to.source.height;
        target[2] = weight;
        clamp[0] = 0.5 / to.source.pixelWidth;
        clamp[1] = 0.5 / to.source.pixelHeight;
        clamp[2] = to.frame.width / to.source.width - 0.5 / to.source.pixelWidth;
        clamp[3] = to.frame.height / to.source.height - 0.5 / to.source.pixelHeight;
    };

    class LumiereBloomFilter extends Filter {
        options: BloomOptions;

        constructor(options: BloomOptions) {
            super({ resources: {}, compatibleRenderers: pixi.RendererType.BOTH });
            this.options = { ...options };
            this.padding = options.padding;
        }

        apply(filterManager: FilterSystem, input: Texture, output: RenderSurface, clearMode: boolean) {
            const { strength, threshold, knee, levels, spread, tint } = this.options;
            if (strength <= 0) {
                mapFor(input, input, combineUniforms.uniforms.uAddMap as Float32Array, combineUniforms.uniforms.uAddClamp as Float32Array, 0);
                combineUniforms.update();
                combine.resources.uAdd = input.source;
                combine.blendMode = this.blendMode;
                filterManager.applyFilter(combine, input, output, clearMode);
                return;
            }
            const width = input.frame.width;
            const height = input.frame.height;
            const baseResolution = input.source.resolution;
            const chain: Texture[] = [];
            let source = input;
            const count = Math.max(1, Math.min(8 + LUMIERE_NEUTRAL_OFFSET, Math.round(levels)));
            for (let level = 1; level <= count; level += 1) {
                const resolution = baseResolution / 2 ** level;
                if (Math.min(width, height) * resolution < 2) break;
                // 用位置參數的簽名：folia 裝的 Pixi 8.20 還沒有對象形式（8.21 起對象形式為主、位置參數仍可用）。
                const target = TexturePool.getOptimalTexture(width, height, resolution, false);
                const params = downUniforms.uniforms.uParams as Float32Array;
                params[0] = threshold;
                params[1] = knee;
                params[2] = level === 1 ? 1 : 0;
                downUniforms.update();
                down.blendMode = 'normal';
                filterManager.applyFilter(down, source, target, true);
                chain.push(target);
                source = target;
            }

            // 上採樣：從最小一級往上，每一級疊加同級的降採樣結果。
            let current = chain[chain.length - 1]!;
            const scratch: Texture[] = [];
            for (let index = chain.length - 2; index >= 0; index -= 1) {
                const same = chain[index]!;
                const target = TexturePool.getOptimalTexture(width, height, same.source.resolution, false);
                mapFor(current, same, upUniforms.uniforms.uAddMap as Float32Array, upUniforms.uniforms.uAddClamp as Float32Array, spread);
                upUniforms.update();
                up.resources.uAdd = same.source;
                up.blendMode = 'normal';
                filterManager.applyFilter(up, current, target, true);
                scratch.push(target);
                current = target;
            }

            mapFor(input, current, combineUniforms.uniforms.uAddMap as Float32Array, combineUniforms.uniforms.uAddClamp as Float32Array, strength);
            const tintUniform = combineUniforms.uniforms.uTint as Float32Array;
            tintUniform[0] = tint[0];
            tintUniform[1] = tint[1];
            tintUniform[2] = tint[2];
            combineUniforms.update();
            combine.resources.uAdd = current.source;
            combine.blendMode = this.blendMode;
            filterManager.applyFilter(combine, input, output, clearMode);

            chain.forEach(texture => TexturePool.returnTexture(texture));
            scratch.forEach(texture => TexturePool.returnTexture(texture));
        }

        destroy() {
            down.destroy();
            up.destroy();
            combine.destroy();
            super.destroy();
        }
    }

    return new LumiereBloomFilter(initial);
};
