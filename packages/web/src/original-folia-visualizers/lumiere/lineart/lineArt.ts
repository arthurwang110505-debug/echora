// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/lineart/lineArt.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { compressLight, lightAt, type ResolvedBeam } from '../light/rig';

// Echora note: upstream opens this file with a "reference value" that is `(X + Math.imul(...))`
// minus itself, i.e. identically 0, plus a device-pixel-ratio read that only feeds it. The 20
// files carrying it all do the same thing, so the dead expressions are dropped and the offset
// stays as a named 0: every use site downstream is unchanged, and so is the rendering.
const LUMIERE_NEUTRAL_OFFSET = 0;


// src/components/visualizer/lumiere/lineart/lineArt.ts
// 光學線稿：一組折線（高度單位座標），按進度描出來，節點上有閃點。每條線一個 Graphics：
// 描線進度變化時才重建幾何，受光強弱只改 alpha（光柱掃過時，照到的線更亮）。
type PixiModule = typeof import('pixi.js');

export type Point = [number, number];

export interface LinePath {
    points: Point[];
    /** 線寬（高度單位）。 */
    width: number;
    /** 基礎亮度 0..1。 */
    alpha: number;
    /** 描線開始的相對時刻 0..1（在整組的描線時長裡錯開）。 */
    delay: number;
    /** 描完這一條佔整組時長的比例。 */
    span: number;
    /** 虛線：實段與空段長度（高度單位）。 */
    dash?: [number, number];
}

export interface LineNode {
    at: Point;
    /** 閃點直徑（高度單位）。 */
    size: number;
    /** 出現的相對時刻 0..1。 */
    delay: number;
    twinklePhase: number;
}

export interface LineArtSpec {
    paths: LinePath[];
    nodes: LineNode[];
}

interface BuiltPath {
    spec: LinePath;
    graphics: Graphics;
    lengths: number[];
    total: number;
    drawn: number;
    midpoint: Point;
}

export interface LineArtLayer {
    view: Container;
    /** draw：整組描線進度 0..1；fade：整體亮度（進退場）。 */
    update: (time: number, draw: number, fade: number, beams: readonly ResolvedBeam[], color: number) => void;
    /**
     * 這一幀不畫（view 已隱藏）時調用。nextUse：下次出現的時刻，順放不會再出現給 Infinity。
     * 藏夠時間、且下次出現不近時放掉各條線的 GPU 數據，見 shouldUnloadLineArt。
     */
    idle: (time: number, nextUse: number) => void;
    destroy: () => void;
}

/** 藏起來多少秒（歌曲時間）之後才放 GPU 數據：剛淡出的線可能被回拖一下又要畫。 */
export const LINE_ART_UNLOAD_AFTER = 2 + LUMIERE_NEUTRAL_OFFSET;
/** 下次出現在這麼多秒之內就不放：馬上又要畫，放了只是白傳一遍。 */
export const LINE_ART_UNLOAD_LEAD = 4;

/**
 * 藏著的線稿這一幀該不該放掉 GPU 數據（滯回：藏夠 LINE_ART_UNLOAD_AFTER 秒，且離下次出現至少 LINE_ART_UNLOAD_LEAD 秒）。
 * 起因：軌跡過渡把整首歌併成一個單元，每個鏡頭的線稿都活到單元銷燬，畫過一次的每條線都留著一個 batcher 和兩塊緩衝。
 */
export const shouldUnloadLineArt = (hiddenSince: number, time: number, nextUse: number) =>
    time - hiddenSince >= LINE_ART_UNLOAD_AFTER && nextUse - time >= LINE_ART_UNLOAD_LEAD;

const cumulative = (points: Point[]) => {
    const lengths = [0];
    for (let i = 1; i < points.length; i += 1) {
        const [ax, ay] = points[i - 1]!;
        const [bx, by] = points[i]!;
        lengths.push(lengths[i - 1]! + Math.hypot(bx - ax, by - ay));
    }
    return lengths;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export const createLineArt = (
    pixi: PixiModule,
    options: { height: number; spec: LineArtSpec; starTexture: Texture },
): LineArtLayer => {
    const { height, spec } = options;
    const view = new pixi.Container();
    const pathsHolder = new pixi.Container();
    const nodesHolder = new pixi.Container();
    view.addChild(pathsHolder, nodesHolder);

    const paths: BuiltPath[] = spec.paths.filter(path => path.points.length > 1).map(path => {
        const graphics = new pixi.Graphics();
        pathsHolder.addChild(graphics);
        const lengths = cumulative(path.points);
        const mid = path.points[Math.floor(path.points.length / 2)]!;
        return { spec: path, graphics, lengths, total: lengths[lengths.length - 1]!, drawn: -1, midpoint: mid };
    });

    const nodes: Array<{ spec: LineNode; sprite: Sprite }> = spec.nodes.map(node => {
        const sprite = new pixi.Sprite(options.starTexture);
        sprite.anchor.set(0.5);
        sprite.position.set(node.at[0] * height, node.at[1] * height);
        nodesHolder.addChild(sprite);
        return { spec: node, sprite };
    });

    /** 畫出一條線的前 amount 長度（考慮虛線）。 */
    const redraw = (path: BuiltPath, amount: number) => {
        const g = path.graphics;
        g.clear();
        if (amount <= 0) return;
        const { points, dash } = path.spec;
        const limit = Math.min(amount, path.total);
        const period = dash ? dash[0] + dash[1] : 0;
        const at = (index: number, distance: number): Point => {
            const [ax, ay] = points[index - 1]!;
            const [bx, by] = points[index]!;
            const segment = path.lengths[index]! - path.lengths[index - 1]!;
            const f = segment > 0 ? (distance - path.lengths[index - 1]!) / segment : 0;
            return [(ax + (bx - ax) * f) * height, (ay + (by - ay) * f) * height];
        };
        g.moveTo(points[0]![0] * height, points[0]![1] * height);
        for (let i = 1; i < points.length; i += 1) {
            const start = path.lengths[i - 1]!;
            const end = Math.min(path.lengths[i]!, limit);
            if (start >= limit) break;
            if (!dash) {
                const [x, y] = at(i, end);
                g.lineTo(x, y);
                continue;
            }
            // 虛線：按週期的整數下標取出落在本段裡的每一截實線（不用浮點游標，避免卡在邊界上）。
            for (let k = Math.floor(start / period); k * period < end; k += 1) {
                const from = Math.max(start, k * period);
                const to = Math.min(end, k * period + dash[0]);
                if (to <= from) continue;
                const [ax, ay] = at(i, from);
                const [bx, by] = at(i, to);
                g.moveTo(ax, ay);
                g.lineTo(bx, by);
            }
        }
        const px = path.spec.width * height;
        g.stroke({ width: px * 3.2, color: 0xffffff, alpha: 0.12, cap: 'round', join: 'round' });
        g.stroke({ width: px, color: 0xffffff, alpha: 1, cap: 'round', join: 'round' });
    };

    // resident：畫過、GPU 數據可能還在；hiddenSince：這次藏起來的時刻（NaN 表示正在畫）。
    let resident = false;
    let hiddenSince = Number.NaN;

    const update = (time: number, draw: number, fade: number, beams: readonly ResolvedBeam[], color: number) => {
        resident = true;
        hiddenSince = Number.NaN;
        for (const path of paths) {
            const { delay, span } = path.spec;
            const local = clamp01((draw - delay) / Math.max(span, 1e-3));
            const eased = 1 - (1 - local) ** 3;
            const amount = eased * path.total;
            if (Math.abs(amount - path.drawn) > 1e-5) {
                redraw(path, amount);
                path.drawn = amount;
            }
            const lit = compressLight(lightAt(beams, path.midpoint[0], path.midpoint[1]));
            // 光束外的線也要看得見（參考圖裡取景框、葉片都在暗處），受光的部分再亮一截。
            path.graphics.alpha = Math.min(1, path.spec.alpha * fade * (0.55 + 0.9 * lit));
            path.graphics.tint = color;
        }
        for (const { spec: node, sprite } of nodes) {
            const appear = clamp01((draw - node.delay) / 0.08);
            const lit = compressLight(lightAt(beams, node.at[0], node.at[1]));
            const twinkle = 0.55 + 0.45 * Math.sin(time * 2.3 + node.twinklePhase);
            const alpha = appear * fade * (0.25 + 0.75 * lit) * twinkle;
            sprite.visible = alpha > 0.004;
            if (!sprite.visible) continue;
            const pop = 1 + (1 - appear) * 1.5;
            const px = node.size * height * pop * (0.8 + 0.2 * twinkle);
            sprite.width = px;
            sprite.height = px;
            sprite.alpha = alpha;
            sprite.tint = color;
        }
    };

    const idle = (time: number, nextUse: number) => {
        if (!resident) return;
        // 剛藏起來，或回拖到了藏起來之前：從這一刻重新計時。
        if (!(hiddenSince <= time)) hiddenSince = time;
        if (!shouldUnloadLineArt(hiddenSince, time, nextUse)) return;
        // 只放 GPU 數據，幾何指令留在 context 裡；再畫到時 Pixi 按指令重建、重傳，和描線期間每幀重畫走的是同一條路。
        // context 都是各條線自建的，沒有別人共用。
        for (const path of paths) path.graphics.context.unload();
        resident = false;
    };

    return {
        view,
        update,
        idle,
        // context: true 必須帶上：Pixi 8 的 Graphics.destroy 只要收到選項對象、卻沒寫 context: true，就不銷燬它自己建的
        // GraphicsContext。那個 context 還掛在渲染器的 GraphicsContextSystem 裡，連同它的 GPU 批數據（一個 batcher、
        // 兩塊頂點 / 索引緩衝）要等 Pixi 的 GC 空閒 60 秒後才回收；單元換得勤時，WebGL 緩衝會一直漲到那個窗口的量。
        destroy: () => view.destroy({ children: true, context: true }),
    };
};
