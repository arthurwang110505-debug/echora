// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/scene.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import type { Container } from 'pixi.js';
import type { Line, Theme } from '../../types';
import { createRng } from './lumiereRandom';
import { resolveThemeFontStack, resolveThemeFontWeight } from '../../utils/fontStacks';
import type { LumiereAudioFrame, TransformParams } from './lumiereKernel';
import { createBloomFilter, type BloomFilter } from './light/bloomFilter';
import { BURST_DURATION, burstLightBoost, createCrossBurst, MAX_BURSTS, planBursts, type BurstEvent } from './light/crossBurst';
import { createLightField } from './light/lightFieldShader';
import { createMotes, type MotesLayer } from './light/motes';
import { MAX_BEAMS, resolveBeams, type LightRig, type ResolvedBeam } from './light/rig';
import { createStarfall, starfallIgnition } from './light/starfall';
import type { LightSprites } from './light/sprites';
import { createLineArt, type LineArtLayer } from './lineart/lineArt';
import { buildShotIconArts } from './lineart/themeIcons';
import { keywordBurstColor, prepareLumiereKeywords } from './text/keywordColors';
import { createLyricEcho } from './text/lyricEcho';
import { createLyricWindow, type WindowTypography } from './text/lyricWindow';
import { CHAMPAGNE, hexOf, mixRgb, rgbOf, scaleRgb, WHITE, type Rgb } from './color';
import { createLumiereCamera, lumiereTypographyOfLine, resolveLumiereLeadShot } from './lumiereUnitLayout';
import type { LumiereSection } from './program';
import { LUMIERE_BLOOM, type BloomPreset, type BurstSpec, type LumiereProfile, type LumiereSceneTuning } from './types';

// Echora note: upstream opens this file with a "reference value" that is `(X + Math.imul(...))`
// minus itself, i.e. identically 0, plus a device-pixel-ratio read that only feeds it. The 20
// files carrying it all do the same thing, so the dead expressions are dropped and the offset
// stays as a named 0: every use site downstream is unchanged, and so is the rendering.
const LUMIERE_NEUTRAL_OFFSET = 0;


// src/components/visualizer/lumiere/scene.ts
// 一個場景單元（一個段落裡的一串連續鏡頭）的畫面：七層疊放（lumisynth docs/LUMIERE.md 第一節），每幀只由 t 決定。
//   圖形組（bloom）：光場（煙霧 + 體積光 + 眩光）→ 背景分詞碎片 → 星空 → 線稿 → 浮塵
//   素材插入層（mid，空容器，運行時可以往裡放素材，在場景之上、歌詞之下）
//   文字組（bloom）：十字爆閃 → 窗口裡的幾行字（徑跡、光暈、字、閃點）
//   前景：散景
// 整個單元只建一份的：歌詞窗口、背景碎片、浮塵、星空、運鏡（按第一個鏡頭的光位）。
// 隨鏡頭換的：光位（鏡頭邊界處兩套光束在同一個光場裡交叉漸變）與線稿（下一個提前描、上一個隨後淡出）。
// 主題：關鍵字（wordColors）點亮時帶關鍵字色（字、光暈、閃點、落在上面的十字爆閃、背景碎片）；
// 主題圖標（lyricsIcons）每個鏡頭散落幾枚在文字區外，和線稿同樣描出、同樣隨鏡頭交叉漸變。
// 容器本身透明，背景歸 folia 的共享背景層；暗場底由運行時鋪在所有場景之下（lumiereDarkField.ts），
// 不隨段落轉場變化，場景裡的光場不再畫它（uDark 恆為 0）。
// Pixi 模塊由調用方傳入（運行時經 loadPixi 取得），這裡只用它的類型。
type PixiModule = typeof import('pixi.js');

/** 單元裡的一個鏡頭：光位、時間、覆蓋哪幾行（options.lines 的下標）。 */
export interface SceneShot {
    profile: LumiereProfile;
    startTime: number;
    endTime: number;
    lines: number[];
}

export interface LumiereSceneOptions {
    width: number;
    height: number;
    resolution: number;
    seed: string;
    theme: Theme;
    tuning: LumiereSceneTuning;
    /** 單元涉及的歌詞行（窗口會排到它們）。 */
    lines: Line[];
    shots: SceneShot[];
    startTime: number;
    endTime: number;
    sprites: LightSprites;
    /** 這個單元是段落的開頭：星空點亮的開場只在這裡播放，段內後續單元直接從星空已亮的狀態開始。 */
    opening: boolean;
    /**
     * 收光的時間窗（出場轉場是「熄燈」時就是轉場窗口）：光、線稿、字在窗口裡熄掉。不給就不收——
     * 別的轉場交給運行時的模糊 / 縮放 / 交叉漸變銜接，場景自己不變暗，段落之間不會暗一下。
     */
    fadeOut?: { start: number; end: number } | null;
    /**
     * 音頻特徵（0..1）：低頻推光束亮度、高頻推浮塵閃爍、整體響度推煙霧濃度。每幀 update 調一次，
     * 參數是當前播放時間；folia 裡接實時分析（參數可以忽略），不給就當安靜。
     */
    audioAt?: (time: number) => LumiereAudioFrame;
    /** 統一覆蓋整個單元的排版（不給則按各鏡頭光位的默認排版）。 */
    typography?: WindowTypography;
    /** 單元由幾個段落無縫拼成時（軌跡過渡）各段落的範圍：運鏡按段落往返推拉，而不是整個單元推一次。 */
    sections?: LumiereSection[];
}

export interface LumiereScene {
    view: Container;
    graphics: Container;
    mid: Container;
    text: Container;
    front: Container;
    /** 十字爆閃的引爆時刻（調試與測試用）。 */
    burstTimes: number[];
    /** 某一行在時刻 time 的中心與透明度（調試與連貫性檢查用）。 */
    lineAnchor: (lineIndex: number, time: number) => { x: number; y: number; alpha: number };
    /** 時刻 time 的運鏡（舞臺容器的變換）；沒有運鏡時是 REST。只由 time 決定。 */
    camera: (time: number) => TransformParams;
    rest: TransformParams;
    update: (time: number) => void;
    destroy: () => void;
}

/** 鏡頭邊界處光位交叉漸變多久（秒）。 */
const HANDOFF = 0.9 + LUMIERE_NEUTRAL_OFFSET;
/** 光源（眩光）從上一個光位的位置移到新位置用多久（秒）：比光束的交叉漸變長，走三次緩入緩出。 */
const GLARE_MOVE = 1.6;

const easeInOutCubic = (value: number) => {
    const t = Math.min(1, Math.max(0, value));
    return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
};

const smooth = (value: number) => {
    const t = Math.min(1, Math.max(0, value));
    return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export interface LumierePalette {
    light: Rgb;
    lit: Rgb;
    unlit: Rgb;
}

/**
 * 光場著色器的暗場底（預乘）：folia 裡恆為 0。暗場底由運行時畫在所有場景之下（見 lumiereDarkField.ts），
 * 著色器的 uDark 通路保留給 lumisynth 那樣由場景自己鋪底的宿主。
 */
export const LUMIERE_SHADER_NO_DARK: [number, number, number, number] = [0, 0, 0, 0];

/** 未唱字偏向的冷灰藍。 */
const UNLIT_COOL: Rgb = [0.62, 0.68, 0.8];

/** 按最亮通道拉到 1：保留色相、去掉暗度，深色的主題色（淺色主題的字色）也能當發光色用；近黑時退回 fallback。 */
const glowOf = (rgb: Rgb, fallback: Rgb): Rgb => {
    const peak = Math.max(...rgb);
    return peak < 0.04 ? fallback : scaleRgb(rgb, 1 / peak);
};

/**
 * 光色與字色。themeMix（「主題色佔比」，0..1）為 0 時是原來的香檳金光（裡面摻 18% 強調色）；
 * 越高越跟隨主題：光色（光束、煙霧、輝光、線稿、畫框）→ 強調色，點亮的字 → 主色，未唱的字 → 次色（沒有就用主色）。
 * 主題色都先按最亮通道拉滿再混，所以佔比再高畫面也還是「發光」的，不會畫成暗塊。
 */
export const resolveLumierePalette = (theme: Theme, themeMix = 0): LumierePalette => {
    const mix = Math.min(1, Math.max(0, themeMix));
    const accent = rgbOf(theme.accentColor, CHAMPAGNE);
    let light = mixRgb(mixRgb(CHAMPAGNE, accent, 0.18), glowOf(accent, CHAMPAGNE), mix);
    const peak = Math.max(...light, 1e-3);
    light = scaleRgb(light, 1 / peak);
    const warmLit = mixRgb(light, WHITE, 0.2);
    const primary = glowOf(rgbOf(theme.primaryColor, warmLit), warmLit);
    const secondary = theme.secondaryColor ? glowOf(rgbOf(theme.secondaryColor, primary), primary) : primary;
    return {
        light,
        lit: mixRgb(warmLit, mixRgb(primary, WHITE, 0.2), mix),
        unlit: mixRgb(mixRgb(light, UNLIT_COOL, 0.55), mixRgb(secondary, UNLIT_COOL, 0.35), mix),
    };
};

/** 兩套光位之間的煙霧與眩光（光束另算：兩套都進光場，按強度交叉漸變）。 */
const blendRig = (from: LightRig, to: LightRig, k: number, glareK: number): LightRig => ({
    beams: [],
    fog: {
        density: lerp(from.fog.density, to.fog.density, k),
        tyndallBase: lerp(from.fog.tyndallBase, to.fog.tyndallBase, k),
        scale: lerp(from.fog.scale, to.fog.scale, k),
        driftX: lerp(from.fog.driftX, to.fog.driftX, k),
        driftY: lerp(from.fog.driftY, to.fog.driftY, k),
        warp: lerp(from.fog.warp, to.fog.warp, k),
        ambient: lerp(from.fog.ambient, to.fog.ambient, k),
    },
    // 光源移動走自己的緩動曲線（glareK），起步與到位都慢，不是勻速滑過去。
    glare: from.glare && to.glare
        ? {
            x: lerp(from.glare.x, to.glare.x, glareK),
            y: lerp(from.glare.y, to.glare.y, glareK),
            radius: lerp(from.glare.radius, to.glare.radius, glareK),
            intensity: lerp(from.glare.intensity, to.glare.intensity, glareK),
            streak: lerp(from.glare.streak, to.glare.streak, glareK),
        }
        : (k < 0.5 ? from.glare && { ...from.glare, intensity: from.glare.intensity * (1 - k * 2) } : to.glare && { ...to.glare, intensity: to.glare.intensity * (k * 2 - 1) }),
    // 焦散與干涉：前半段是上一個光位的（漸弱），後半段是新光位的（漸強）。
    caustic: fadeCaustic(k < 0.5 ? from.caustic : to.caustic, k < 0.5 ? 1 - k * 2 : k * 2 - 1),
    wave: k < 0.5
        ? from.wave && { ...from.wave, strength: from.wave.strength * (1 - k * 2) }
        : to.wave && { ...to.wave, strength: to.wave.strength * (k * 2 - 1) },
});

const fadeCaustic = (caustic: LightRig['caustic'], k: number): LightRig['caustic'] => caustic && {
    ...caustic,
    inBeam: caustic.inBeam * k,
    floor: caustic.floor && { ...caustic.floor, strength: caustic.floor.strength * k },
};

export const createLumiereScene = (pixi: PixiModule, options: LumiereSceneOptions): LumiereScene => {
    const { width, height, tuning, sprites } = options;
    const aspect = width / height;
    const palette = resolveLumierePalette(options.theme, tuning.themeColorMix);
    const shots = options.shots.length > 0 ? options.shots : [];
    // 領頭光位（文字區、字號、運鏡、浮塵、星空按它）：第一個有歌詞的鏡頭（lumiereUnitLayout.ts）。
    const lead = resolveLumiereLeadShot(shots).profile;

    // 每個鏡頭的光位（按單元與鏡頭播種）。
    const rigs = shots.map((shot, index) => shot.profile.light({ aspect, random: createRng(`${options.seed}:${index}:${shot.profile.kind}:light`) }));

    const view = new pixi.Container();
    const stage = new pixi.Container();
    view.addChild(stage);

    // 圖形組
    const graphics = new pixi.Container();
    // 運鏡最多把邊緣露出約 1.4%（手持浮動 0.6% + 呼吸縮放 0.4% + 平移超出推近的部分 + 旋轉），外擴 2% 蓋住。
    const overscan = Math.ceil(Math.max(width, height) * 0.02);
    const field = createLightField(pixi, width, height, overscan);
    const lineArts: LineArtLayer[] = shots.map((shot, index) => createLineArt(pixi, {
        height,
        spec: shot.profile.lineArt({ aspect, random: createRng(`${options.seed}:${index}:${shot.profile.kind}:art`) }),
        starTexture: sprites.star,
    }));
    const lineArtHolder = new pixi.Container();
    lineArts.forEach(layer => lineArtHolder.addChild(layer.view));
    lineArtHolder.visible = tuning.lineArt;
    // 文字區（高度單位）：整個單元按領頭光位排字，圖標避開它。
    const textRegion = { cx: lead.region.cx * aspect, cy: lead.region.cy, w: lead.region.w * aspect, h: lead.region.h };
    // 主題圖標：每個鏡頭一組（沒有圖標或開關關掉時一組都沒有，不退回默認圖標），獨立於線稿開關。
    const iconArts: LineArtLayer[] = buildShotIconArts({
        icons: options.theme.lyricsIcons,
        enabled: tuning.themeIcons && !tuning.textOnly,
        shotKinds: shots.map(shot => shot.profile.kind),
        seed: options.seed,
        aspect,
        avoid: textRegion,
    }).map(spec => createLineArt(pixi, { height, spec, starTexture: sprites.star }));
    const iconHolder = new pixi.Container();
    iconArts.forEach(layer => iconHolder.addChild(layer.view));
    const motes = createMotes(pixi, {
        width, height, seed: `${options.seed}:motes`, texture: sprites.dot,
        spec: { ...lead.motes, count: Math.round(lead.motes.count * tuning.moteAmount) },
    });
    const baseStarfall = lead.starfall ?? null;
    // 開場最多佔單元的 40%；單元太短（< 2 秒）就不播開場，直接從星空已亮開始。
    const unitDuration = options.endTime - options.startTime;
    // 只畫字（textOnly）時沒有開場（光一開始就是滿的，字按滿光算明暗）。
    const canOpen = options.opening && unitDuration >= 2 && !tuning.textOnly;
    const starfallSpec = baseStarfall && canOpen
        ? { ...baseStarfall, opening: Math.min(baseStarfall.opening, Math.max(0.8, unitDuration * 0.4)) }
        : baseStarfall;
    const starfall = starfallSpec
        ? createStarfall(pixi, {
            width, height, seed: options.seed, spec: starfallSpec,
            dot: sprites.dot, star: sprites.star, streak: sprites.streak,
        })
        : null;
    // 開場：主光柱在傾瀉到一半左右才點亮（光源處閃一下）。段內後續單元沒有開場，星空一開始就是落定的。
    const opening = canOpen && starfallSpec !== null;
    const ignition = opening ? starfallIgnition(starfallSpec!) : 0;
    const starOffset = starfallSpec && !opening ? starfallSpec.opening + 20 : 0;
    // 背景歌詞：唱到的詞被採集成巨大的空心字碎片，沿主光束漂下去；在光場之上、星空與線稿之下。
    const echoSpec = lead.echo ?? { size: 0.34 };
    // 關鍵字：匹配器整個單元一份，每行在構建時匹配一次。
    const keywords = prepareLumiereKeywords(options.theme.wordColors, tuning.keywordColors);
    const echo = tuning.echo > 0 && !tuning.textOnly
        ? createLyricEcho(pixi, {
            width,
            height,
            lines: options.lines,
            font: resolveThemeFontStack(options.theme),
            weight: resolveThemeFontWeight(options.theme, 500),
            resolution: options.resolution,
            seed: options.seed,
            size: echoSpec.size,
            opacity: tuning.echo,
            keywords,
        })
        : null;
    graphics.addChild(
        field.view,
        ...(echo ? [echo.view] : []),
        ...(starfall ? [starfall.view] : []),
        lineArtHolder,
        iconHolder,
        motes.view,
    );
    graphics.filterArea = new pixi.Rectangle(-overscan, -overscan, width + overscan * 2, height + overscan * 2);

    // 素材插入層
    const mid = new pixi.Container();

    // 文字組。第 i 行成為當前行時，用它所在鏡頭的排版（不在任何鏡頭裡的行跟隨前一個鏡頭）。
    const typographyOfLine = lumiereTypographyOfLine(shots);
    const window = createLyricWindow(pixi, {
        width,
        height,
        lines: options.lines,
        font: resolveThemeFontStack(options.theme),
        weight: resolveThemeFontWeight(options.theme, 500),
        resolution: options.resolution,
        region: {
            cx: lead.region.cx * aspect,
            cy: lead.region.cy,
            w: lead.region.w * aspect,
            h: lead.region.h,
        },
        heroPx: lead.heroSize * height,
        neighbors: tuning.windowNeighbors,
        typography: options.typography ?? lead.typography,
        typographyOf: options.typography ? undefined : typographyOfLine,
        decay: { ...lead.decay, strength: lead.decay.strength * tuning.decay },
        alwaysFly: tuning.trails,
        seed: options.seed,
        sprites,
        letterSpacing: 0.04,
        keywords,
    });
    // 十字爆閃在字的下面（字壓在光上才讀得清），與字共用文字組的 bloom。只在聲明瞭 burst 的鏡頭覆蓋的行裡引爆。
    const burstTriggers = shots.flatMap((shot, shotIndex) => {
        const spec: BurstSpec | null = shot.profile.burst ?? null;
        if (!spec) return [];
        const covered = new Set(shot.lines);
        const color = mixRgb(palette.light, spec.tint, 0.85);
        return planBursts(
            spec,
            options.lines.map((_, lineIndex) => ({ glyphs: covered.has(lineIndex) ? window.glyphTimes(lineIndex) : [] })),
            `${options.seed}:${shotIndex}`,
        ).map(trigger => {
            // 落在關鍵字上的十字用關鍵字的顏色。
            const keyword = window.glyphKeyword(trigger.lineIndex, trigger.glyphIndex);
            return { ...trigger, size: trigger.size * spec.size, color: keyword ? keywordBurstColor(color, palette.light, keyword) : color };
        });
    }).sort((a, b) => a.time - b.time);
    const burst = burstTriggers.length > 0 ? createCrossBurst(pixi, { sprites }) : null;
    const text = new pixi.Container();
    if (burst) text.addChild(burst.view);
    text.addChild(window.view);

    // 前景
    const front = new pixi.Container();
    let frontMotes: MotesLayer | null = null;
    if (lead.front && tuning.frontBokeh && !tuning.textOnly) {
        frontMotes = createMotes(pixi, {
            width, height, seed: `${options.seed}:front`, texture: sprites.bokeh, spec: lead.front,
        });
        front.addChild(frontMotes.view);
    }

    stage.addChild(graphics, mid, text, front);
    // 僅顯示歌詞文字：圖形組整個不畫（光束只在 CPU 上算，給字定明暗）。
    graphics.renderable = !tuning.textOnly;

    const bloomOf = (preset: BloomPreset, multiplier: number, padding: number): BloomFilter => createBloomFilter(pixi, {
        ...preset,
        strength: preset.strength * multiplier,
        padding,
        tint: [1, 1, 1],
    });
    const graphicsBloom = bloomOf(LUMIERE_BLOOM.graphics, tuning.bloom, 0);
    const textBloom = bloomOf(LUMIERE_BLOOM.text, tuning.textBloom, 0);
    // 文字組的 bloom 區域必須固定在畫面上：不給 filterArea 時 Pixi 每幀按內容包圍盒取區域（取整到像素），
    // 字一動，降採樣金字塔的網格原點與紋理尺寸就跟著跳，1/32 級的光暈相對字來回錯位，看起來一直在抖。
    // 給一塊遠大於畫面的區域，經運鏡變換後被視口裁剪，結果每幀都正好是整個視口。區域已覆蓋全畫面，所以不再加 padding。
    text.filterArea = new pixi.Rectangle(-width, -height, width * 3, height * 3);
    graphics.filters = tuning.bloom > 0 ? [graphicsBloom] : [];
    text.filters = tuning.textBloom > 0 ? [textBloom] : [];

    const lightHex = hexOf(palette.light);
    const rest: TransformParams = { x: width / 2, y: height / 2, pivotX: width / 2, pivotY: height / 2, scale: 1, rotation: 0 };

    /** 運鏡：整個單元（軌跡過渡時按原段落往返）緩慢推近 + 平移，再疊持續的手持感浮動。只由 time 決定。 */
    const camera = createLumiereCamera({
        width,
        height,
        camera: lead.camera,
        startTime: options.startTime,
        endTime: options.endTime,
        sections: options.sections,
        animationIntensity: options.theme.animationIntensity,
    });

    const activeShot = (time: number) => {
        let index = 0;
        for (let i = 0; i < shots.length; i += 1) if (shots[i]!.startTime <= time) index = i;
        return index;
    };

    const update = (time: number) => {
        const local = time - options.startTime;
        // 開場各段交疊：光柱在點亮前 0.4 秒就開始慢慢升起、1.6 秒才到滿，不是「星落完 → 光亮 → 線稿」一段段來。
        // 沒有開場的單元一開始就是滿光（銜接交給運行時的轉場），不從暗處升起。
        const enter = opening ? smooth((local - ignition + 0.4) / 1.6) : 1;
        // 點亮的一瞬光源處閃一下。
        const ignite = opening && local >= ignition ? 1.8 * Math.exp(-(local - ignition) / 0.35) : 0;
        const fadeOut = options.fadeOut;
        const exit = fadeOut ? 1 - smooth((time - fadeOut.start) / Math.max(fadeOut.end - fadeOut.start, 0.05)) : 1;
        const intensity = enter * exit;

        const transform = camera(time);
        stage.pivot.set(transform.pivotX, transform.pivotY);
        stage.position.set(transform.x, transform.y);
        stage.scale.set(transform.scale);
        stage.rotation = transform.rotation;

        // 正在進行的爆閃（最多 MAX_BURSTS 個），以及它們給整個光場的一下提亮。
        const events: BurstEvent[] = [];
        let boost = 0;
        for (const trigger of burstTriggers) {
            const age = time - trigger.time;
            if (age < 0 || age > BURST_DURATION) continue;
            boost += burstLightBoost(age);
            if (events.length < MAX_BURSTS) {
                const anchor = window.glyphAnchor(trigger.lineIndex, trigger.glyphIndex, time);
                events.push({
                    age,
                    x: anchor.x,
                    y: anchor.y + anchor.fontPx * trigger.dy,
                    length: anchor.fontPx * trigger.size,
                    color: trigger.color,
                });
            }
        }
        // 一串小十字連著炸時提亮會疊加，封個頂。
        boost = Math.min(boost, 0.45);
        burst?.update(events);

        // 光位：當前鏡頭的光束漸強、上一個鏡頭的漸弱，兩套都進光場（超過上限時留最亮的）。
        const audio = options.audioAt?.(time) ?? { bass: 0, treble: 0, power: 0 };
        const response = tuning.audioResponse;
        const index = activeShot(time);
        const sinceShot = time - shots[index]!.startTime;
        const handoff = index > 0 ? smooth(sinceShot / HANDOFF) : 1;
        const glareK = index > 0 ? easeInOutCubic(sinceShot / GLARE_MOVE) : 1;
        const drive = (shotIndex: number, weight: number) => ({
            intensity: intensity * tuning.lightIntensity * (1 + boost) * weight,
            bass: Math.min(1, audio.bass) * response,
            color: palette.light,
            local: time - shots[shotIndex]!.startTime,
        });
        let beams: ResolvedBeam[] = resolveBeams(rigs[index]!, time, aspect, drive(index, handoff));
        let rig = rigs[index]!;
        if (handoff < 1) {
            const previous = resolveBeams(rigs[index - 1]!, time, aspect, drive(index - 1, 1 - handoff));
            beams = [...beams, ...previous].sort((a, b) => b.intensity - a.intensity).slice(0, MAX_BEAMS);
        }
        if (handoff < 1 || glareK < 1) rig = blendRig(rigs[index - 1]!, rigs[index]!, handoff, glareK);
        // 僅顯示歌詞文字（textOnly）：圖形組整個不畫，這些層也不必每幀更新；光束照常算（上面），字的明暗靠它。
        if (!tuning.textOnly) {
            field.update({
                beams,
                rig,
                time,
                // 整體響度讓煙霧濃一點（最多 +20%）。
                fogScale: tuning.fogDensity * (1 + boost * 0.5) * (1 + 0.2 * Math.min(1, audio.power) * response),
                color: palette.light,
                glareScale: intensity * tuning.lightIntensity * (1 + boost * 1.5 + ignite),
                dark: LUMIERE_SHADER_NO_DARK,
                octaves: tuning.fogOctaves,
                // 字排在領頭光位的文字區裡（整個單元一份）。
                textRegion: lead.region,
            });
            echo?.update({ time, beams, color: lightHex, intensity: smooth(local / 1.2) * exit });
            starfall?.update(local + starOffset, time, beams, lightHex, exit);
            // 線稿：每個鏡頭提前 0.6 秒開始描（第一個鏡頭在開場時與星落、光起交疊），鏡頭結束後 0.8 秒淡出——
            // 上一個的淡出與下一個的描出交疊。主題圖標跟著同一個鏡頭的節奏（不乘線稿的亮度倍率）。
            lineArts.forEach((layer, shotIndex) => {
                const shot = shots[shotIndex]!;
                const begin = shotIndex === 0 ? options.startTime + ignition - 0.6 : shot.startTime - 0.6;
                const out = shotIndex === shots.length - 1 ? 1 : 1 - smooth((time - shot.endTime) / 0.8);
                const base = smooth((time - begin) / 1.2) * out * exit;
                const draw = (time - begin) / 3.6;
                const fade = base * (shot.profile.artGain ?? 1);
                // 下次出現：還沒開始描就是 begin，窗口裡就是現在；淡出之後順放不會再出現（回拖回來會重新 update）。
                // 藏著的線稿交給 idle 按滯回放掉 GPU 數據——軌跡過渡整首一個單元時，畫過的鏡頭線稿不然會一直佔著緩衝。
                const nextUse = time < begin ? begin : time <= shot.endTime + 0.8 ? time : Number.POSITIVE_INFINITY;
                layer.view.visible = fade > 0.003;
                if (layer.view.visible) layer.update(time, draw, fade, beams, lightHex);
                else layer.idle(time, nextUse);
                const icons = iconArts[shotIndex];
                if (icons) {
                    icons.view.visible = base > 0.003;
                    if (icons.view.visible) icons.update(time, draw, base, beams, lightHex);
                    else icons.idle(time, nextUse);
                }
            });
            // 高頻讓浮塵閃得更亮（最多 +50%）。
            motes.update(time, beams, lightHex, exit * (1 + 0.5 * Math.min(1, audio.treble) * response));
            frontMotes?.update(time, beams, lightHex, exit);
        }
        window.update({
            time,
            beams,
            litColor: palette.lit,
            unlitColor: palette.unlit,
            unlitAlpha: tuning.unlitOpacity,
            intensity: smooth(local / 0.6) * exit,
            hideTrails: tuning.hideTrails,
        });
    };

    return {
        view,
        graphics,
        mid,
        text,
        front,
        burstTimes: burstTriggers.map(trigger => trigger.time),
        lineAnchor: window.lineAnchor,
        camera,
        rest,
        update,
        destroy: () => {
            graphics.filters = [];
            text.filters = [];
            graphicsBloom.destroy();
            textBloom.destroy();
            field.destroy();
            lineArts.forEach(layer => layer.destroy());
            iconArts.forEach(layer => layer.destroy());
            motes.destroy();
            frontMotes?.destroy();
            burst?.destroy();
            starfall?.destroy();
            echo?.destroy();
            window.destroy();
            view.destroy({ children: true });
        },
    };
};
