// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/light/rig.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile

// Echora note: upstream opens this file with a "reference value" that is `(X + Math.imul(...))`
// minus itself, i.e. identically 0, plus a device-pixel-ratio read that only feeds it. The 20
// files carrying it all do the same thing, so the dead expressions are dropped and the offset
// stays as a named 0: every use site downstream is unchanged, and so is the rendering.
const LUMIERE_NEUTRAL_OFFSET = 0;

// src/components/visualizer/lumiere/light/rig.ts
// 光位（rig）：一個鏡頭的光束、煙霧、光源眩光的聲明式描述，以及光束強度的 CPU 算法。
// 著色器（lightFieldShader.ts）與這裡用同一個公式：字與浮塵的亮度按 CPU 這一份算，光場按 GLSL 那一份畫，
// 兩邊一致，光柱掃到哪裡，哪裡的字就亮。
//
// 座標：光場內部一律用「以畫面高度為 1」的單位（u = 像素 / 高度），y 向下；角度 0 = 向右，π/2 = 向下。
// 聲明裡的位置用畫面比例（x 佔寬、y 佔高），解析時換算。
export const MAX_BEAMS = 6 + LUMIERE_NEUTRAL_OFFSET;

export interface Oscillation {
    amplitude: number;
    /** 秒。 */
    period: number;
    /** 0..1。 */
    phase: number;
}

export interface BeamSpec {
    /** 光源位置（畫面比例，可以在畫外）。 */
    x: number;
    y: number;
    /** 弧度，π/2 = 豎直向下。 */
    angle: number;
    /** 半張角（弧度）。負數為會聚：光束先收窄到焦點，過了焦點再散開（沙漏形）。 */
    spread: number;
    /** 光源處的寬度（高度單位）；窗、門縫之類的光有初始寬度。 */
    width?: number;
    /** 沿光束方向的衰減長度（高度單位）。 */
    length: number;
    /** 邊緣軟度 0..1（佔半寬的比例）。 */
    softness: number;
    intensity: number;
    /** 束內條紋：多少（0..1）、密度、滾動速度。 */
    streaks: number;
    streakFreq: number;
    streakSpeed: number;
    /** 中心比邊緣亮多少（0..1）。 */
    core?: number;
    sway?: Oscillation;
    pulse?: Oscillation;
    /** 乘在光色上。 */
    tint?: [number, number, number];
    /** 鏡頭開始後光束用多少秒從光源伸長到全長（垂降）；不給則一開始就是全長。 */
    reveal?: number;
    /** 窗影：光束截面上的遮擋圖樣（百葉、十字窗、格柵、葉隙）。 */
    gobo?: GoboSpec;
    /** 色散：光束從一側到另一側按色相展開成彩虹的程度 0..1（隻影響顏色）。 */
    spectrum?: number;
    /** 射程（高度單位）：光束走到這裡就收住（光路圖裡一段一段的光線）；不給則一直延伸。 */
    reach?: number;
}

/**
 * 窗影圖樣，在光束截面座標裡算：u = 橫向位置（−1..1，光束兩邊），v = 沿光束的距離（高度單位）。
 * blinds：平行光帶；cross：中間一道窗欞；lattice：斜交的菱格；leaves：斑駁的葉隙光斑。
 */
export type GoboPattern = 'blinds' | 'cross' | 'lattice' | 'leaves';

export interface GoboSpec {
    pattern: GoboPattern;
    /** 圖樣密度。 */
    frequency: number;
    /** 透光的比例 0..1（葉隙為閾值，越小越亮）。 */
    duty: number;
    /** 圖樣隨時間的滾動速度（葉隙為風吹動）。 */
    drift: number;
}

/** 焦散：水面焦散的光網，調製光束亮度，也可以在一塊區域（池底）單獨發亮。 */
export interface CausticSpec {
    /** 網格密度（每高度單位）、流動速度。 */
    scale: number;
    speed: number;
    /** 光束裡被焦散調製的程度 0..1。 */
    inBeam: number;
    /** 池底區域（畫面比例，中心 + 半徑）與亮度；不給則只調制光束。 */
    floor?: { cx: number; cy: number; rx: number; ry: number; strength: number };
}

/**
 * 干涉與衍射：在一塊區域裡發光的條紋。rings：牛頓環；slits：雙縫條紋；sources：兩個點源的圓波干涉；
 * airy：艾裡斑（中心亮斑 + 外環）。
 */
export interface WaveSpec {
    mode: 'rings' | 'slits' | 'sources' | 'airy';
    /** 區域中心與半徑（畫面比例 / 高度單位）。 */
    cx: number;
    cy: number;
    radius: number;
    /** 條紋密度、流動速度、亮度；sources 的兩個源之間的距離（高度單位）。 */
    frequency: number;
    speed: number;
    strength: number;
    separation?: number;
    /** 文字區裡把條紋壓暗多少（0..1，不給為 0.45）：條紋與字同色，疊在一起時字看不清。 */
    shield?: number;
}

export interface FogSpec {
    /** 丁達爾：光束只有經過煙時才可見；base 為沒有煙時仍可見的比例。 */
    density: number;
    tyndallBase: number;
    /** 噪聲頻率（每高度單位）。 */
    scale: number;
    /** 漂移速度（高度單位 / 秒）。煙往上飄時 y 為負。 */
    driftX: number;
    driftY: number;
    /** 域扭曲強度，讓煙打卷。 */
    warp: number;
    /** 光束之外的整體煙霧亮度。 */
    ambient: number;
}

export interface GlareSpec {
    x: number;
    y: number;
    /** 光暈半徑（高度單位）。 */
    radius: number;
    intensity: number;
    /** 橫向拉絲（anamorphic streak）強度。 */
    streak: number;
}

export interface LightRig {
    beams: BeamSpec[];
    fog: FogSpec;
    glare: GlareSpec | null;
    caustic?: CausticSpec;
    wave?: WaveSpec;
}

export const GOBO_PATTERN_ID: Record<GoboPattern, number> = { blinds: 1, cross: 2, lattice: 3, leaves: 4 };
export const WAVE_MODE_ID: Record<WaveSpec['mode'], number> = { rings: 1, slits: 2, sources: 3, airy: 4 };

/** 解析到某一時刻、換算到高度單位的光束。 */
export interface ResolvedBeam {
    ox: number;
    oy: number;
    dx: number;
    dy: number;
    halfWidth: number;
    tanSpread: number;
    softness: number;
    length: number;
    intensity: number;
    streaks: number;
    streakFreq: number;
    streakPhase: number;
    core: number;
    r: number;
    g: number;
    b: number;
    /** 窗影：圖樣編號（0 = 沒有）、密度、透光比例、滾動相位；色散程度。 */
    goboPattern: number;
    goboFreq: number;
    goboDuty: number;
    goboPhase: number;
    spectrum: number;
    /** 射程（高度單位），0 = 一直延伸。 */
    reach: number;
}

export interface LightDrive {
    /** 0..1，整體亮度倍率（光位的進場 / 退場、tuning 的光強都乘在這裡）。 */
    intensity: number;
    /** 音頻低頻 0..1（已乘過 tuning 的音頻響應），推光束亮度，見 audioLift。 */
    bass: number;
    /** 光色（0..1）。 */
    color: [number, number, number];
    /** 鏡頭開始後的秒數（光束的 reveal 按它算）；不給視為早已開始。 */
    local?: number;
}

/** 低頻把光束抬亮的上限（低頻打滿時亮 15%）。 */
export const AUDIO_GAIN = 0.15;

/** 低頻 → 光束亮度倍率：取 1.5 次方，弱的起伏几乎不動，只有重拍才抬起來。 */
export const audioLift = (bass: number) => 1 + AUDIO_GAIN * Math.max(0, bass) ** 1.5;

const oscillate = (osc: Oscillation | undefined, time: number) => (
    osc ? osc.amplitude * Math.sin((time / Math.max(osc.period, 0.001) + osc.phase) * Math.PI * 2) : 0
);

export const resolveBeams = (rig: LightRig, time: number, aspect: number, drive: LightDrive): ResolvedBeam[] => (
    rig.beams.slice(0, MAX_BEAMS).map(beam => {
        const angle = beam.angle + oscillate(beam.sway, time);
        const pulse = 1 + oscillate(beam.pulse, time);
        const tint = beam.tint ?? [1, 1, 1];
        const reveal = beam.reveal && drive.local !== undefined
            ? 0.06 + 0.94 * smoothstep(0, 1, drive.local / beam.reveal)
            : 1;
        return {
            ox: beam.x * aspect,
            oy: beam.y,
            dx: Math.cos(angle),
            dy: Math.sin(angle),
            halfWidth: (beam.width ?? 0) / 2,
            tanSpread: Math.tan(beam.spread),
            softness: beam.softness,
            length: beam.length * reveal,
            intensity: beam.intensity * pulse * drive.intensity * audioLift(drive.bass),
            streaks: beam.streaks,
            streakFreq: beam.streakFreq,
            streakPhase: time * beam.streakSpeed,
            core: beam.core ?? 0.5,
            r: tint[0] * drive.color[0],
            g: tint[1] * drive.color[1],
            b: tint[2] * drive.color[2],
            goboPattern: beam.gobo ? GOBO_PATTERN_ID[beam.gobo.pattern] : 0,
            goboFreq: beam.gobo?.frequency ?? 0,
            goboDuty: beam.gobo?.duty ?? 1,
            goboPhase: (beam.gobo?.drift ?? 0) * time,
            spectrum: beam.spectrum ?? 0,
            reach: beam.reach ?? 0,
        };
    })
);

// ---------------------------------------------------------------------------------------------
// 與 GLSL 一致的噪聲（Dave Hoskins 的 hash11，不用 sin，單精度下兩邊差得不多）

const fract = (value: number) => value - Math.floor(value);

export const hash11 = (input: number) => {
    let p = fract(input * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
};

export const valueNoise1 = (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return hash11(i) * (1 - u) + hash11(i + 1) * u;
};

const smoothstep = (edge0: number, edge1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
};

/** GLSL 的 hash12（Dave Hoskins）。 */
export const hash12 = (x: number, y: number) => {
    let a = fract(x * 0.1031);
    let b = fract(y * 0.1031);
    let c = fract(x * 0.1031);
    const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
    a += d;
    b += d;
    c += d;
    return fract((a + b) * c);
};

export const valueNoise2 = (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash12(ix, iy);
    const b = hash12(ix + 1, iy);
    const c = hash12(ix, iy + 1);
    const d = hash12(ix + 1, iy + 1);
    return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
};

/** 透光條：fract(x) 落在 [0, duty) 裡為 1，邊緣柔化。 */
const band = (x: number, duty: number) => {
    const f = fract(x);
    return 1 - smoothstep(duty - 0.06, duty + 0.06, f) + smoothstep(1 - 0.06, 1, f);
};

/** 窗影的影子裡仍透過的散射光（全黑的條紋像條形碼）。 */
export const GOBO_LEAK = 0.12;

/** 窗影圖樣在截面座標 (u, v) 上的透光率（GLSL 裡的 goboMask 與此相同）。 */
export const goboMask = (pattern: number, frequency: number, duty: number, phase: number, u: number, v: number) => (
    pattern > 0 ? GOBO_LEAK + (1 - GOBO_LEAK) * goboPattern(pattern, frequency, duty, phase, u, v) : 1
);

const goboPattern = (pattern: number, frequency: number, duty: number, phase: number, u: number, v: number) => {
    if (pattern === 1) return Math.min(1, band(u * frequency * 0.5 + phase, duty));
    if (pattern === 2) return smoothstep(duty * 0.5, duty * 0.5 + 0.08, Math.abs(u));
    if (pattern === 3) {
        return Math.min(1, band(u * frequency * 0.5 + v * frequency * 0.8 + phase, duty))
            * Math.min(1, band(u * frequency * 0.5 - v * frequency * 0.8 - phase, duty));
    }
    if (pattern === 4) return smoothstep(duty - 0.12, duty + 0.12, valueNoise2(u * frequency, v * frequency * 0.6 + phase));
    return 1;
};

/** 一束光在點 (x, y)（高度單位）處的強度（不含煙霧與顏色）。GLSL 裡的 beamMask 與此相同。 */
export const beamMask = (beam: ResolvedBeam, x: number, y: number) => {
    const px = x - beam.ox;
    const py = y - beam.oy;
    const along = px * beam.dx + py * beam.dy;
    if (along <= 0) return 0;
    const perp = Math.abs(px * -beam.dy + py * beam.dx);
    // 取絕對值：會聚的光束過了焦點再散開。
    const half = Math.abs(beam.halfWidth + along * beam.tanSpread) + 1e-4;
    const s = perp / half;
    const edge = smoothstep(1, 1 - Math.max(beam.softness, 0.02), s);
    if (edge <= 0) return 0;
    const signed = s * Math.sign(px * -beam.dy + py * beam.dx);
    const streak = 1 - beam.streaks + beam.streaks * valueNoise1(signed * beam.streakFreq + beam.streakPhase);
    const core = 1 - beam.core + beam.core * (1 - s * s);
    const falloff = Math.exp(-along / Math.max(beam.length, 0.001));
    const gobo = beam.goboPattern > 0 ? goboMask(beam.goboPattern, beam.goboFreq, beam.goboDuty, beam.goboPhase, signed, along) : 1;
    // 射程末端的收尾隨光束寬度變長：寬光束一刀切會變成方頭。
    const reach = beam.reach > 0 ? 1 - smoothstep(beam.reach - Math.max(0.04, half * 2.5), beam.reach, along) : 1;
    // 從光源處平滑漸起：光源背後沒有光，光源處的光束又有寬度，不漸起就會在光源處留一條硬直邊。
    const start = smoothstep(0, Math.abs(beam.halfWidth) * 2 + 0.01, along);
    return edge * streak * core * falloff * gobo * reach * start * beam.intensity;
};

/** 所有光束在 (x, y) 處的總強度（高度單位座標）。 */
export const lightAt = (beams: readonly ResolvedBeam[], x: number, y: number) => {
    let sum = 0;
    for (const beam of beams) sum += beamMask(beam, x, y);
    return sum;
};

/** 與著色器相同的柔和壓縮（著色器按最大通道壓，這裡只有標量強度），避免交疊處爆白。 */
export const compressLight = (value: number) => 1 - Math.exp(-value);
