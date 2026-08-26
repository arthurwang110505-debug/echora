import { describe, expect, it } from 'vitest';
import { DEFAULT_DIORAMA_TUNING, DEFAULT_SONNET_TUNING } from '../../types';
import {
    resolveCompactDioramaTuning,
    resolveCompactSonnetTuning,
    resolveFumeCameraScaleForViewport,
    resolveFumeCameraXForViewport,
    resolveFumeCameraYForViewport,
    resolveFumeCanvasDpr,
    shouldUseCompactStageProfile,
} from './stagePerformance';

describe('stage performance profile', () => {
    it('only enables the compact profile for touch-sized viewports', () => {
        expect(shouldUseCompactStageProfile({ width: 390, height: 844, coarsePointer: true })).toBe(true);
        expect(shouldUseCompactStageProfile({ width: 844, height: 390, touchPoints: 5 })).toBe(true);
        expect(shouldUseCompactStageProfile({ width: 1024, height: 768, coarsePointer: true, touchPoints: 5 })).toBe(false);
        expect(shouldUseCompactStageProfile({ width: 390, height: 844 })).toBe(true);
    });

    it('leaves Sonnet desktop tuning untouched and trims only optional mobile passes', () => {
        expect(resolveCompactSonnetTuning(DEFAULT_SONNET_TUNING, false)).toBe(DEFAULT_SONNET_TUNING);

        const compact = resolveCompactSonnetTuning({
            ...DEFAULT_SONNET_TUNING,
            mgDensity: 0.8,
            textureResolution: 2,
            cameraIntensity: 1.4,
        }, true);

        expect(compact.mgDensity).toBe(0.5);
        expect(compact.textureResolution).toBe(1);
        expect(compact.cameraIntensity).toBe(1.4);
        expect(compact.showGuide).toBe(false);
        expect(compact.showBackgroundMg).toBe(false);
        expect(compact.showFixedGeo).toBe(false);
        expect(compact.showGiantDecorativeText).toBe(false);
        expect(compact.enableTransitions).toBe(false);
    });

    it('keeps Diorama scene identity while reducing mobile point budgets', () => {
        const compact = resolveCompactDioramaTuning({
            ...DEFAULT_DIORAMA_TUNING,
            particleDensity: 1200,
            backgroundParticleCircumference: 40,
            backgroundParticleRadial: 4,
        }, true);

        expect(compact.geometryVisibility).toBe(DEFAULT_DIORAMA_TUNING.geometryVisibility);
        expect(compact.showParticles).toBe(true);
        expect(compact.particleDensity).toBe(288);
        expect(compact.backgroundParticleCircumference).toBe(12);
        expect(compact.backgroundParticleRadial).toBe(1);
        expect(compact.particleGlowEnabled).toBe(false);
    });

    it('bounds Fume focus framing on compact viewports without changing desktop limits', () => {
        const viewport = { width: 390, height: 844 };
        expect(resolveFumeCameraScaleForViewport(1, viewport, true)).toBe(1.16);
        expect(resolveFumeCameraScaleForViewport(1, viewport, false)).toBe(2.2);
        expect(resolveFumeCameraScaleForViewport(50, viewport, true)).toBeCloseTo(0.72, 3);
        expect(resolveFumeCameraScaleForViewport(50, viewport, false)).toBeCloseTo(1.28, 3);
        expect(resolveFumeCameraScaleForViewport(40, viewport, true, 700)).toBeCloseTo(343.2 / 700, 3);
        expect(resolveFumeCameraScaleForViewport(40, viewport, false, 700)).toBeCloseTo(1.6, 2);
    });

    it('keeps compact Fume focus inside the horizontal safe margin', () => {
        expect(resolveFumeCameraXForViewport(100, 100, 400, 390, 1, true)).toBeCloseTo(228.4, 1);
        expect(resolveFumeCameraXForViewport(300, 100, 400, 390, 1, true)).toBeCloseTo(271.6, 1);
        expect(resolveFumeCameraXForViewport(100, 100, 600, 390, 1, true)).toBe(350);
        expect(resolveFumeCameraXForViewport(100, 100, 400, 390, 1, false)).toBe(100);
    });

    it('keeps compact Fume focus inside the vertical safe margin', () => {
        expect(resolveFumeCameraYForViewport(100, 100, 500, 390, 1, true)).toBe(300);
        expect(resolveFumeCameraYForViewport(400, 100, 500, 390, 1, true)).toBe(300);
        expect(resolveFumeCameraYForViewport(100, 100, 700, 390, 1, true)).toBe(400);
        expect(resolveFumeCameraYForViewport(100, 100, 500, 390, 1, false)).toBe(100);
    });

    it('caps only compact Fume canvas DPR', () => {
        expect(resolveFumeCanvasDpr(3, true)).toBe(2);
        expect(resolveFumeCanvasDpr(3, false)).toBe(3);
        expect(resolveFumeCanvasDpr(0, true)).toBe(1);
    });
});
