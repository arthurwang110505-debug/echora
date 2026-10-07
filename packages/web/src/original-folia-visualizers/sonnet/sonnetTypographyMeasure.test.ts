import { describe, expect, it, vi } from 'vitest';

// pretext needs a canvas; the point of this suite is the memo layer that sits on top of it, so the
// measurement backend is stubbed and only the call counts are asserted.
const pretext = vi.hoisted(() => ({
    prepareWithSegments: vi.fn((text: string, _fontSpec: string) => ({ text })),
    layoutWithLines: vi.fn((prepared: { text: string }, _maxWidth: number, lineHeight: number) => ({
        lines: [{ text: prepared.text, width: prepared.text.length * 8 }],
        height: lineHeight,
    })),
}));

vi.mock('@chenglou/pretext', () => pretext);

const { measureText } = await import('./sonnetTypographyLayout');

// Sonnet re-measures the same graphemes per character, per shot, per paragraph. Without the memo
// every scene build re-ran pretext for text it had already measured (Folia a69dd947: "fix：未缓存
// 测量结果" - the bulk of what a scene build costs). These assertions pin the memo in place.
describe('sonnet text measurement memo', () => {
    it('measures an identical (text, font, size) triple through pretext exactly once', () => {
        const before = pretext.prepareWithSegments.mock.calls.length;

        const first = measureText('駆け抜けて', '700 64px Inter', 64);
        const second = measureText('駆け抜けて', '700 64px Inter', 64);

        expect(second).toBe(first);
        expect(pretext.prepareWithSegments.mock.calls.length - before).toBe(1);
        expect(pretext.layoutWithLines.mock.calls.length - before).toBe(1);
    });

    it('treats a different font spec or size as a different measurement', () => {
        const before = pretext.prepareWithSegments.mock.calls.length;

        measureText('光を探して', '700 64px Inter', 64);
        measureText('光を探して', '900 64px Inter', 64);
        measureText('光を探して', '700 64px Inter', 72);

        expect(pretext.prepareWithSegments.mock.calls.length - before).toBe(3);
    });

    it('still reports the width pretext measured', () => {
        expect(measureText('echo', '700 32px Inter', 32)).toBe(4 * 8);
    });
});
