import { describe, expect, it } from 'vitest';
import { DEFAULT_TEMPERA_TUNING } from '../types';
import type { VisualizerSharedProps } from './definition';
import { applyVisualizerTuning, getVisualizerTuningModes } from './tuningRegistry';

/**
 * `applyVisualizerTuning` is the single boundary between "whatever the bundle happens to hold" and
 * what a renderer reads off its `props.<mode>Tuning`. Both halves of that contract are pinned here:
 * the key the bundle is looked up by, and the fact that a partial entry is completed from the
 * adapter's defaults before it reaches a renderer.
 */

type Bundle = Parameters<typeof applyVisualizerTuning>[2];
const asBundle = (value: Record<string, unknown>) => value as unknown as Bundle;
const asProps = (value: Record<string, unknown>) => value as unknown as VisualizerSharedProps;
const tuningOf = (props: ReturnType<typeof applyVisualizerTuning>, mode: string) =>
  (props as unknown as Record<string, Record<string, unknown>>)[`${mode}Tuning`];

describe('applyVisualizerTuning', () => {
  it('reads a bundle keyed by the bare mode name', () => {
    const injected = tuningOf(applyVisualizerTuning('tempera', asProps({}), asBundle({ tempera: {} })), 'tempera');
    expect(injected).toBeDefined();

    // The settings-store field name is not the bundle key; a bundle written that way is ignored.
    const ignored = applyVisualizerTuning('tempera', asProps({}), asBundle({ temperaTuning: {} }));
    expect(tuningOf(ignored, 'tempera')).toBeUndefined();
  });

  it('completes a partial entry from the mode defaults', () => {
    // What the quick-tuning panel actually writes for Tempera: the two fields its generic sliders
    // touch. `layerImages` is read with `.map` by the renderer, so leaving it undefined used to
    // take the stage down on the first slider move.
    const injected = tuningOf(
      applyVisualizerTuning('tempera', asProps({}), asBundle({ tempera: { motionAmount: 1.5, audioReactivity: 1.5 } })),
      'tempera',
    );

    expect(injected.motionAmount).toBe(1.5);
    expect(injected.layerImages).toEqual(DEFAULT_TEMPERA_TUNING.layerImages);
    expect(injected.colorMode).toBe(DEFAULT_TEMPERA_TUNING.colorMode);
    expect(injected.cameraIntensity).toBe(DEFAULT_TEMPERA_TUNING.cameraIntensity);
  });

  it('gives every registered mode defaults, so no partial entry can blank a field', () => {
    const modes = getVisualizerTuningModes();
    expect(modes).toContain('tempera');

    for (const mode of modes) {
      const injected = tuningOf(applyVisualizerTuning(mode, asProps({}), asBundle({ [mode]: {} })), mode);
      expect(Object.keys(injected ?? {}).length, `${mode} has no adapter defaults`).toBeGreaterThan(0);
    }
  });

  it('leaves props untouched when the bundle carries nothing for the mode', () => {
    const props = asProps({ currentTime: 1 });
    expect(applyVisualizerTuning('tempera', props, asBundle({}))).toBe(props);
    expect(applyVisualizerTuning('not-a-mode', props, asBundle({ tempera: {} }))).toBe(props);
  });
});
