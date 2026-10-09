import { afterEach, describe, expect, it } from 'vitest';
import { colorWithAlpha } from './colorMix';
import { setGlowBlurQuantized } from '../utils/glowBlurQuantize';
import { wordGlowVariants } from './wordGlow';

// Node environment on purpose: `glowBlurQuantize` resolves its platform default at import time, and
// jsdom's user agent reports Linux, which would make the default machine-dependent. Here the default
// is deterministically off and every case states the switch position it wants.
//
// The "switch off" block is the regression guard for this port. classic and partita each used to
// carry a private `glowVariants` object; those were deleted in favour of this module, so these
// assertions pin the exact keyframes the deleted code produced. If they ever change, the glow the
// user sees has changed.

type VariantObject = Record<string, unknown>;
type Resolver = (custom?: VariantObject) => VariantObject;

const resolve = (name: 'waiting' | 'active' | 'passed', custom?: VariantObject): VariantObject => (
    (wordGlowVariants[name] as unknown as Resolver)(custom)
);

/** drop-shadow radius per text-shadow radius, and the inner layer's alpha - fitted upstream by pixel diff. */
const RADIUS_SCALE = 0.4;
const INNER_ALPHA = 0.7;

const dropShadowAt = (color: string, inner: number, outer: number) => (
    `drop-shadow(0 0 ${inner * RADIUS_SCALE}px ${colorWithAlpha(color, INNER_ALPHA)}) `
    + `drop-shadow(0 0 ${outer * RADIUS_SCALE}px ${color})`
);

const ACTIVE_COLOR = '#62f5c4';

afterEach(() => {
    setGlowBlurQuantized(false);
});

describe('wordGlowVariants with the switch OFF (the pre-fix text-shadow animation, unchanged)', () => {
    it('waiting is transparent text with no shadow', () => {
        expect(resolve('waiting')).toEqual({
            color: 'transparent',
            textShadow: 'none',
            // Added over the deleted local copy on purpose: a word left over from while the switch was
            // on carries an opacity ramp and a filter, and both have to be put back or it stays invisible.
            opacity: 1,
            filter: 'none',
        });
    });

    it('instant reveal ramps a 14px/24px halo from none and back', () => {
        const variant = resolve('active', { activeColor: ACTIVE_COLOR, duration: 0.08, wordRevealMode: 'instant' });
        expect(variant.color).toBe('transparent');
        expect(variant.textShadow).toEqual([
            'none',
            `0 0 14px ${ACTIVE_COLOR}, 0 0 24px ${ACTIVE_COLOR}`,
            'none',
        ]);
        expect(variant.transition).toEqual({ duration: 0.08, times: [0, 0.35, 1], ease: 'easeOut' });
        // The old animation had no filter and no opacity ramp; introducing either would change the look.
        expect(variant).not.toHaveProperty('filter');
        expect(variant).not.toHaveProperty('opacity');
    });

    it('caps the instant duration at 0.12s and falls back to 0.08s when duration is missing', () => {
        expect(resolve('active', { activeColor: ACTIVE_COLOR, duration: 5, wordRevealMode: 'instant' }).transition)
            .toMatchObject({ duration: 0.12 });
        expect(resolve('active', { activeColor: ACTIVE_COLOR, wordRevealMode: 'instant' }).transition)
            .toMatchObject({ duration: 0.08 });
    });

    it('fast reveal ramps an 18px/32px halo, clamped to 0.12-0.2s', () => {
        const variant = resolve('active', { activeColor: ACTIVE_COLOR, duration: 0.15, wordRevealMode: 'fast' });
        expect(variant.textShadow).toEqual([
            'none',
            `0 0 18px ${ACTIVE_COLOR}, 0 0 32px ${ACTIVE_COLOR}`,
            'none',
        ]);
        expect(variant.transition).toEqual({ duration: 0.15, times: [0, 0.4, 1], ease: 'easeInOut' });
        expect(resolve('active', { activeColor: ACTIVE_COLOR, duration: 9, wordRevealMode: 'fast' }).transition)
            .toMatchObject({ duration: 0.2 });
    });

    it('letter sweep ramps a 20px/40px halo and delays by the grapheme offset inside the word', () => {
        const variant = resolve('active', {
            activeColor: ACTIVE_COLOR,
            duration: 0.8,
            index: 1,
            total: 4,
            charStartTime: 1.25,
            charEndTime: 1.45,
            wordStartTime: 1.0,
        });
        expect(variant.textShadow).toEqual([
            'none',
            `0 0 20px ${ACTIVE_COLOR}, 0 0 40px ${ACTIVE_COLOR}`,
            'none',
        ]);
        // charDuration = max(charEnd - charStart, 0.001), stretched over a few letters; the delay is the
        // grapheme's offset inside the word. Written out longhand (not as 0.2 * 6) so the test states the
        // formula and stays exact in floating point.
        expect(variant.transition).toEqual({
            duration: Math.max(1.45 - 1.25, 0.001) * 6,
            times: [0, 0.3, 1],
            delay: Math.max(0, 1.25 - 1.0),
            ease: 'easeInOut',
        });
    });

    it('letter sweep without grapheme timing falls back to an even split of the word duration', () => {
        const variant = resolve('active', { activeColor: ACTIVE_COLOR, duration: 0.8, index: 2, total: 4 });
        // No grapheme timing, so the word duration is split evenly: singleDuration = 0.8 / 4, stretched
        // x6, delayed by singleDuration * index.
        const singleDuration = 0.8 / 4;
        expect(variant.transition).toEqual({
            duration: singleDuration * 6,
            times: [0, 0.3, 1],
            delay: singleDuration * 2,
            ease: 'easeInOut',
        });
    });

    it('a single grapheme or CJK word holds the halo instead of ramping it back down', () => {
        const variant = resolve('active', { activeColor: ACTIVE_COLOR, duration: 0.5 });
        const halo = `0 0 20px ${ACTIVE_COLOR}, 0 0 40px ${ACTIVE_COLOR}`;
        expect(variant.textShadow).toEqual(['none', halo, halo]);
        expect(variant.transition).toEqual({ duration: 0.5, times: [0, 0.9, 1], ease: 'easeInOut' });
    });

    it('passed clears the shadow, with a per-reveal-mode fade', () => {
        expect(resolve('passed', { activeColor: ACTIVE_COLOR })).toEqual({
            color: 'transparent',
            textShadow: 'none',
            transition: { duration: 0.9, ease: 'easeOut' },
        });
        expect(resolve('passed', { activeColor: ACTIVE_COLOR, wordRevealMode: 'instant' }).transition)
            .toEqual({ duration: 0.12, ease: 'easeOut' });
        expect(resolve('passed', { activeColor: ACTIVE_COLOR, wordRevealMode: 'fast' }).transition)
            .toEqual({ duration: 0.22, ease: 'easeOut' });
    });
});

describe('wordGlowVariants with the switch ON (leak-free drop-shadow filter)', () => {
    const on = () => setGlowBlurQuantized(true);

    it('never emits a text-shadow, in any variant - that is the entire point of the switch', () => {
        on();
        const variants = [
            resolve('waiting'),
            resolve('active', { activeColor: ACTIVE_COLOR, duration: 0.08, wordRevealMode: 'instant' }),
            resolve('active', { activeColor: ACTIVE_COLOR, duration: 0.15, wordRevealMode: 'fast' }),
            resolve('active', { activeColor: ACTIVE_COLOR, duration: 0.8, index: 1, total: 4 }),
            resolve('active', { activeColor: ACTIVE_COLOR, duration: 0.5 }),
            resolve('passed', { activeColor: ACTIVE_COLOR }),
        ];
        for (const variant of variants) {
            expect(variant).not.toHaveProperty('textShadow');
        }
    });

    it('waiting is a zero-duration reset, so a word never animates into invisibility', () => {
        on();
        expect(resolve('waiting')).toEqual({
            color: 'transparent',
            opacity: 0,
            filter: 'none',
            transition: { duration: 0 },
        });
    });

    it('moves the alpha ramp from the shadow colour onto opacity, and the radius ramp onto the filter', () => {
        on();
        const variant = resolve('active', { activeColor: ACTIVE_COLOR, duration: 0.08, wordRevealMode: 'instant' });
        // The glow layer now paints the glyph, because drop-shadow shadows what is painted. It sits
        // exactly under the body text, so the copy itself is never seen.
        expect(variant.color).toBe(ACTIVE_COLOR);
        expect(variant.opacity).toEqual([0, 1, 0]);
        expect(variant.filter).toEqual([
            dropShadowAt(ACTIVE_COLOR, 0, 0),
            dropShadowAt(ACTIVE_COLOR, 14, 24),
            dropShadowAt(ACTIVE_COLOR, 0, 0),
        ]);
        expect(variant.transition).toEqual({ duration: 0.08, times: [0, 0.35, 1], ease: 'easeOut' });
    });

    it('scales the fitted radii by 0.4 and weakens the chained inner layer to 0.7 alpha', () => {
        on();
        const variant = resolve('active', { activeColor: '#ff0000', duration: 0.5 });
        // 8 and 16 written by hand: the sustained single-grapheme halo is 20px/40px as a text-shadow,
        // and 20 * 0.4 = 8, 40 * 0.4 = 16. The inner layer carries the 0.7 alpha because the outer
        // drop-shadow also shadows it.
        expect((variant.filter as string[])[1]).toBe(
            `drop-shadow(0 0 8px ${colorWithAlpha('#ff0000', INNER_ALPHA)}) drop-shadow(0 0 16px #ff0000)`,
        );
    });

    it('restates the colour on passed, because framer resets an omitted key to initial at once', () => {
        on();
        const variant = resolve('passed', { activeColor: ACTIVE_COLOR });
        // Omit `color` and framer snaps it back to `waiting`'s transparent immediately; a transparent
        // glyph casts no drop-shadow, so the halo would vanish at full brightness instead of fading.
        expect(variant.color).toBe(ACTIVE_COLOR);
        expect(variant.opacity).toBe(0);
        expect(variant.filter).toBe(dropShadowAt(ACTIVE_COLOR, 0, 0));
        expect(variant.transition).toEqual({ duration: 0.9, ease: 'easeOut' });
    });

    it('keeps a colour it cannot parse instead of turning it white', () => {
        on();
        // colorWithAlpha only understands hex and rgb(); withAlpha must not hand it anything else.
        const variant = resolve('active', { activeColor: 'hsl(160 100% 50%)', duration: 0.5 });
        expect((variant.filter as string[])[1]).toBe(
            'drop-shadow(0 0 8px hsl(160 100% 50%)) drop-shadow(0 0 16px hsl(160 100% 50%))',
        );
    });

    it('defaults a missing activeColor to empty rather than throwing', () => {
        on();
        expect(() => resolve('active', { duration: 0.5 })).not.toThrow();
        expect(() => resolve('passed', {})).not.toThrow();
        expect(resolve('passed', {}).color).toBe('');
    });
});

describe('the switch is read per word, not at import time', () => {
    it('flipping it changes the next resolved variant without reloading the module', () => {
        const before = resolve('active', { activeColor: ACTIVE_COLOR, duration: 0.5 });
        expect(before).toHaveProperty('textShadow');
        expect(before).not.toHaveProperty('filter');

        setGlowBlurQuantized(true);
        const after = resolve('active', { activeColor: ACTIVE_COLOR, duration: 0.5 });
        expect(after).not.toHaveProperty('textShadow');
        expect(after).toHaveProperty('filter');
    });
});
