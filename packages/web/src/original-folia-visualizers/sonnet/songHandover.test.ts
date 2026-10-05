import { describe, expect, it } from 'vitest';
import {
    SONNET_SONG_SWAP_MS,
    resolveSonnetHandoverFrame,
} from './songHandover';

describe('Sonnet song handover', () => {
    it('starts fully on the outgoing picture and ends fully on the incoming one', () => {
        const start = resolveSonnetHandoverFrame(0);
        expect(start).toEqual({ outgoingAlpha: 1, incomingAlpha: 0, done: false });

        const end = resolveSonnetHandoverFrame(SONNET_SONG_SWAP_MS);
        expect(end).toEqual({ outgoingAlpha: 0, incomingAlpha: 1, done: true });
    });

    it('keeps the two pictures summing to one so the dissolve never flashes darker', () => {
        for (let elapsed = 0; elapsed <= SONNET_SONG_SWAP_MS; elapsed += 20) {
            const frame = resolveSonnetHandoverFrame(elapsed);
            expect(frame.outgoingAlpha + frame.incomingAlpha).toBeCloseTo(1, 6);
        }
    });

    it('moves monotonically in one direction, with zero slope at both ends', () => {
        let previous = resolveSonnetHandoverFrame(0);
        for (let elapsed = 0; elapsed <= SONNET_SONG_SWAP_MS; elapsed += 10) {
            const frame = resolveSonnetHandoverFrame(elapsed);
            expect(frame.outgoingAlpha).toBeLessThanOrEqual(previous.outgoingAlpha + 1e-9);
            expect(frame.incomingAlpha).toBeGreaterThanOrEqual(previous.incomingAlpha - 1e-9);
            previous = frame;
        }

        // Smoothstep: a quarter of the way in, less than a quarter of the picture has moved over.
        const early = resolveSonnetHandoverFrame(SONNET_SONG_SWAP_MS / 4);
        expect(early.incomingAlpha).toBeLessThan(0.25);
        const late = resolveSonnetHandoverFrame((SONNET_SONG_SWAP_MS / 4) * 3);
        expect(late.incomingAlpha).toBeGreaterThan(0.75);
    });

    it('treats unusable clocks as finished instead of freezing the outgoing picture', () => {
        expect(resolveSonnetHandoverFrame(Number.NaN).done).toBe(true);
        expect(resolveSonnetHandoverFrame(Number.POSITIVE_INFINITY).done).toBe(true);
        expect(resolveSonnetHandoverFrame(100, Number.NaN).done).toBe(true);
        expect(resolveSonnetHandoverFrame(100, 0).done).toBe(true);
        // Negative elapsed is the start of the dissolve, not a finished one.
        expect(resolveSonnetHandoverFrame(-50)).toEqual({ outgoingAlpha: 1, incomingAlpha: 0, done: false });
    });

    it('honours a custom duration', () => {
        expect(resolveSonnetHandoverFrame(100, 200).incomingAlpha).toBeCloseTo(0.5, 6);
        expect(resolveSonnetHandoverFrame(199, 200).done).toBe(false);
        expect(resolveSonnetHandoverFrame(200, 200).done).toBe(true);
    });
});
