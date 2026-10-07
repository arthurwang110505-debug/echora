// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/lumiereRandom.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
// src/components/visualizer/lumiere/lumiereRandom.ts
// 繪光的確定性隨機數：按 key 播種的 mulberry32 流（key 先經 FNV-1a 散列）。場景構建與編譯裡的隨機量
// 全部從這裡取，同一首歌同一個種子永遠得到同一幀——seek、重建、預熱都不會改變畫面。
// folia 已有的 temperaRandom / sonnetRandom 只提供 FNV 散列與逐元素哈希，沒有可連續取值的流，所以這裡單獨保留一份。

const hashKey = (key: string) => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < key.length; i += 1) {
        hash ^= key.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

/** mulberry32：32 位狀態，週期 2^32，對裝飾用的隨機足夠。數字種子直接當狀態，字符串種子先散列。 */
export const createRng = (seed: string | number) => {
    let state = typeof seed === 'number' ? seed >>> 0 : hashKey(seed);
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

/**
 * 與 createRng(seed) 同一條流，但從第 skip 個值之後開始：mulberry32 每取一次狀態加一個常數，跳過是 O(1)。
 * 歌詞窗口按需構建某一行時用它直接跳到這一行的起點，拿到的值與從頭順序取完全一樣。
 */
export const createRngAt = (seed: string | number, skip: number) => {
    const state = typeof seed === 'number' ? seed >>> 0 : hashKey(seed);
    return createRng((state + Math.imul(skip, 0x6d2b79f5)) >>> 0);
};
