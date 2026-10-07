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

  it('returns the SAME merged object while the stored tuning is unchanged', () => {
    // Both Pixi runtimes guard their expensive paths on tuning identity - `setTuning` starts with
    // `if (previous === tuning) return;` - and this function runs on every host render, which for
    // the player is every `timeupdate` (~4/s). Merging into a fresh object each time defeated those
    // guards, so lumiere re-ran `applySceneTuning` -> `refreshQuality` over every cached scene and
    // tempera re-snapped its resolution and re-ran `applyPool` over every shot, for a tuning that
    // had not moved.
    const stored = { motionAmount: 1.5 };
    const bundle = asBundle({ tempera: stored });

    const first = tuningOf(applyVisualizerTuning('tempera', asProps({}), bundle), 'tempera');
    const second = tuningOf(applyVisualizerTuning('tempera', asProps({}), bundle), 'tempera');
    const third = tuningOf(applyVisualizerTuning('tempera', asProps({}), bundle), 'tempera');

    expect(second).toBe(first);
    expect(third).toBe(first);
    // The merge still happened.
    expect(first.layerImages).toEqual(DEFAULT_TEMPERA_TUNING.layerImages);
  });

  it('returns a NEW merged object once the stored tuning changes', () => {
    // The other half: stability must not become staleness. A slider drag writes a new object into
    // the store, and the renderer has to see it.
    const before = tuningOf(
      applyVisualizerTuning('tempera', asProps({}), asBundle({ tempera: { cameraIntensity: 0.5 } })),
      'tempera',
    );
    const after = tuningOf(
      applyVisualizerTuning('tempera', asProps({}), asBundle({ tempera: { cameraIntensity: 1.25 } })),
      'tempera',
    );

    expect(after).not.toBe(before);
    expect(after.cameraIntensity).toBe(1.25);
  });

  it('does not let one mode\'s defaults leak into another mode with the same stored object', () => {
    // The cache is keyed by the stored object AND checked against the defaults it was merged with,
    // so reusing one object across two modes still merges each against its own defaults.
    const shared = { cameraIntensity: 0.75 };
    const tempera = tuningOf(applyVisualizerTuning('tempera', asProps({}), asBundle({ tempera: shared })), 'tempera');
    const sonnet = tuningOf(applyVisualizerTuning('sonnet', asProps({}), asBundle({ sonnet: shared })), 'sonnet');

    expect(sonnet).not.toBe(tempera);
    expect(sonnet.colorMode).toBeUndefined();
    expect(tempera.colorMode).toBe(DEFAULT_TEMPERA_TUNING.colorMode);
  });
});
