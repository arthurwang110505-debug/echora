import { useEffect, useState } from 'react';
import type { DioramaTuning, SonnetTuning } from '../../types';

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

/** Keep the existing tuning contract while removing the most expensive optional Pixi passes on phones. */
export const resolveCompactSonnetTuning = (
    tuning: SonnetTuning,
    compact: boolean,
): SonnetTuning => compact ? {
    ...tuning,
    mgDensity: Math.min(tuning.mgDensity, 0.5),
    showGuide: false,
    showBackgroundMg: false,
    showFixedGeo: false,
    showGiantDecorativeText: false,
    showBackgroundDecor: false,
    enableTransitions: false,
    textureResolution: Math.min(tuning.textureResolution, 1),
    postProcessEnabled: false,
    postProcessGrain: 0,
    postProcessContrast: 0,
    postProcessRgbShift: 0,
    postProcessHalftone: 0,
    postProcessVignette: 0,
    postProcessLensDistortion: 0,
    postProcessLensDispersion: 0,
} : tuning;

/** Keep Diorama's path and text intact while bounding its mobile point-cloud and glow workload. */
export const resolveCompactDioramaTuning = (
    tuning: DioramaTuning,
    compact: boolean,
): DioramaTuning => compact ? {
    ...tuning,
    particleDensity: Math.min(tuning.particleDensity, 288),
    particleGlowEnabled: false,
    particleGlowIntensity: 0,
    backgroundParticleCircumference: Math.min(tuning.backgroundParticleCircumference, 12),
    backgroundParticleRadial: Math.min(tuning.backgroundParticleRadial, 1),
    glowIntensity: Math.min(tuning.glowIntensity, 0.65),
    soulIntensity: Math.min(tuning.soulIntensity, 0.65),
    gradientIntensity: Math.min(tuning.gradientIntensity, 0.75),
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
    const minScale = compact ? 0.36 : 0.88;
    const maxScale = compact ? 1.16 : 2.2;
    const safeMargin = compact ? Math.min(Math.max(viewport.width * 0.06, 16), 24) : 0;
    const widthFitScale = compact && contentWidth > 0
        ? Math.max((Math.max(viewport.width, 1) - safeMargin * 2) / contentWidth, minScale)
        : maxScale;
    const effectiveMaxScale = Math.min(maxScale, widthFitScale);
    return Math.max(minScale, Math.min(
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

export const resolveFumeCanvasDpr = (devicePixelRatio: number, compact: boolean): number => {
    const safeDpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
    return compact ? Math.min(safeDpr, 2) : safeDpr;
};
