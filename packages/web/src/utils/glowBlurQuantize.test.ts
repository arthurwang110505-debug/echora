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
