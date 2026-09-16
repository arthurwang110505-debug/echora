import { useEffect, useRef, useState } from 'react';
import type { DioramaTuning, SonnetTuning } from '../types';

export type StagePerformanceTier = 'full' | 'balanced' | 'compact';

export interface StagePerformanceProfile {
    tier: StagePerformanceTier;
    targetFps: 30 | 45 | 60;
    canvasDpr: number;
    enableBlur: boolean;
    enableGlow: boolean;
    enableParticles: boolean;
    particleScale: number;
    textEffects: 'full' | 'reduced' | 'none';
}

const PROFILE_BY_TIER: Record<StagePerformanceTier, StagePerformanceProfile> = {
    full: {
        tier: 'full', targetFps: 60, canvasDpr: 2, enableBlur: true, enableGlow: true,
        enableParticles: true, particleScale: 1, textEffects: 'full',
    },
    balanced: {
        tier: 'balanced', targetFps: 45, canvasDpr: 1.5, enableBlur: true, enableGlow: true,
        enableParticles: true, particleScale: 0.65, textEffects: 'reduced',
    },
    compact: {
        tier: 'compact', targetFps: 30, canvasDpr: 1, enableBlur: false, enableGlow: false,
        enableParticles: false, particleScale: 0.35, textEffects: 'none',
    },
};

export const getStagePerformanceProfile = (tier: StagePerformanceTier): StagePerformanceProfile => PROFILE_BY_TIER[tier];

export interface CompactStageViewportInput {
    width: number;
    height: number;
    coarsePointer?: boolean;
    touchPoints?: number;
}

/**
 * Phone-sized Stage profile. The short side check also covers landscape phones while avoiding
 * applying the profile to ordinary desktop windows that happen to be narrow.
 */
export const shouldUseCompactStageProfile = ({
    width,
    height,
    coarsePointer = false,
    touchPoints = 0,
}: CompactStageViewportInput): boolean => {
    const minViewportSide = Math.min(width, height);
    const phoneSized = minViewportSide <= 480;
    return minViewportSide <= 600 && (phoneSized || coarsePointer || touchPoints > 0);
};

const readInitialStageTier = (): StagePerformanceTier => {
    if (typeof window === 'undefined') return 'full';
    const mobile = shouldUseCompactStageProfile({
        width: window.innerWidth,
        height: window.innerHeight,
        coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
        touchPoints: navigator.maxTouchPoints ?? 0,
    });
    const lowCoreCount = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4;
    const lowMemory = typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory === 'number'
        && ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4;
    if (mobile && (lowCoreCount || lowMemory)) return 'compact';
    if (mobile || lowCoreCount || lowMemory) return 'balanced';
    return 'full';
};

/**
 * One shared frame-budget observer for the mounted visualizer. It only changes
 * tier after a streak of slow/good frames, so quality cannot oscillate around a
 * single missed frame.
 */
export const useStagePerformanceProfile = (): StagePerformanceProfile => {
    const [tier, setTier] = useState<StagePerformanceTier>(readInitialStageTier);
    const tierRef = useRef(tier);
    tierRef.current = tier;

    useEffect(() => {
        let raf = 0;
        let previous = performance.now();
        let slowFrames = 0;
        let goodFrames = 0;

        const sample = (now: number) => {
            const frameMs = now - previous;
            previous = now;
            if (frameMs > 42) {
                slowFrames += 1;
                goodFrames = 0;
            } else if (frameMs < 25) {
                goodFrames += 1;
                slowFrames = 0;
            } else {
                slowFrames = 0;
                goodFrames = 0;
            }

            const current = tierRef.current;
            if (slowFrames >= 8 && current !== 'compact') {
                setTier(current === 'full' ? 'balanced' : 'compact');
                slowFrames = 0;
            } else if (goodFrames >= 180 && current !== 'full') {
                setTier(current === 'compact' ? 'balanced' : 'full');
                goodFrames = 0;
            }
            raf = requestAnimationFrame(sample);
        };

        raf = requestAnimationFrame(sample);
        return () => cancelAnimationFrame(raf);
    }, []);

    return getStagePerformanceProfile(tier);
};

const readCompactStageProfile = (): boolean => {
    if (typeof window === 'undefined') return false;
    return shouldUseCompactStageProfile({
        width: window.innerWidth,
        height: window.innerHeight,
        coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
        touchPoints: navigator.maxTouchPoints ?? 0,
    });
};

export const useCompactStageProfile = (): boolean => {
    const [isCompact, setIsCompact] = useState(readCompactStageProfile);

    useEffect(() => {
        const update = () => {
            setIsCompact(readCompactStageProfile());
        };

        update();
        window.addEventListener('resize', update);
        window.addEventListener('orientationchange', update);
        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('orientationchange', update);
        };
    }, []);

    return isCompact;
};

/**
 * Keep every Sonnet visual layer and transition on touch-sized viewports.
 * Performance must come from scheduling and retained scene data, not from silently
 * changing the composition the user selected in the settings panel.
 */
export const resolveCompactSonnetTuning = (
    tuning: SonnetTuning,
    compact: boolean | StagePerformanceTier,
): SonnetTuning => compact === true || compact === 'compact' ? {
    ...tuning,
    // Keep Sonnet's composition intact, but avoid rasterising the full scene at
    // desktop-quality resolution on a phone-sized viewport.
    textureResolution: Math.min(tuning.textureResolution, 1),
} : compact === 'balanced' ? {
    ...tuning,
    textureResolution: Math.min(tuning.textureResolution, 1.25),
} : tuning;

/** Keep Diorama's path and text intact while bounding its mobile point-cloud and glow workload. */
export const resolveCompactDioramaTuning = (
    tuning: DioramaTuning,
    compact: boolean | StagePerformanceTier,
): DioramaTuning => compact === true || compact === 'compact' ? {
    ...tuning,
    particleDensity: Math.min(tuning.particleDensity, 192),
    particleGlowEnabled: false,
    particleGlowIntensity: 0,
    backgroundParticleCircumference: Math.min(tuning.backgroundParticleCircumference, 10),
    backgroundParticleRadial: Math.min(tuning.backgroundParticleRadial, 1),
    glowIntensity: Math.min(tuning.glowIntensity, 0.65),
    soulIntensity: Math.min(tuning.soulIntensity, 0.65),
    gradientIntensity: Math.min(tuning.gradientIntensity, 0.75),
} : compact === 'balanced' ? {
    ...tuning,
    particleDensity: Math.min(tuning.particleDensity, 288),
    backgroundParticleCircumference: Math.min(tuning.backgroundParticleCircumference, 12),
    backgroundParticleRadial: Math.min(tuning.backgroundParticleRadial, 1),
    particleGlowIntensity: Math.min(tuning.particleGlowIntensity, 0.25),
} : tuning;

/** Fume framing uses a narrower target line-height on phones to keep the article inside the viewport. */
export const resolveFumeCameraScaleForViewport = (
    lineHeight: number,
    viewport: { width: number; height: number },
    compact: boolean,
    contentWidth = 0,
): number => {
    const minViewportSide = Math.max(Math.min(viewport.width, viewport.height), 1);
    const targetLineHeight = compact
        ? Math.max(Math.min(minViewportSide * 0.0725, 64), 36)
        : Math.max(Math.min(minViewportSide * 0.115, 124), 64);
    const minScale = compact ? 0.12 : 0.88;
    const maxScale = compact ? 1.16 : 2.2;
    const safeMargin = compact ? Math.min(Math.max(viewport.width * 0.06, 16), 24) : 0;
    const widthFitScale = compact && contentWidth > 0
        ? (Math.max(viewport.width, 1) - safeMargin * 2) / contentWidth
        : maxScale;
    const effectiveMaxScale = Math.min(maxScale, Math.max(widthFitScale, minScale));
    const effectiveMinScale = compact && contentWidth > 0
        ? Math.min(minScale, effectiveMaxScale)
        : minScale;
    return Math.max(effectiveMinScale, Math.min(
        targetLineHeight / Math.max(lineHeight, 1),
        effectiveMaxScale,
    ));
};

export const resolveFumeCameraXForViewport = (
    targetX: number,
    blockLeft: number,
    blockRight: number,
    viewportWidth: number,
    scale: number,
    compact: boolean,
): number => {
    if (!compact) return targetX;

    const safeViewportWidth = Math.max(viewportWidth, 1);
    const safeMargin = Math.min(Math.max(safeViewportWidth * 0.06, 16), 24);
    const visibleWorldHalfWidth = Math.max(safeViewportWidth - safeMargin * 2, 1)
        / (2 * Math.max(scale, 0.001));
    const minCameraX = blockRight - visibleWorldHalfWidth;
    const maxCameraX = blockLeft + visibleWorldHalfWidth;

    if (minCameraX > maxCameraX) {
        return (blockLeft + blockRight) * 0.5;
    }

    return Math.min(Math.max(targetX, minCameraX), maxCameraX);
};

export const resolveFumeCameraYForViewport = (
    targetY: number,
    blockTop: number,
    blockBottom: number,
    viewportHeight: number,
    scale: number,
    compact: boolean,
): number => {
    if (!compact) return targetY;

    const safeViewportHeight = Math.max(viewportHeight, 1);
    const safeMargin = Math.min(Math.max(safeViewportHeight * 0.08, 48), 88);
    const visibleWorldHalfHeight = Math.max(safeViewportHeight - safeMargin * 2, 1)
        / (2 * Math.max(scale, 0.001));
    const minCameraY = blockBottom - visibleWorldHalfHeight;
    const maxCameraY = blockTop + visibleWorldHalfHeight;

    if (minCameraY > maxCameraY) {
        return (blockTop + blockBottom) * 0.5;
    }

    return Math.min(Math.max(targetY, minCameraY), maxCameraY);
};

export interface FumeRenderableLineBounds {
    left: number;
    top: number;
    width: number;
}

export interface FumeContentFrameBounds {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

/** Resolve the actual rendered text bounds used for compact Fume camera safety. */
export const resolveFumeContentFrameBounds = (
    block: { x: number; y: number; width: number; height: number },
    renderLines: ReadonlyArray<FumeRenderableLineBounds>,
    lineHeight: number,
): FumeContentFrameBounds => {
    const fallback = {
        left: block.x,
        top: block.y,
        right: block.x + block.width,
        bottom: block.y + block.height,
    };
    const finiteLines = renderLines.filter(line => (
        Number.isFinite(line.left)
        && Number.isFinite(line.top)
        && Number.isFinite(line.width)
        && line.width >= 0
    ));

    if (finiteLines.length === 0) {
        return fallback;
    }

    const bounds = {
        left: Math.min(...finiteLines.map(line => block.x + line.left)),
        top: Math.min(...finiteLines.map(line => block.y + line.top)),
        right: Math.max(...finiteLines.map(line => block.x + line.left + line.width)),
        bottom: Math.max(...finiteLines.map(line => block.y + line.top + Math.max(lineHeight, 0))),
    };

    return Object.values(bounds).every(Number.isFinite) ? bounds : fallback;
};

export const resolveFumeCameraSafetyCorrection = (
    position: number,
    velocity: number,
    safePosition: number,
    dt: number,
    response = 18,
) => {
    if (![position, velocity, safePosition, dt, response].every(Number.isFinite)) {
        return { position: safePosition, velocity: 0 };
    }
    const safeDt = Math.min(Math.max(dt, 1 / 240), 0.05);
    const correctionAmount = 1 - Math.exp(-safeDt * Math.max(response, 0));
    const correction = safePosition - position;
    const isPushingAway = correction !== 0 && Math.sign(velocity) === Math.sign(-correction);
    return {
        position: position + correction * correctionAmount,
        velocity: isPushingAway
            ? velocity * (1 - correctionAmount * 0.9)
            : velocity,
    };
};

export const resolveFumeCanvasDpr = (devicePixelRatio: number, tier: StagePerformanceTier | boolean): number => {
    const safeDpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
    // Fume redraws the full viewport and runs a separate glow pass. Compact
    // renders at DPR 1; balanced keeps a modest 1.5 ceiling instead of
    // rasterising a 3x phone screen at its native DPR on every frame.
    if (tier === true || tier === 'compact') return Math.min(safeDpr, 1);
    if (tier === 'balanced') return Math.min(safeDpr, 1.5);
    return Math.min(safeDpr, 2);
};

export const resolveStageFrameInterval = (tier: StagePerformanceTier): number => (
    1000 / getStagePerformanceProfile(tier).targetFps
);
