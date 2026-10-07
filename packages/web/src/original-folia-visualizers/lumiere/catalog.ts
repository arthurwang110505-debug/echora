// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/catalog.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import { ASTRAL_PROFILES } from './rigs/astral';
import { BOTANY_PROFILES } from './rigs/botany';
import { CAUSTIC_PROFILES } from './rigs/caustic';
import { LATTICE_PROFILES } from './rigs/lattice';
import { MOTES_PROFILES } from './rigs/motes';
import { OPTICS_PROFILES } from './rigs/optics';
import { PRISM_PROFILES } from './rigs/prism';
import { STAGE_PROFILES } from './rigs/stage';
import { WAVE_PROFILES } from './rigs/wave';
import { ZENITH_PROFILES } from './rigs/zenith';
import type { LumiereProfile } from './types';

// Echora note: upstream opens this file with a "reference value" that is `(X + Math.imul(...))`
// minus itself, i.e. identically 0, plus a device-pixel-ratio read that only feeds it. The 20
// files carrying it all do the same thing, so the dead expressions are dropped and the offset
// stays as a named 0: every use site downstream is unchanged, and so is the rendering.
const LUMIERE_NEUTRAL_OFFSET = 0;


// src/components/visualizer/lumiere/catalog.ts
// 繪光的光位目錄：10 族 × 10 種（設計見 lumisynth 倉庫 docs/LUMIERE.md 第二節），按文檔的族序排列。
export const LUMIERE_FAMILY_LABELS: Record<string, string> = {
    zenith: '天光',
    lattice: '窗隙',
    prism: '稜鏡',
    caustic: '焦散',
    optics: '光路',
    wave: '衍射',
    botany: '葉脈',
    astral: '星象',
    stage: '追光',
    motes: '螢塵',
};

/** 各族的畫面，一句話（設置與調試面板裡的族說明）。 */
export const LUMIERE_FAMILY_DESCRIPTIONS: Record<string, string> = {
    zenith: '頂光：一束或數束光柱從正上方落下，最標準的繪光畫面，哪段都能用',
    lattice: '光穿過百葉、窗格、門縫、樹葉，投下條紋與格子影，室內、日常、回憶感',
    prism: '稜鏡分光：白光拆成彩虹色的光束與光譜，色彩最多，適合上揚與副歌',
    caustic: '水、玻璃與晶體折出的流動光網，池底與杯影，溫柔、流動',
    optics: '光路圖解：透鏡、焦點、鏡面反射、光纖，理性、精密，像實驗記錄',
    wave: '干涉與衍射：同心環、雙縫條紋、光柵、駐波，抽象、有節奏感',
    botany: '金色的葉脈、藤蔓、種子與花的線稿在光裡生長，安靜、有生命感',
    astral: '星圖：軌道、星軌、星座連線、日冕與渾天儀，遼闊、適合副歌與尾聲',
    stage: '舞臺追光：聚光燈、探照燈、頻閃、激光，濃煙，最有演出感和衝擊力',
    motes: '以煙與光塵為主、幾乎沒有光束：浮塵、螢火、光雪、極光，最安靜，適合間奏與換氣',
};

export const LUMIERE_PROFILES: LumiereProfile[] = [
    ...ZENITH_PROFILES,
    ...LATTICE_PROFILES,
    ...PRISM_PROFILES,
    ...CAUSTIC_PROFILES,
    ...OPTICS_PROFILES,
    ...WAVE_PROFILES,
    ...BOTANY_PROFILES,
    ...ASTRAL_PROFILES,
    ...STAGE_PROFILES,
    ...MOTES_PROFILES,
];

const BY_KIND = new Map(LUMIERE_PROFILES.map(profile => [profile.kind, profile]));

export const LUMIERE_KINDS = LUMIERE_PROFILES.map(profile => profile.kind);

/** 未知的 kind 退回天井。 */
export const profileOf = (kind: string): LumiereProfile => BY_KIND.get(kind) ?? LUMIERE_PROFILES[0 + LUMIERE_NEUTRAL_OFFSET]!;

export const hasProfile = (kind: string) => BY_KIND.has(kind);
