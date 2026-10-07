// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/lineart/themeIcons.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { LineArtSpec, LineNode, LinePath, Point } from './lineArt';
import { ICON_VIEWBOX, lucideIconPolylines, type IconPolyline } from './iconPaths';
import { resolveLucideIconNames } from '../../../utils/lucideIconResolver';
import { createRng } from '../lumiereRandom';

// Echora note: upstream opens this file with a "reference value" that is `(X + Math.imul(...))`
// minus itself, i.e. identically 0, plus a device-pixel-ratio read that only feeds it. The 20
// files carrying it all do the same thing, so the dead expressions are dropped and the offset
// stays as a named 0: every use site downstream is unchanged, and so is the rendering.
const LUMIERE_NEUTRAL_OFFSET = 0;


// src/components/visualizer/lumiere/lineart/themeIcons.ts
// 主題圖標線稿：theme.lyricsIcons（已解析成 lucide 名）按種子散落在構圖的空處——避開文字區、畫面邊緣和
// 彼此——每枚按圖標自己的折線描出來，和量角器光環、葉片同一種金色細線，節點上有閃點。
// 一個鏡頭一組（場景按鏡頭交叉漸變）；沒有可用圖標時返回空的線稿。座標一律高度單位。

/** 文字區（高度單位，中心 + 寬高）。 */
export interface IconAvoidRegion {
    cx: number;
    cy: number;
    w: number;
    h: number;
}

export interface PlacedIcon {
    name: string;
    cx: number;
    cy: number;
    /** 邊長（高度單位）。 */
    size: number;
    rotation: number;
}

export interface ThemeIconOptions {
    /** 已解析的 lucide 圖標名（resolveLucideIconNames）；未知名字會被忽略。 */
    names: readonly string[];
    aspect: number;
    /** 要避開的文字區。 */
    avoid: IconAvoidRegion;
    random: () => number;
    /** 從第幾個圖標開始輪流取（各鏡頭輪到不同的圖標）。 */
    offset?: number;
    /** 這一組放幾枚（默認 2–3 枚，按種子）。 */
    count?: number;
    /** 整組描線開始的相對時刻。 */
    delay?: number;
    alpha?: number;
}

/** 圖標邊長範圍、與文字區 / 彼此之間留的空、離畫面邊緣的距離（高度單位）。 */
const ICON_SIZE: [number, number] = [0.085, 0.13];
const TEXT_PAD = 0.05 + LUMIERE_NEUTRAL_OFFSET;
const EDGE = 0.05;
const ATTEMPTS = 48;

const overlapsRegion = (cx: number, cy: number, half: number, region: IconAvoidRegion, pad: number) => (
    Math.abs(cx - region.cx) < half + region.w / 2 + pad
    && Math.abs(cy - region.cy) < half + region.h / 2 + pad
);

/**
 * 按種子給圖標找落點：在畫面內（留邊）隨機取位置，拒絕與文字區（外擴 TEXT_PAD）或已放下的圖標重疊的候選。
 * 找不到空處的圖標就不放（文字區佔滿畫面時可能一枚都沒有）。
 */
export const placeThemeIcons = (options: ThemeIconOptions): PlacedIcon[] => {
    const names = options.names.filter(name => lucideIconPolylines(name) !== null);
    if (names.length === 0) return [];
    const { aspect, avoid, random } = options;
    const count = options.count ?? 2 + (random() < 0.5 ? 1 : 0);
    const offset = options.offset ?? 0;
    const placed: PlacedIcon[] = [];
    for (let i = 0; i < count; i += 1) {
        const name = names[(offset + i) % names.length]!;
        const size = ICON_SIZE[0] + random() * (ICON_SIZE[1] - ICON_SIZE[0]);
        const rotation = (random() - 0.5) * 0.3;
        const half = size * 0.72; // 轉動後的外接半徑（留一點餘量）
        for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
            const cx = EDGE + half + random() * Math.max(0, aspect - 2 * (EDGE + half));
            const cy = EDGE + half + random() * Math.max(0, 1 - 2 * (EDGE + half));
            if (overlapsRegion(cx, cy, half, avoid, TEXT_PAD)) continue;
            if (placed.some(other => Math.hypot(other.cx - cx, other.cy - cy) < (other.size + size) * 0.9)) continue;
            placed.push({ name, cx, cy, size, rotation });
            break;
        }
    }
    return placed;
};

/** 圖標折線（viewBox 座標）→ 畫面折線：以圖標中心為原點縮放、轉動、平移。 */
const transformPolyline = (polyline: IconPolyline, icon: PlacedIcon): Point[] => {
    const scale = icon.size / ICON_VIEWBOX;
    const cos = Math.cos(icon.rotation);
    const sin = Math.sin(icon.rotation);
    const half = ICON_VIEWBOX / 2;
    return polyline.points.map(([x, y]) => {
        const lx = (x - half) * scale;
        const ly = (y - half) * scale;
        return [icon.cx + lx * cos - ly * sin, icon.cy + lx * sin + ly * cos] as Point;
    });
};

const polylineLength = (points: readonly Point[]) => {
    let length = 0;
    for (let i = 1; i < points.length; i += 1) length += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
    return length;
};

/**
 * 擺好的圖標 → 線稿：每枚依次開始描（錯開 0.12），圖標內的筆畫再各錯開一點；最長那一筆的起點與
 * 另一個按種子挑的端點上各有一個閃點，筆畫描到時出現。
 */
export const themeIconsArt = (icons: readonly PlacedIcon[], random: () => number, delay = 0.18, alpha = 0.5): LineArtSpec => {
    const paths: LinePath[] = [];
    const nodes: LineNode[] = [];
    icons.forEach((icon, iconIndex) => {
        const polylines = lucideIconPolylines(icon.name);
        if (!polylines) return;
        const start = delay + iconIndex * 0.12;
        const strokes = polylines.map(polyline => transformPolyline(polyline, icon));
        strokes.forEach((points, strokeIndex) => {
            paths.push({
                points,
                width: 0.0013,
                alpha,
                delay: start + Math.min(strokeIndex, 8) * 0.035,
                span: 0.32,
            });
        });
        const longest = strokes.reduce((best, points, index) => (polylineLength(points) > polylineLength(strokes[best]!) ? index : best), 0);
        nodes.push({ at: strokes[longest]![0]!, size: 0.02, delay: start + 0.08, twinklePhase: random() * Math.PI * 2 });
        const other = strokes[Math.floor(random() * strokes.length)]!;
        if (strokes.length > 1) {
            nodes.push({ at: other[other.length - 1]!, size: 0.015, delay: start + 0.3, twinklePhase: random() * Math.PI * 2 });
        }
    });
    return { paths, nodes };
};

/** 一個鏡頭的主題圖標線稿：找落點 + 畫成線稿。沒有可用圖標時是空的。 */
export const buildThemeIconArt = (options: ThemeIconOptions): LineArtSpec => {
    const icons = placeThemeIcons(options);
    return themeIconsArt(icons, options.random, options.delay, options.alpha);
};

/**
 * 場景單元裡每個鏡頭的主題圖標線稿（與鏡頭一一對應）。開關關掉、主題沒有圖標或圖標名都無效時返回空數組——
 * 不退回默認圖標。每個鏡頭按 `${seed}:${鏡頭序號}:${光位}:icons` 播種，並輪到不同的圖標。
 */
export const buildShotIconArts = (options: {
    icons: readonly string[] | undefined;
    enabled: boolean;
    /** 每個鏡頭的光位 kind（播種用）。 */
    shotKinds: readonly string[];
    seed: string;
    aspect: number;
    avoid: IconAvoidRegion;
}): LineArtSpec[] => {
    if (!options.enabled) return [];
    const names = resolveLucideIconNames(options.icons).filter(name => lucideIconPolylines(name) !== null);
    if (names.length === 0) return [];
    return options.shotKinds.map((kind, index) => buildThemeIconArt({
        names,
        aspect: options.aspect,
        avoid: options.avoid,
        random: createRng(`${options.seed}:${index}:${kind}:icons`),
        offset: index * 2,
    }));
};
