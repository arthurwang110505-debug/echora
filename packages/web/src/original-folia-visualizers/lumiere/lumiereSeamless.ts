// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/lumiereSeamless.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { LumiereParagraph, LumiereSection } from './program';

// src/components/visualizer/lumiere/lumiereSeamless.ts
// 軌跡過渡（tuning.seamlessTransitions）：把按段落編好的程序併成一個覆蓋整首歌的場景單元。
// 鏡頭原樣保留（光位仍按段落性質與跨段落的 chain 選，和不開時逐個相同），只去掉段落邊界：
// 沒有出場轉場、沒有再次星空開場，段落之間和段內換鏡頭一樣在同一個光場裡交接
// （主光束擺到新角度、線稿擦除重描、字沿軌跡飛到新槽位）。
// 原來的段落範圍留在 sections 裡，運鏡按段落往返推拉（lumiereUnitLayout.ts 的 resolveLumiereCameraProgress）。

/** 把首尾相接的段落併成一個單元（少於兩段時原樣返回）。純函數。 */
export const mergeLumiereParagraphs = (paragraphs: readonly LumiereParagraph[]): LumiereParagraph[] => {
    if (paragraphs.length < 2) return [...paragraphs];
    const first = paragraphs[0]!;
    const last = paragraphs.at(-1)!;
    const sections: LumiereSection[] = paragraphs.map(paragraph => ({
        startTime: paragraph.startTime,
        endTime: paragraph.endTime,
        kind: paragraph.kind,
    }));
    return [{
        id: 'lumiere-seamless',
        index: 0,
        kind: first.kind,
        boundary: first.boundary,
        startTime: first.startTime,
        endTime: last.endTime,
        lyricEndTime: last.lyricEndTime,
        lineIndices: paragraphs.flatMap(paragraph => paragraph.lineIndices),
        lines: paragraphs.flatMap(paragraph => paragraph.lines),
        shots: paragraphs.flatMap(paragraph => paragraph.shots),
        transitionOut: null,
        opening: first.opening,
        sections,
    }];
};
