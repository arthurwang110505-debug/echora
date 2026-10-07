// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/lumiereRuntimeTuning.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { LumiereRenderQuality, LumiereTuning } from '../../types';
import { snapResolutionToTexturePool } from '../pixiTextureBudget';
import type { LumiereProgramOptions } from './lumiereProgram';
import type { LumiereSceneTuning } from './types';

// src/components/visualizer/lumiere/lumiereRuntimeTuning.ts
// 用戶 tuning（LumiereTuning）→ 場景 tuning（LumiereSceneTuning）的映射、畫質檔的數值，以及哪些改動要重建場景。
// 純函數，不碰 Pixi，運行時與單測共用。
//
// 畫質檔只動開銷最大的那一塊：圖形組（光場著色器 + 煙霧 fbm + 圖形組 bloom 的整條降採樣鏈）。
// 圖形組本來就是整屏的柔光與煙霧，低頻為主，降分辨率幾乎看不出來；文字組、畫框和片尾卡的字仍按滿分辨率
// 光柵化與合成，所以歌詞保持清晰。見 resolveLumiereGraphicsResolution。

export interface LumiereQualityProfile {
    /** 圖形組相對渲染分辨率的倍率（按軸）；像素數是它的平方。 */
    graphicsScale: number;
    /** 煙霧噪聲倍頻數上限（用戶設置更低時按用戶的）。 */
    maxFogOctaves: number;
    /** 浮塵數量倍率（乘在用戶設置上）。 */
    moteScale: number;
}

/**
 * 三檔的數值：
 * - full：圖形組與屏幕同分辨率，倍頻按用戶設置（2..6）。
 * - balanced：圖形組每軸 0.7（像素約 49%），倍頻 ≤ 4。bloom 按對數就近減一級（不減會寬 1.43 倍，
 *   減一級窄到 0.71 倍，後者更近），輝光略收、開銷再降一截。
 * - low（省電）：圖形組每軸 0.5（像素 25%），倍頻 ≤ 3，浮塵 ×0.6。分辨率正好減半，bloom 少降一級，
 *   最小一級與 full 完全同尺寸，輝光寬度不變。
 */
export const LUMIERE_QUALITY_PROFILES: Record<LumiereRenderQuality, LumiereQualityProfile> = {
    full: { graphicsScale: 1, maxFogOctaves: 6, moteScale: 1 },
    balanced: { graphicsScale: 0.7, maxFogOctaves: 4, moteScale: 1 },
    low: { graphicsScale: 0.5, maxFogOctaves: 3, moteScale: 0.6 },
};

/** 渲染分辨率上限：再高的屏幕也按 2 倍畫，4K / 高 DPI 下整屏光場的開銷是按像素數漲的。 */
export const LUMIERE_MAX_RENDER_RESOLUTION = 2;

/** 畫布（文字、畫框）的渲染分辨率：devicePixelRatio 鉗在 1..2。 */
export const resolveLumiereRenderResolution = (devicePixelRatio: number | undefined) => {
    const ratio = typeof devicePixelRatio === 'number' && Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1;
    return Math.min(LUMIERE_MAX_RENDER_RESOLUTION, Math.max(1, ratio));
};

/**
 * 圖形組 filter 的分辨率：滿畫質時就是渲染分辨率；降檔時乘上倍率，再按 Pixi 紋理池的 2 的冪分桶往下吸附
 * （pixiTextureBudget.ts：最多再讓 25%，換一個小一號的桶）。吸附只對圖形組做——它是柔光，軟一點看不出來；
 * 文字不吸附，保證清晰。
 */
export const resolveLumiereGraphicsResolution = (
    width: number,
    height: number,
    renderResolution: number,
    quality: LumiereRenderQuality,
) => {
    const { graphicsScale } = LUMIERE_QUALITY_PROFILES[quality];
    if (graphicsScale >= 1) return renderResolution;
    return snapResolutionToTexturePool(width, height, renderResolution * graphicsScale);
};

/**
 * 圖形組分辨率降了多少，bloom 就少降幾級：bloom 每級是上一級的一半分辨率，輸入已經降了 2^k 倍時去掉 k 級，
 * 最小一級的紋素（決定輝光有多寬）才和滿畫質一樣大。
 */
export const resolveLumiereBloomLevelDrop = (renderResolution: number, graphicsResolution: number) => (
    graphicsResolution > 0 && graphicsResolution < renderResolution
        ? Math.max(0, Math.round(Math.log2(renderResolution / graphicsResolution)))
        : 0
);

export interface LumiereSceneTuningContext {
    /** false 時不畫歌詞：背景歌詞碎片也關掉（它們是歌詞的字），光照照常。 */
    showText: boolean;
}

/** 用戶 tuning → 場景 tuning。畫質檔在這裡折進倍頻與浮塵；「僅顯示歌詞文字」即場景的 textOnly。 */
export const toLumiereSceneTuning = (
    tuning: LumiereTuning,
    context: LumiereSceneTuningContext,
): LumiereSceneTuning => {
    const profile = LUMIERE_QUALITY_PROFILES[tuning.renderQuality] ?? LUMIERE_QUALITY_PROFILES.full;
    return {
        lightIntensity: tuning.lightIntensity,
        audioResponse: tuning.audioResponse,
        fogDensity: tuning.fogDensity,
        darkField: tuning.darkField,
        moteAmount: tuning.moteAmount * profile.moteScale,
        bloom: tuning.bloom,
        textBloom: tuning.textBloom,
        unlitOpacity: tuning.unlitOpacity,
        windowNeighbors: tuning.windowNeighbors,
        decay: tuning.decay,
        echo: context.showText ? tuning.echo : 0,
        fogOctaves: Math.min(tuning.fogOctaves, profile.maxFogOctaves),
        lineArt: tuning.lineArt,
        frontBokeh: tuning.frontBokeh,
        trails: tuning.trails,
        hideTrails: tuning.hideTrails,
        overlayFrame: tuning.overlayFrame,
        textOnly: tuning.textOnly,
        keywordColors: tuning.keywordColors,
        themeIcons: tuning.themeIcons,
        themeColorMix: tuning.themeColorMix,
    };
};

/**
 * 每幀才讀的字段：直接改運行時持有的那份 tuning 對象就生效，不必重建。
 * （光強、隨音樂、煙霧濃度、未唱字透明度、倍頻在 scene.update 裡現讀；暗場強度由運行時的暗場層每幀現讀。）
 */
export const LUMIERE_LIVE_SCENE_KEYS = [
    'lightIntensity',
    'audioResponse',
    'fogDensity',
    'darkField',
    'unlitOpacity',
    'fogOctaves',
    'hideTrails',
] as const satisfies readonly (keyof LumiereSceneTuning)[];

/**
 * 改變編譯結果的字段：既不是每幀現讀，也不是場景重建——程序本身要重新編譯（VisualizerLumiere 的 useMemo），
 * 新程序經 swapSong 的同曲替換路徑交給運行時（commitSong 清掉場景緩存，下一幀按新程序建），不重建 WebGL 上下文。
 * 軌跡過渡把整首歌編成一個單元，所以它在這裡，不在場景 tuning 裡。
 */
export const LUMIERE_COMPILE_KEYS = ['seamlessTransitions'] as const satisfies readonly (keyof LumiereTuning)[];

/** 用戶 tuning → 編譯選項（只取 LUMIERE_COMPILE_KEYS 裡的字段）。 */
export const resolveLumiereCompileOptions = (
    tuning: Pick<LumiereTuning, typeof LUMIERE_COMPILE_KEYS[number]>,
): Pick<LumiereProgramOptions, 'seamless'> => ({ seamless: tuning.seamlessTransitions });

/** 兩個 bloom 倍率：強度直接寫進現有 filter 的 options；只有跨過 0（要掛 / 摘 filter）時才重建。 */
const crossesZero = (previous: number, next: number) => (previous > 0) !== (next > 0);

/**
 * 場景構建時烘焙進去的字段變了，緩存的場景就得重建（運行時會防抖）。畫框只在 overlay 裡，不算。
 */
export const requiresLumiereSceneRebuild = (previous: LumiereSceneTuning, next: LumiereSceneTuning) => (
    previous.moteAmount !== next.moteAmount
    || previous.windowNeighbors !== next.windowNeighbors
    || previous.decay !== next.decay
    || previous.echo !== next.echo
    || previous.lineArt !== next.lineArt
    || previous.frontBokeh !== next.frontBokeh
    || previous.trails !== next.trails
    || previous.textOnly !== next.textOnly
    || previous.keywordColors !== next.keywordColors
    || previous.themeIcons !== next.themeIcons
    // 調色盤在建場景時算好（光色、字色、線稿與關鍵字的混色都從它來）。
    || previous.themeColorMix !== next.themeColorMix
    || crossesZero(previous.bloom, next.bloom)
    || crossesZero(previous.textBloom, next.textBloom)
);
