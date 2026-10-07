// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/lumiereGroupFilters.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { Container, Filter } from 'pixi.js';
import type { BloomFilter } from './light/bloomFilter';
import type { BloomPreset } from './types';

// src/components/visualizer/lumiere/lumiereGroupFilters.ts
// 運行時對場景 / 片尾卡的圖形組、文字組 filter 做的就地調整：bloom 強度（滑塊拖動時不重建場景）、
// 圖形組的畫質分辨率與相應減掉的 bloom 級數。bloom filter 由場景自己建、自己銷燬，這裡只改它的參數。

const isBloomFilter = (filter: Filter): filter is BloomFilter => (
    typeof (filter as unknown as Partial<BloomFilter>).options?.strength === 'number'
);

const bloomOf = (group: Container) => (group.filters ?? []).find(isBloomFilter) ?? null;

export interface LumiereGroupQuality {
    preset: BloomPreset;
    /** tuning 裡的 bloom 倍率。 */
    multiplier: number;
    /** 這個組的 filter 分辨率；null = 跟隨渲染器（滿分辨率）。 */
    resolution: number | null;
    /** 相對預設少降幾級（見 resolveLumiereBloomLevelDrop）。 */
    levelDrop: number;
    /**
     * 組上沒有 bloom（倍率為 0 時場景不掛）但要降分辨率時掛的直通 filter（AlphaFilter，alpha 1），
     * 由運行時持有；傳 null 表示不需要。
     */
    passthrough: Filter | null;
}

/** 把畫質與 bloom 倍率寫到一個組上。重複調用是冪等的。 */
export const applyLumiereGroupQuality = (group: Container, quality: LumiereGroupQuality) => {
    const bloom = bloomOf(group);
    if (bloom) {
        bloom.options.strength = quality.preset.strength * quality.multiplier;
        bloom.options.levels = Math.max(1, quality.preset.levels - quality.levelDrop);
        bloom.resolution = quality.resolution ?? 'inherit';
        return;
    }
    const { passthrough, resolution } = quality;
    if (!passthrough) return;
    const attached = (group.filters ?? []).includes(passthrough);
    if (resolution === null) {
        if (attached) group.filters = [];
        return;
    }
    passthrough.resolution = resolution;
    if (!attached) group.filters = [passthrough];
};

/** 摘掉運行時掛上的直通 filter（場景銷燬前調用，免得場景的 destroy 把共享 filter 一起處理掉）。 */
export const detachLumierePassthrough = (group: Container, passthrough: Filter | null) => {
    if (passthrough && (group.filters ?? []).includes(passthrough)) group.filters = [];
};
