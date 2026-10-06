// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/types.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { Mood } from './lumiereKernel';
import type { LineArtSpec } from './lineart/lineArt';
import type { MotesSpec } from './light/motes';
import type { LightRig } from './light/rig';
import type { StarfallSpec } from './light/starfall';
import type { DecaySpec, WindowTypography } from './text/lyricWindow';

// src/components/visualizer/lumiere/types.ts
// 繪光的光位（鏡頭風格）profile 與 tuning。一個光位 = 光束組 + 煙霧 + 浮塵 + 前景散景 + 線稿配方 +
// 文字區 + 運鏡，全是數據，由同一套場景構建器解釋（設計見 lumisynth 倉庫 docs/LUMIERE.md 第二節）。
// LumiereSceneTuning 是場景直接讀的參數；用戶可見的 LumiereTuning 在 src/types.ts，由運行時映射過來。

export interface RigContext {
    /** 寬高比。 */
    aspect: number;
    /** 按單元播種的隨機數。 */
    random: () => number;
}

/** 十字爆閃（EVA 式，行內一串小十字），只給部分光位（冠冕、日食、頻閃、聚點……）。 */
export interface BurstSpec {
    /** sung：挑中的字在被唱到時各自引爆；sweep：行首一口氣沿整行連續炸開。 */
    mode: 'sung' | 'sweep';
    /** 一行裡挑多少比例的字（0..1，按種子）。 */
    density: number;
    /** 每隔幾行一次（1 = 每行），從第 offset 行開始。 */
    every: number;
    offset: number;
    /** 豎向光柱長度（以當時的字號為單位）。 */
    size: number;
    /** 乘在光色上（偏橙紅就是 EVA 的味道）。 */
    tint: [number, number, number];
}

export interface LumiereProfile {
    kind: string;
    label: string;
    family: string;
    mood: Mood;
    light: (context: RigContext) => LightRig;
    motes: MotesSpec;
    /** 前景散景（在文字之上）；null 表示沒有。 */
    front: MotesSpec | null;
    lineArt: (context: RigContext) => LineArtSpec;
    /** 文字區（畫面比例，中心 + 寬高）。 */
    region: { cx: number; cy: number; w: number; h: number };
    /** 當前行字號（佔畫面高度）。 */
    heroSize: number;
    /** 默認排版：橫排為主 / 豎排為主 / 縱橫交錯。 */
    typography: WindowTypography;
    /** 崩解：字點亮後多久開始漂離、強度。 */
    decay: DecaySpec;
    /** 十字爆閃；不給則沒有。 */
    burst?: BurstSpec;
    /** 星空點亮（開場光點傾瀉 + 星空 + 光雨）；不給則沒有，主光柱照常淡入。 */
    starfall?: StarfallSpec;
    /** 背景歌詞碎片的最大字號（佔畫面高度）；不給用 0.34。 */
    echo?: { size: number };
    /** 線稿亮度倍率（以線稿為主角的族——葉脈、星象——調高）；不給為 1。 */
    artGain?: number;
    camera: {
        /** 鏡頭全程推近多少（1 + push）。 */
        push: number;
        /** 全程平移（畫面比例）。 */
        driftX: number;
        driftY: number;
    };
}

export interface LumiereSceneTuning {
    /** 光強倍率。 */
    lightIntensity: number;
    /** 光束隨低頻變亮的程度（1 = 低頻打滿時亮 15%，0 = 不隨音樂變）。 */
    audioResponse: number;
    /** 煙霧濃度倍率。 */
    fogDensity: number;
    /**
     * 暗場強度（0..1，淺色主題保底 0.94，見 lumiereDarkField.ts）。場景不讀它：暗場底是運行時在所有場景之下
     * 鋪的一整塊底，每幀從這份共享 tuning 現讀。
     */
    darkField: number;
    /** 浮塵數量倍率。 */
    moteAmount: number;
    /** 圖形組（光場、線稿、浮塵）bloom 強度倍率（乘在默認的高值上）。 */
    bloom: number;
    /** 文字組 bloom 強度倍率。 */
    textBloom: number;
    /** 未唱字的不透明度。 */
    unlitOpacity: number;
    /** 當前行之外顯示幾行。 */
    windowNeighbors: 1 | 2;
    /** 崩解強度倍率（0 = 字一直待在排版位置上）。 */
    decay: number;
    /** 背景歌詞（巨大空心字）的亮度倍率（0 = 關）。 */
    echo: number;
    /** 煙霧噪聲倍頻數（畫質）。 */
    fogOctaves: number;
    lineArt: boolean;
    frontBokeh: boolean;
    /** 所有換位都讓字沿曲線飛、帶徑跡（默認只有縱橫交錯或橫豎切換時飛）。 */
    trails: boolean;
    /** 隱藏歌詞徑跡，字的飛行仍照常；每幀從共享 tuning 現讀。 */
    hideTrails: boolean;
    /** 畫框裝飾（取景器的四角、刻度與對位十字）。 */
    overlayFrame: boolean;
    /**
     * 僅顯示歌詞文字（設置項，默認關）：只畫字和字上的效果，圖形組（光場、煙霧、星空、線稿、浮塵）與前景不畫、
     * 也不每幀更新；沒有開場、背景碎片與主題圖標，畫框與片尾卡的光也不畫。光束照常在 CPU 上算，字仍按光束明暗。
     */
    textOnly: boolean;
    /** 關鍵字著色：主題 wordColors 的關鍵字點亮時帶關鍵字色（字、光暈、閃點、十字爆閃、背景碎片）。 */
    keywordColors: boolean;
    /** 主題圖標：主題 lyricsIcons 的 Lucide 圖標畫成線稿，散落在文字區外（獨立於 lineArt 開關）。 */
    themeIcons: boolean;
    /** 主題色佔比 0..1：0 = 香檳金光，越高光色越接近強調色、字色越接近主色 / 次色（見 resolveLumierePalette）。 */
    themeColorMix: number;
}

export const DEFAULT_LUMIERE_SCENE_TUNING: LumiereSceneTuning = {
    lightIntensity: 1,
    audioResponse: 1,
    fogDensity: 1,
    darkField: 0.75,
    moteAmount: 1,
    bloom: 1,
    textBloom: 1,
    unlitOpacity: 0.22,
    windowNeighbors: 2,
    decay: 1,
    echo: 1,
    fogOctaves: 5,
    lineArt: true,
    frontBokeh: true,
    overlayFrame: true,
    trails: false,
    hideTrails: false,
    textOnly: false,
    keywordColors: true,
    themeIcons: true,
    themeColorMix: 0.3,
};

/** bloom 的默認值：繪光的主要觀感，給得高。 */
export interface BloomPreset {
    strength: number;
    threshold: number;
    knee: number;
    levels: number;
    spread: number;
}

export const LUMIERE_BLOOM: Record<'graphics' | 'text', BloomPreset> = {
    // 圖形組閾值高一些：只讓光源與光柱芯發暈，光柱本身不再被抬亮，文字在光裡才壓得住。
    graphics: { strength: 1.5, threshold: 0.42, knee: 0.3, levels: 6, spread: 0.9 },
    // 文字組：原來的 1.9 × 調試時試出的 0.6（可讀性最好）。
    text: { strength: 1.15, threshold: 0.12, knee: 0.2, levels: 5, spread: 0.95 },
};
