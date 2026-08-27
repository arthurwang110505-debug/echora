import { describe, expect, it } from 'vitest';
import {
    resolveShotMotionFrame,
    resolveSonnetSmoothedCameraFocus,
} from './sonnetMotion';

describe('Sonnet motion continuity', () => {
    it('fades distant temporal focus samples instead of dropping them at a hard threshold', () => {
        const focus = resolveSonnetSmoothedCameraFocus(
            5,
            0,
            10,
            sampleTime => {
                if (sampleTime < 5) return { x: 0, y: 0 };
                if (sampleTime > 5) return { x: 300, y: 0 };
                return { x: 100, y: 0 };
            },
            0.18,
            192,
        );

        expect(focus.x).toBeGreaterThan(80);
        expect(focus.x).toBeLessThan(110);
        expect(focus.x).not.toBe(100);
        expect(focus.y).toBe(0);
    });

    it('keeps every Sonnet shot kind on a continuous non-static path', () => {
        const shotKinds = [
            'editorial-column',
            'type-impact',
            'fragment-collage',
            'tracking-ribbon',
            'mask-reveal',
            'poster-blocks',
            'quiet-tableau',
        ] as const;

        for (const kind of shotKinds) {
            const start = resolveShotMotionFrame(kind, 0);
            const middle = resolveShotMotionFrame(kind, 0.5);
            const end = resolveShotMotionFrame(kind, 1);
            expect(middle).not.toEqual(start);
            expect(end).not.toEqual(start);
        }
    });
});
