// @vitest-environment jsdom
//
// Guards the seam between the two place's a mode can be listed: the stage picker
// (`VISUALIZER_OPTIONS`, which the player chrome, the side panel, the quick-tuning panel and the
// landing page all render) and the registry (whose glob decides whether a mode actually exists).
// They disagree silently - `OriginalFoliaVisualizerStage` falls back to `classic` and
// `getVisualizerRegistryEntry` falls back to `classic` - so a mode added to one list and not the
// other looks like "the picker does nothing" rather than an error.
//
// This file sits in the visualizer tree (outside the main tsconfig) because it imports the
// registry; `scripts/check-visualizer-types.mjs` type-checks it.
import { motionValue } from 'framer-motion';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Theme } from '../types';
import { VISUALIZER_OPTIONS } from '../components/player/panel/stageOptions';
import type { VisualizerSharedProps } from './definition';
import VisualizerLumiere from './lumiere/VisualizerLumiere';
import { VISUALIZER_REGISTRY, getVisualizerRegistryEntry, hasVisualizerMode } from './registry';
import { getVisualizerTuningModes } from './tuningRegistry';
import VisualizerTempera from './tempera/VisualizerTempera';

const THEME: Theme = {
    name: 'spec',
    backgroundColor: '#07090e',
    primaryColor: '#e8c88a',
    accentColor: '#62f5c4',
    secondaryColor: '#2f6f8f',
    fontStyle: 'sans',
    animationIntensity: 'calm',
};

const props: VisualizerSharedProps = {
    currentTime: motionValue(3),
    currentLineIndex: 0,
    lines: [
        { fullText: 'Walking through the quiet street', startTime: 1, endTime: 5, words: [] },
        { fullText: 'the lights come on one by one', startTime: 5, endTime: 10, words: [] },
    ],
    theme: THEME,
    audioPower: motionValue(0.4),
    audioBands: {
        bass: motionValue(0.5),
        lowMid: motionValue(0.4),
        mid: motionValue(0.3),
        vocal: motionValue(0.2),
        treble: motionValue(0.1),
    },
};

describe('visualizer modes', () => {
    it('lists exactly the modes the registry can render', () => {
        const picker = VISUALIZER_OPTIONS.map(option => option.value);
        const registered = VISUALIZER_REGISTRY.map(entry => entry.mode);

        expect(new Set(picker).size, 'the picker lists a mode twice').toBe(picker.length);
        expect([...picker].sort()).toEqual([...registered].sort());
        for (const mode of picker) expect(hasVisualizerMode(mode), `${mode} is not registered`).toBe(true);
    });

    it('gives every mode its own entry, a label, a seed and a tuning', () => {
        for (const entry of VISUALIZER_REGISTRY) {
            expect(getVisualizerRegistryEntry(entry.mode)).toBe(entry);
            expect(entry.labelKey.length, entry.mode).toBeGreaterThan(0);
            expect(entry.labelFallback.length, entry.mode).toBeGreaterThan(0);
            expect(entry.previewSeed.length, entry.mode).toBeGreaterThan(0);
            // A mode without a tuning adapter silently ignores everything the panel writes for it.
            expect(getVisualizerTuningModes(), `${entry.mode} has no tuning adapter`).toContain(entry.mode);
        }
    });

    it('gives every mode a callable `render`, which is what the live stage actually calls', () => {
        // `OriginalFoliaVisualizerStage` renders `OriginalVisualizerRendererProxy`, which re-exports
        // `VisualizerRenderer.tsx`, which resolves a mode with a *direct call*:
        //
        //     getVisualizerRegistryEntry(mode).render(resolvedProps)
        //
        // not with JSX, so every entry must carry a function at that key - the lazy wrappers from
        // `lazyVisualizer` are plain `(props) => <Suspense>…` functions precisely so this works.
        //
        // `VisualizerRegistryEntry` declares `render` as required, but this whole tree sits outside
        // `tsconfig.json`'s include, so a missing field was reported by nothing: not the main tsc,
        // not the visualizer gate, not this file, which checked the label, the seed and the tuning
        // and stopped one field short. Sonnet shipped without `render`, so selecting 商籁 threw
        // `getVisualizerRegistryEntry(...).render is not a function`, and `SceneErrorBoundary`
        // swallowed it into a stage that quietly fell back. Same shape as the picker/registry drift
        // described in this file's header: a silent disagreement that looks like "nothing happens".
        for (const entry of VISUALIZER_REGISTRY) {
            expect(typeof entry.render, `${entry.mode} has no render`).toBe('function');

            const element = entry.render({ ...props, seed: 'spec', showText: true });
            expect(element, `${entry.mode}.render returned nothing`).toBeTruthy();
            expect(
                typeof element === 'object' && element !== null && 'type' in element,
                `${entry.mode}.render did not return a React element`,
            ).toBe(true);
        }
    });

    it('sorts the registry by `order`, which the picker deliberately does not follow', () => {
        // `order` is upstream's own cross-mode ordering (it drives the playground's list, and the
        // two ported modes keep their upstream slots: tempera 20, lumiere 25). The user-facing
        // picker has always been hand-ordered instead, so the two disagree past the sixth entry -
        // recorded here rather than "fixed", because changing it would reshuffle the picker, the
        // arrows and the landing page in one go. What must hold is that `order` sorts the registry.
        const orders = VISUALIZER_REGISTRY.map(entry => entry.order);
        expect([...orders].sort((left, right) => left - right)).toEqual(orders);
        expect(VISUALIZER_REGISTRY.map(entry => entry.mode).slice(0, 6)).toEqual(
            VISUALIZER_OPTIONS.map(option => option.value).slice(0, 6),
        );
    });

    it('renders each ported mode through the shared shell, with no WebGL context', () => {
        // The lazy wrappers the registry renders (see `lazyVisualizer`) resolve to nothing under
        // `renderToStaticMarkup`, so the modes are rendered directly: this is the shell + the
        // subtitle overlay + the lyric state a user sees on the first frame. The Pixi host runs its
        // `create` in an effect, so no renderer and no canvas are involved here.
        for (const [mode, Component] of [['tempera', VisualizerTempera], ['lumiere', VisualizerLumiere]] as const) {
            const markup = renderToStaticMarkup(<Component {...props} showText seed="spec" />);
            // The shared shell, the shared subtitle overlay and the lyric window all ran on the
            // fixture lines: the active line sits in the overlay, whose entrance animation is at
            // `opacity: 0` on the very first frame, and the line after it is already queued.
            expect(markup, mode).toContain('echora-visualizer-subtitle-overlay');
            expect(markup, mode).toContain('the lights come on one by one');
        }
    });
});
