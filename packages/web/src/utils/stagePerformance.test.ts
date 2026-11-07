import { describe, expect, it } from 'vitest';
import {
    advanceStageTier,
    stagePromotionStreakFor,
    type StagePerformanceTier,
    type StageTierState,
} from './stagePerformance';
import { DEFAULT_DIORAMA_TUNING, DEFAULT_SONNET_TUNING } from '../types';
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

    it('keeps Sonnet composition while capping compact renderer resolution', () => {
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

        expect(compact).toEqual({ ...tuning, textureResolution: 1 });
        expect(compact.mgDensity).toBe(0.8);
        expect(compact.textureResolution).toBe(1);
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
        expect(compact.particleDensity).toBe(192);
        expect(compact.backgroundParticleCircumference).toBe(10);
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

    it('caps Fume canvas DPR more aggressively on compact viewports', () => {
        // Compact Fume redraws the full viewport and uses a separate glow pass.
        expect(resolveFumeCanvasDpr(3, true)).toBe(1);
        expect(resolveFumeCanvasDpr(1.1, true)).toBe(1);
        expect(resolveFumeCanvasDpr(3, 'balanced')).toBe(1.5);
        expect(resolveFumeCanvasDpr(3, false)).toBe(2);
        expect(resolveFumeCanvasDpr(2, false)).toBe(2);
        expect(resolveFumeCanvasDpr(1.5, false)).toBe(1.5);
        expect(resolveFumeCanvasDpr(0, true)).toBe(1);
    });
});

describe('stage tier ladder', () => {
    const stateAt = (tier: StagePerformanceTier, demotions = 0): StageTierState => ({
        tier,
        slowFrames: 0,
        goodFrames: 0,
        demotions,
    });

    const feed = (state: StageTierState, frameMs: number, count: number) => {
        for (let i = 0; i < count; i += 1) advanceStageTier(state, frameMs);
        return state;
    };

    it('demotes a steady 30 fps on the 60 fps tier', () => {
        // The regression this replaces: a fixed >42 ms threshold never saw 33 ms frames, so this
        // device stayed on `full` at half the frame rate indefinitely.
        const state = stateAt('full');
        feed(state, 33, 8);
        expect(state.tier).toBe('balanced');
        expect(state.demotions).toBe(1);
    });

    it('accepts the same frame time once it is within the tier budget', () => {
        // 30 ms is a miss at 60 fps, borderline-but-inside at 45 fps (22.2 ms * 1.5 = 33.3 ms).
        const state = stateAt('balanced');
        feed(state, 30, 20);
        expect(state.tier).toBe('balanced');
        expect(state.demotions).toBe(0);
    });

    it('needs the streak to be consecutive', () => {
        const state = stateAt('full');
        feed(state, 60, 7);
        advanceStageTier(state, 16);
        feed(state, 60, 7);
        expect(state.tier).toBe('full');
        advanceStageTier(state, 60);
        expect(state.tier).toBe('balanced');
    });

    it('never demotes below compact', () => {
        const state = stateAt('compact');
        feed(state, 200, 100);
        expect(state.tier).toBe('compact');
        expect(state.demotions).toBe(0);
    });

    it('recovers from a demotion instead of latching it permanently', () => {
        const state = stateAt('full');
        feed(state, 33, 8);
        expect(state.tier).toBe('balanced');
        // Compact-budget frames are unambiguous proof the tier above is affordable.
        feed(state, 10, stagePromotionStreakFor(state.demotions));
        expect(state.tier).toBe('full');
    });

    it('makes every retry cost more evidence than the one before it', () => {
        expect(stagePromotionStreakFor(0)).toBeLessThan(stagePromotionStreakFor(1));
        expect(stagePromotionStreakFor(1)).toBeLessThan(stagePromotionStreakFor(2));
        // The proof window grows without bound, so a device that keeps failing settles by
        // arithmetic rather than by a hard cap that also traps a device that failed once.
        expect(stagePromotionStreakFor(9)).toBeGreaterThan(stagePromotionStreakFor(8));
    });

    it('does not promote on frames that only fit the current tier', () => {
        // 25 ms fits `balanced` (33.3 ms budget) but not `full` (17.4 ms budget), so it is not
        // evidence for moving back up - the rule reads the destination budget, not the current one.
        const state = stateAt('balanced');
        feed(state, 25, stagePromotionStreakFor(0) * 2);
        expect(state.tier).toBe('balanced');
    });

    it('ignores non-positive and non-finite frame deltas', () => {
        const state = stateAt('full');
        feed(state, 0, 20);
        feed(state, Number.NaN, 20);
        feed(state, -5, 20);
        expect(state).toEqual(stateAt('full'));
    });
});
