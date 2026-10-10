// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The module resolves the platform default once, at import time, into a module-level flag. Every
// case that cares about the default therefore has to reset the module registry and re-import after
// arranging `navigator.userAgent` and `localStorage`.
type GlowModule = typeof import('./glowBlurQuantize');

const loadModule = async (): Promise<GlowModule> => {
    vi.resetModules();
    return import('./glowBlurQuantize');
};

const setUserAgent = (userAgent: string) => {
    Object.defineProperty(window.navigator, 'userAgent', {
        value: userAgent,
        configurable: true,
        writable: true,
    });
};

/**
 * A CanvasRenderingContext2D stub that records what the glow helpers do to it. `ctx` is the object to
 * both pass in and read back: jsdom has no real 2D context, and the helpers only touch these members.
 * `filter` starts as a value no canvas would report so "the off path never writes filter" is testable.
 */
const createFakeContext = () => {
    const calls: string[] = [];
    const state = {
        shadowBlur: -1,
        shadowColor: '',
        filter: 'unset',
        save: vi.fn(() => calls.push('save')),
        beginPath: vi.fn(() => calls.push('beginPath')),
        rect: vi.fn((...args: number[]) => calls.push(`rect(${args.join(',')})`)),
        clip: vi.fn(() => calls.push('clip')),
        fillText: vi.fn((...args: unknown[]) => calls.push(`fillText(${args.join(',')})`)),
        restore: vi.fn(() => calls.push('restore')),
        measureText: vi.fn(() => ({
            actualBoundingBoxLeft: 2,
            actualBoundingBoxRight: 30,
            actualBoundingBoxAscent: 10,
            actualBoundingBoxDescent: 3,
            width: 32,
        })),
    };
    return { ctx: state as unknown as CanvasRenderingContext2D & typeof state, calls };
};

describe('glowBlurQuantize platform default', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('is on by default on desktop Linux, the only platform where the leak ends in a frozen compositor', async () => {
        setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/152.0.0.0 Safari/537.36');
        const mod = await loadModule();
        expect(mod.isGlowBlurQuantized()).toBe(true);
    });

    it('is off by default on Windows and macOS, where the leak costs a few MB a day', async () => {
        setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152.0.0.0 Safari/537.36');
        expect((await loadModule()).isGlowBlurQuantized()).toBe(false);

        setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/152.0.0.0 Safari/537.36');
        expect((await loadModule()).isGlowBlurQuantized()).toBe(false);
    });

    it('is off by default on Android: a Linux UA there is a phone, not the desktop leak', async () => {
        setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/152.0.0.0 Mobile Safari/537.36');
        expect((await loadModule()).isGlowBlurQuantized()).toBe(false);
    });

    it('lets the stored choice override the platform default in both directions', async () => {
        setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/152.0.0.0 Safari/537.36');
        localStorage.setItem('visualizer_glow_blur_quantize', 'false');
        expect((await loadModule()).isGlowBlurQuantized()).toBe(false);

        setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152.0.0.0 Safari/537.36');
        localStorage.setItem('visualizer_glow_blur_quantize', 'true');
        expect((await loadModule()).isGlowBlurQuantized()).toBe(true);
    });

    it('ignores a stored value that is not exactly "true" or "false" and falls back to the platform', async () => {
        setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/152.0.0.0 Safari/537.36');
        localStorage.setItem('visualizer_glow_blur_quantize', '1');
        expect((await loadModule()).isGlowBlurQuantized()).toBe(true);

        localStorage.setItem('visualizer_glow_blur_quantize', 'nonsense');
        expect((await loadModule()).isGlowBlurQuantized()).toBe(true);
    });

    it('falls back to the platform default when storage throws', async () => {
        setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/152.0.0.0 Safari/537.36');
        const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('storage blocked');
        });
        try {
            expect((await loadModule()).isGlowBlurQuantized()).toBe(true);
        } finally {
            getItem.mockRestore();
        }
    });

    it('reads the Electron platform ahead of the user agent when the app is packaged', async () => {
        setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152.0.0.0 Safari/537.36');
        (window as unknown as { electron: { platform: string } }).electron = { platform: 'linux' };
        try {
            expect((await loadModule()).isGlowBlurQuantized()).toBe(true);
        } finally {
            delete (window as unknown as { electron?: unknown }).electron;
        }
    });
});

describe('setGlowBlurQuantized', () => {
    let mod: GlowModule;

    beforeEach(async () => {
        localStorage.clear();
        setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152.0.0.0 Safari/537.36');
        mod = await loadModule();
    });

    it('flips the module flag the renderers read every frame, without touching storage', () => {
        expect(mod.isGlowBlurQuantized()).toBe(false);
        mod.setGlowBlurQuantized(true);
        expect(mod.isGlowBlurQuantized()).toBe(true);
        // The store persists; the module only holds the runtime flag.
        expect(localStorage.getItem('visualizer_glow_blur_quantize')).toBeNull();
        mod.setGlowBlurQuantized(false);
        expect(mod.isGlowBlurQuantized()).toBe(false);
    });
});

describe('quantizeShadowBlur', () => {
    let mod: GlowModule;

    beforeEach(async () => {
        localStorage.clear();
        setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152.0.0.0 Safari/537.36');
        mod = await loadModule();
    });

    it('is the identity while the switch is off, so the old animation is untouched', () => {
        mod.setGlowBlurQuantized(false);
        expect(mod.quantizeShadowBlur(12.3456)).toBe(12.3456);
        expect(mod.quantizeShadowBlur(0.4)).toBe(0.4);
    });

    it('rounds to whole pixels while the switch is on, bounding the set of glyph-cache keys', () => {
        mod.setGlowBlurQuantized(true);
        expect(mod.quantizeShadowBlur(12.3456)).toBe(12);
        expect(mod.quantizeShadowBlur(12.6)).toBe(13);
        expect(mod.quantizeShadowBlur(0.4)).toBe(0);
    });

    it('never returns a negative radius, and maps non-finite input to 0 in both modes', () => {
        for (const enabled of [false, true]) {
            mod.setGlowBlurQuantized(enabled);
            expect(mod.quantizeShadowBlur(-5)).toBe(enabled ? 0 : -5);
            expect(mod.quantizeShadowBlur(Number.NaN)).toBe(0);
            expect(mod.quantizeShadowBlur(Number.POSITIVE_INFINITY)).toBe(0);
        }
        mod.setGlowBlurQuantized(false);
    });
});

describe('setCanvasTextGlow / clearCanvasTextGlow', () => {
    let mod: GlowModule;

    beforeEach(async () => {
        localStorage.clear();
        setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152.0.0.0 Safari/537.36');
        mod = await loadModule();
    });

    it('uses a plain canvas shadow while the switch is off', () => {
        const { ctx } = createFakeContext();
        mod.setGlowBlurQuantized(false);
        mod.setCanvasTextGlow(ctx, 12, '#ff0000');
        expect(ctx.shadowBlur).toBe(12);
        expect(ctx.shadowColor).toBe('#ff0000');
        // The off path must not start writing `filter`: that would change today's output.
        expect(ctx.filter).toBe('unset');
    });

    it('uses a drop-shadow filter while the switch is on, at half the radius (canvas shadowBlur is two sigmas)', () => {
        const { ctx } = createFakeContext();
        mod.setGlowBlurQuantized(true);
        mod.setCanvasTextGlow(ctx, 12, '#ff0000');
        expect(ctx.shadowBlur).toBe(0);
        expect(ctx.shadowColor).toBe('transparent');
        expect(ctx.filter).toBe('drop-shadow(0 0 6px #ff0000)');
    });

    it('clears the filter rather than leaving a stale halo at radius 0', () => {
        const { ctx } = createFakeContext();
        mod.setGlowBlurQuantized(true);
        mod.setCanvasTextGlow(ctx, 0, '#ff0000');
        expect(ctx.filter).toBe('none');
    });

    it('clearCanvasTextGlow resets the shadow always and the filter only while the switch is on', () => {
        const on = createFakeContext();
        mod.setGlowBlurQuantized(true);
        mod.clearCanvasTextGlow(on.ctx);
        expect(on.ctx.shadowBlur).toBe(0);
        expect(on.ctx.shadowColor).toBe('transparent');
        expect(on.ctx.filter).toBe('none');

        const off = createFakeContext();
        mod.setGlowBlurQuantized(false);
        mod.clearCanvasTextGlow(off.ctx);
        expect(off.ctx.shadowBlur).toBe(0);
        expect(off.ctx.filter).toBe('unset');
    });
});

describe('fillGlowText', () => {
    let mod: GlowModule;

    beforeEach(async () => {
        localStorage.clear();
        setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152.0.0.0 Safari/537.36');
        mod = await loadModule();
    });

    it('is a plain fillText when no drop-shadow filter is installed', () => {
        const { ctx, calls } = createFakeContext();
        ctx.filter = 'none';
        mod.fillGlowText(ctx, 'hello', 100, 200);
        expect(calls).toEqual(['fillText(hello,100,200)']);
    });

    it('clips to the text plus four sigmas while the glow is a filter', () => {
        // Chromium renders a canvas filter into a layer the size of the clip; without narrowing it the
        // whole canvas is filtered every frame, which cost fume 120 -> ~90 fps.
        const { ctx, calls } = createFakeContext();
        mod.setGlowBlurQuantized(true);
        mod.setCanvasTextGlow(ctx, 8, '#ff0000');   // filter sigma = 4
        mod.fillGlowText(ctx, 'hello', 100, 200);

        const pad = 4 * 4 + 4;                              // sigma * 4 + 4 = 20
        expect(calls[0]).toBe('save');
        expect(calls[1]).toBe('beginPath');
        expect(calls[2]).toBe(`rect(${100 - 2 - pad},${200 - 10 - pad},${2 + 30 + pad * 2},${10 + 3 + pad * 2})`);
        expect(calls[3]).toBe('clip');
        expect(calls[4]).toBe('fillText(hello,100,200)');
        expect(calls[5]).toBe('restore');
    });
});

/**
 * The property the whole WP0 switch exists to guarantee, asserted as a property over a sweep rather
 * than as rounding on individual values.
 *
 * Chromium keys a cached glyph strike on the blur sigma in device space, and each new strike takes a
 * discardable handle out of 4 KiB shared-memory chunks that are never returned. On Linux that is an
 * fd in the renderer and GPU process, and the renderer's soft limit of 1024 runs out after ~35
 * minutes - upstream measured 0.56-0.93 fd/s across classic, partita, claddagh and cadenza before
 * the fix, and -0.003 to +0.002 after. Echora is a PWA and cannot read `/proc/<pid>/fd` at all, so
 * this is the headless equivalent: count the distinct glyph-cache keys an animated sweep asks for.
 * It runs identically on any platform, which is the point - a CI runner will never freeze, so a
 * regression guard for the leak has to be a counting argument rather than an endurance test.
 */
describe('quantizeShadowBlur bounds the glyph-cache key set under an animated sweep', () => {
    let mod: GlowModule;

    beforeEach(async () => {
        localStorage.clear();
        setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/152.0.0.0 Safari/537.36');
        mod = await loadModule();
    });

    /**
     * Cadenza's shape - `quantizeShadowBlur(20 * blurScale)` and `quantizeShadowBlur(40 *
     * blurScale)` per frame - with `blurScale` driven by two incommensurate sines, a fast breath
     * plus a slow drift. That combination never repeats a value exactly, which is what a real
     * animated glow does; a single symmetric sine revisits its own values on the way down and
     * understates the leak by ~40%.
     */
    const sweep = (frames: number) => {
        const radii: number[] = [];
        for (let frame = 0; frame < frames; frame += 1) {
            const blurScale = 1 + 0.4 * Math.sin(frame * 0.05) + 0.05 * Math.sin(frame * 0.013);
            radii.push(mod.quantizeShadowBlur(20 * blurScale));
            radii.push(mod.quantizeShadowBlur(40 * blurScale));
        }
        return radii;
    };

    const distinctOf = (radii: number[]) => new Set(radii).size;

    it('is on by default on Linux, so the bounded behaviour is what a Linux user actually gets', () => {
        expect(mod.isGlowBlurQuantized()).toBe(true);
    });

    it('collapses 1200 animated radii into 48 whole pixels', () => {
        mod.setGlowBlurQuantized(true);
        const radii = sweep(600);

        expect(radii).toHaveLength(1200);
        // 20x sweeps 11..29 and 40x sweeps 22..58, so the union is bounded by the integer range.
        expect(distinctOf(radii)).toBe(48);
        // New glyph-cache keys per draw. Bounded means the strike set stops growing early in a
        // session instead of growing with it.
        expect(distinctOf(radii) / radii.length).toBeLessThan(0.05);
        for (const radius of radii) {
            expect(Number.isInteger(radius), `fractional radius ${radius} reached the glyph cache`).toBe(true);
            expect(radius).toBeGreaterThanOrEqual(0);
        }
    });

    it('does not grow with session length, which is the whole difference from the leak', () => {
        mod.setGlowBlurQuantized(true);
        // Ten times the duration must give the same key set, because rounding collapses the sweep
        // onto a fixed integer range. 6000 frames is 100 seconds; 35 minutes of playback is ~126,000
        // frames, and the set is no larger there than it is here.
        expect(distinctOf(sweep(6000))).toBe(distinctOf(sweep(600)));
    });

    it('shows the leak it prevents: off, the key set grows linearly against a fixed fd budget', () => {
        mod.setGlowBlurQuantized(false);
        const short = sweep(600);
        const long = sweep(6000);

        // The negative control, and the reason the two assertions above are meaningful rather than
        // an artifact of the sweep happening to repeat values: same code path, switch off, and every
        // single draw asks for a new key.
        expect(distinctOf(short)).toBe(short.length);
        expect(distinctOf(short) / short.length).toBe(1);
        expect(short.some(radius => !Number.isInteger(radius))).toBe(true);

        // Ten times the frames is ten times the keys - unbounded growth against a soft limit of
        // 1024, which is what exhausts the renderer in ~35 minutes.
        expect(distinctOf(long)).toBe(long.length);
        expect(distinctOf(long)).toBe(distinctOf(short) * 10);
    });
});
