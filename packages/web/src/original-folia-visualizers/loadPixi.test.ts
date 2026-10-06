// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { loadPixi } from './loadPixi';
import { installPixiFilterPoolCompat } from './pixiFilterPoolCompat';

/**
 * The two things `loadPixi` promises: the fragment precision default is raised to highp *before*
 * anything compiles a shader, and the filter-pool shim only touches the Pixi version it was written
 * for. Both are cheap to assert and expensive to notice by eye (the first paints a black wedge on
 * Linux/NVIDIA, the second corrupts a filter pass).
 *
 * jsdom has no WebGL, so this covers the module-level contract, not a render. Importing `pixi.js`
 * here is deliberate: the point is that the *same* module instance the renderer will use is the one
 * whose default was changed.
 */
describe('loadPixi', () => {
    it('raises the fragment precision default to highp before any renderer exists', async () => {
        const pixi = await loadPixi();
        expect(pixi.GlProgram.defaultOptions.preferredFragmentPrecision).toBe('highp');
    });

    it('returns the shared pixi module instance, not a re-exported copy', async () => {
        const pixi = await loadPixi();
        const direct = await import('pixi.js');
        expect(pixi).toBe(direct);
        // Second call is idempotent: the same module object, still highp.
        await loadPixi();
        expect(pixi.GlProgram.defaultOptions.preferredFragmentPrecision).toBe('highp');
    });

    it('leaves the filter system alone on a pixi version the shim was not written for', async () => {
        const pixi = await loadPixi();
        const prototype = pixi.FilterSystem.prototype as unknown as { destroy: unknown };
        const before = prototype.destroy;
        installPixiFilterPoolCompat(pixi);
        // `VERSION` is typed as a build-time placeholder, so compare it as a plain string.
        if ((pixi.VERSION as string) === '8.21.0') {
            expect(prototype.destroy).not.toBe(before);
        } else {
            // Echora resolves pixi ^8.14 (8.19 at the time of writing): nothing may be patched.
            expect(prototype.destroy).toBe(before);
        }
    });
});
