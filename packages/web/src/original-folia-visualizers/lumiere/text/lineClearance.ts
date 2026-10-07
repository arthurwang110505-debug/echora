// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/text/lineClearance.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
// src/components/visualizer/lumiere/text/lineClearance.ts
// 當前行與鄰行之間的間隙：兩件事，都是 t 的純函數、不存歷史。
//
// 1. 漂移讓開當前行（源頭）：每行永不停止的漂移（勻速 + 繞行）沿「堆疊軸」（橫排與縱橫交錯是上下、豎排是左右）
//    拆開看，鄰行朝當前行的那一份平滑地翻成背離（速度不變，字仍在動，只是不往當前行裡鑽）。當前行自己不再
//    越漂越遠：沿自己的方向起步，隨即繞一個半徑 HOLD 的小圓，速度不變、永不停。鄰行 / 當前行的身份與堆疊
//    方向都按槽位滑動的進度混合，換行時不跳。
// 2. 當前行的保護框（兜底）：當前行按它自己的位置、縮放、轉角取墨跡框（外擴一個鄰字的半個字號，再留一段
//    漸變的邊），非當前行的字落進框裡時透明度（連同光暈、閃點、徑跡）壓到 PROTECT_FLOOR，邊上平滑過渡。
//    換行時新舊當前行的框按滑動進度交接（權重 = 兩次換行的緩動進度之差，求和恆為 1，連續）。

/** 軟絕對值的圓角（高度單位）：鄰行的漂移在「朝向 / 背離」當前行之間換向時速度也連續。 */
const AWAY_SOFTNESS = 0.005;
/** 當前行漂移繞的小圓半徑（高度單位）：最多離槽位 2 × HOLD，比鄰行與當前行之間的空隙小得多。 */
export const HOLD = 0.018;

/** 平滑的 |a|（a = 0 時為 0，遠處比 |a| 小 AWAY_SOFTNESS）。 */
const softAbs = (a: number) => Math.sqrt(a * a + AWAY_SOFTNESS * AWAY_SOFTNESS) - AWAY_SOFTNESS;

/**
 * 鄰行一條軸上的漂移（高度單位）：away 為這一行背離當前行的方向（±1）× 它作為鄰行的權重（0..1）。
 * 朝當前行的那一份平滑地翻成背離（|a| 的軟版本），背離的那一份不變；away = 0 時原樣返回。
 */
export const awayDrift = (drift: number, away: number) => {
    if (away === 0) return drift;
    const sign = away > 0 ? 1 : -1;
    const along = drift * sign;
    return drift + Math.abs(away) * (softAbs(along) - along) * sign;
};

/**
 * 當前行的勻速漂移（不含繞行）在 axis（0 = x，1 = y）上的分量：速度 (vx, vy)、從開始唱起 age 秒。
 * 起步時與勻速漂移一樣（沿自己的方向），隨即向左拐進半徑 HOLD 的圓，速度大小不變。
 */
export const heldDrift = (vx: number, vy: number, age: number, axis: 0 | 1) => {
    const speed = Math.hypot(vx, vy);
    if (speed < 1e-9) return 0;
    const phi = (speed * age) / HOLD;
    const along = HOLD * Math.sin(phi);
    const turn = HOLD * (1 - Math.cos(phi));
    const ux = vx / speed;
    const uy = vy / speed;
    return axis === 0 ? along * ux - turn * uy : along * uy + turn * ux;
};

/** 保護框裡非當前行的字最暗壓到原來的多少。 */
export const PROTECT_FLOOR = 0.4;
/** 保護框外擴的漸變邊寬（以當前行的字號為單位）。 */
export const PROTECT_MARGIN = 0.5;

/** 一個當前行的保護框（邏輯像素）：中心、轉角、半寬半高（墨跡框，已縮放）、漸變邊寬、交接權重、屬於哪一行。 */
export interface ProtectBox {
    line: number;
    x: number;
    y: number;
    cos: number;
    sin: number;
    halfW: number;
    halfH: number;
    margin: number;
    weight: number;
}

export const createProtectBox = (): ProtectBox => ({ line: -1, x: 0, y: 0, cos: 1, sin: 0, halfW: 0, halfH: 0, margin: 1, weight: 0 });

const smooth = (value: number) => {
    const t = Math.min(1, Math.max(0, value));
    return t * t * (3 - 2 * t);
};

/**
 * 第 line 行一個字（字心 x, y，半個字號 half）被保護的程度 0..1：在別的行的框裡（轉到那一行自己的方向上看，
 * 字的方塊碰到墨跡框就算在裡面）為 1，出了框按漸變邊平滑降到 0；多個框按交接權重相加。自己那一行的框不算。
 */
export const protectionAt = (boxes: readonly ProtectBox[], count: number, line: number, x: number, y: number, half: number) => {
    let protect = 0;
    for (let i = 0; i < count; i += 1) {
        const box = boxes[i]!;
        if (box.line === line || box.weight <= 0) continue;
        const dx = x - box.x;
        const dy = y - box.y;
        const u = Math.abs(dx * box.cos + dy * box.sin) - box.halfW - half;
        const v = Math.abs(dy * box.cos - dx * box.sin) - box.halfH - half;
        const outside = u > 0 && v > 0 ? Math.hypot(u, v) : Math.max(u, v, 0);
        protect += box.weight * (1 - smooth(outside / box.margin));
    }
    return Math.min(1, protect);
};

/** 被保護程度 → 透明度倍率。 */
export const protectedAlpha = (protect: number) => 1 - (1 - PROTECT_FLOOR) * protect;
