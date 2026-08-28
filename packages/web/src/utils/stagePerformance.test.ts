import { describe, expect, it } from 'vitest';
import { DEFAULT_DIORAMA_TUNING, DEFAULT_SONNET_TUNING } from '../../types';
import {
    resolveCompactDioramaTuning,
    resolveCompactSonnetTuning,
    resolveFumeCameraSafetyCorrection,
    resolveFumeCameraScaleForViewport,
    resolveFumeCameraXForViewport,
    resolveFumeCameraYForViewport,
    resolveFumeCanvasDpr,
    resolveFumeContentFrameBounds,
    shouldUseCompactStageProfile,
} from './stagePerformance';

describe('stage performance profile', () => {
    it('only enables the compact profile for touch-sized viewports', () => {
        expect(shouldUseCompactStageProfile({ width: 390, height: 844, coarsePointer: true })).toBe(true);
        expect(shouldUseCompactStageProfile({ width: 844, height: 390, touchPoints: 5 })).toBe(true);
        expect(shouldUseCompactStageProfile({ width: 1024, height: 768, coarsePointer: true, touchPoints: 5 })).toBe(false);
        expect(shouldUseCompactStageProfile({ width: 390, height: 844 })).toBe(true);
    });

    it('keeps the complete Sonnet composition on compact viewports', () => {
        expect(resolveCompactSonnetTuning(DEFAULT_SONNET_TUNING, false)).toBe(DEFAULT_SONNET_TUNING);

        const tuning = {
            ...DEFAULT_SONNET_TUNING,
            mgDensity: 0.8,
            textureResolution: 2,
            cameraIntensity: 1.4,
            showGuide: true,
            showBackgroundMg: true,
            showFixedGeo: true,
            showGiantDecorativeText: true,
            showBackgroundDecor: true,
            enableTransitions: true,
            postProcessEnabled: true,
            postProcessLensDistortion: 0.7,
        };
        const compact = resolveCompactSonnetTuning(tuning, true);

        expect(compact).toEqual(tuning);
        expect(compact.mgDensity).toBe(0.8);
        expect(compact.textureResolution).toBe(2);
        expect(compact.showGuide).toBe(true);
        expect(compact.showBackgroundMg).toBe(true);
        expect(compact.showFixedGeo).toBe(true);
        expect(compact.showGiantDecorativeText).toBe(true);
        expect(compact.showBackgroundDecor).toBe(true);
        expect(compact.enableTransitions).toBe(true);
        expect(compact.postProcessEnabled).toBe(true);
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
        expect(resolveFumeCameraScaleForViewport(40, viewport, true, 2600)).toBeCloseTo(343.2 / 2600, 3);
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

    it('resolves compact Fume safety from rendered line bounds instead of layout whitespace', () => {
        const block = { x: 120, y: 480, width: 900, height: 120 };
        const contentFrame = resolveFumeContentFrameBounds(block, [
            { left: 24, top: 12, width: 210 },
            { left: 8, top: 58, width: 302 },
        ], 38);

        expect(contentFrame).toEqual({ left: 128, top: 492, right: 430, bottom: 576 });
        expect(resolveFumeCameraXForViewport(240, contentFrame.left, contentFrame.right, 390, 0.84, true)).toBeCloseTo(240, 5);
        expect(resolveFumeCameraXForViewport(240, block.x, block.x + block.width, 390, 0.84, true)).toBeCloseTo(570, 5);
    });

    it('falls back to the block bounds when a Fume block has no rendered lines', () => {
        expect(resolveFumeContentFrameBounds(
            { x: 120, y: 480, width: 900, height: 120 },
            [],
            38,
        )).toEqual({ left: 120, top: 480, right: 1020, bottom: 600 });
        expect(resolveFumeContentFrameBounds(
            { x: 120, y: 480, width: 900, height: 120 },
            [{ left: Number.NaN, top: 0, width: 240 }],
            38,
        )).toEqual({ left: 120, top: 480, right: 1020, bottom: 600 });
    });

    it('softly corrects compact Fume camera overshoot without teleporting', () => {
        const correction = resolveFumeCameraSafetyCorrection(340, 520, 300, 1 / 60);
        expect(correction.position).toBeGreaterThan(300);
        expect(correction.position).toBeLessThan(340);
        expect(correction.velocity).toBeLessThan(520);

        const inBounds = resolveFumeCameraSafetyCorrection(240, 120, 300, 1 / 60);
        expect(inBounds.position).toBeGreaterThan(240);
        expect(inBounds.position).toBeLessThan(300);
        expect(inBounds.velocity).toBe(120);

        const invalid = resolveFumeCameraSafetyCorrection(Number.NaN, 120, 300, 1 / 60);
        expect(invalid).toEqual({ position: 300, velocity: 0 });
    });

    it('caps Fume canvas DPR at 2 on every device class', () => {
        // Beyond two device pixels per CSS pixel the glow-heavy canvas gains nothing
        // visible but rasterizes 2.25x+ more pixels per frame; dpr <= 2 is untouched.
        expect(resolveFumeCanvasDpr(3, true)).toBe(2);
        expect(resolveFumeCanvasDpr(3, false)).toBe(2);
        expect(resolveFumeCanvasDpr(2, false)).toBe(2);
        expect(resolveFumeCanvasDpr(1.5, false)).toBe(1.5);
        expect(resolveFumeCanvasDpr(0, true)).toBe(1);
    });
});
