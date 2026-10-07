import { describe, expect, it } from 'vitest';
import { resolveHoldSettle } from './cameraPath';

// Folia c0401f9e: a shot held past its line used to stay frozen at its most extreme pose (progress
// 1, word truck at the end of the line, rule-of-thirds look offset applied), which parks the lyric
// against the edge of frame and reads as "the camera is stuck". The settle releases all three once
// the hold outlives the lyric file's own gap threshold.
describe('diorama hold settle', () => {
    it('leaves ordinary line-to-line playback untouched', () => {
        expect(resolveHoldSettle(0)).toBe(1);
        expect(resolveHoldSettle(1.5)).toBe(1);
        expect(resolveHoldSettle(3)).toBe(1);
    });

    it('eases the held composition away once the hold outlasts an interlude gap', () => {
        expect(resolveHoldSettle(5.5)).toBeCloseTo(0.5, 5);
        expect(resolveHoldSettle(8)).toBe(0);
        expect(resolveHoldSettle(30)).toBe(0);
    });

    it('is monotone and never overshoots', () => {
        let previous = 1;
        for (let secondsHeld = 3; secondsHeld <= 9; secondsHeld += 0.25) {
            const value = resolveHoldSettle(secondsHeld);
            expect(value).toBeLessThanOrEqual(previous);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
            previous = value;
        }
    });

    it('ignores negative and non-finite hold times', () => {
        expect(resolveHoldSettle(-5)).toBe(1);
        expect(resolveHoldSettle(Number.NaN)).toBe(1);
    });
});
