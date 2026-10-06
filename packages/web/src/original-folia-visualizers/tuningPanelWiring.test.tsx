// @vitest-environment jsdom
//
// Echora note: this test lives in the visualizer tree rather than next to the component it covers,
// because it has to import the tuning registry - and the registry's tree (`src/original-folia-
// visualizers/**`) is excluded from the main tsconfig, while `src/components/**` is not. A test
// under `src/components` that imports the registry would drag `src/types.ts` into the main `tsc`
// program and fail the build on that file's pre-existing, separately-tracked debt. Here the file is
// type-checked by `scripts/check-visualizer-types.mjs` instead.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import OriginalFoliaTuningPanel from '../components/OriginalFoliaTuningPanel';
import { DEFAULT_TEMPERA_TUNING } from '../types';
import type { VisualizerSharedProps } from './definition';
import { applyVisualizerTuning } from './tuningRegistry';

/**
 * The quick-tuning panel is the only live surface that writes `stageStore.visualizerTunings`, and
 * it used to key every write `${mode}Tuning` while `applyVisualizerTuning` reads `bundle[mode]` -
 * so the sliders were silently dropped for every mode. These tests pin the contract to the shape
 * the renderer actually consumes.
 */

const asProps = (value: Record<string, unknown>) => value as unknown as VisualizerSharedProps;

const setSlider = (container: HTMLElement, index: number, value: string) => {
  const slider = container.querySelectorAll('input[type="range"]')[index] as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(slider, value);
  slider.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('OriginalFoliaTuningPanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (mode: string, onTuningsChange = vi.fn()) => {
    act(() => {
      root.render(
        <OriginalFoliaTuningPanel
          mode={mode}
          autoMode={false}
          onAutoModeChange={() => {}}
          onModeChange={() => {}}
          onClose={() => {}}
          backgroundMode={'latent'}
          onBackgroundModeChange={() => {}}
          tunings={{}}
          onTuningsChange={onTuningsChange}
        />,
      );
    });
    return onTuningsChange;
  };

  it('offers Tempera in its mode list, in stage-picker order', () => {
    render('tempera');

    const options = [...container.querySelectorAll('select')][0].querySelectorAll('option');
    expect([...options].map(option => option.value)).toEqual([
      'classic',
      'cadenza',
      'tempera',
      'partita',
      'fume',
      'monet',
      'cappella',
      'pendolo',
      'sonnet',
      'claddagh',
      'diorama',
      'tilt',
    ]);
  });

  it('writes the bare mode key the renderer reads, and the value survives the adapter', () => {
    const onTuningsChange = render('tempera');

    act(() => setSlider(container, 0, '1.5'));

    expect(onTuningsChange).toHaveBeenCalledTimes(1);
    const written = onTuningsChange.mock.calls[0][0] as Record<string, Record<string, unknown>>;
    expect(Object.keys(written)).toEqual(['tempera']);
    expect(written.temperaTuning).toBeUndefined();
    expect(written.tempera.motionAmount).toBe(1.5);

    // The contract end to end: what the panel wrote is what the stage renderer receives, with the
    // rest of the tuning filled in from the mode defaults (`layerImages` is read with `.map`, so an
    // undefined array here is a stage that throws on the first slider move).
    const injected = applyVisualizerTuning('tempera', asProps({}), written).temperaTuning;
    // `motionAmount` is the quick panel's generic field, not one of Tempera's own; it rides along
    // in the injected object, while the fields the mode reads come from the defaults.
    const writtenTuning = injected as unknown as Record<string, unknown>;
    expect(writtenTuning.motionAmount).toBe(1.5);
    expect(injected?.layerImages).toEqual(DEFAULT_TEMPERA_TUNING.layerImages);
    expect(injected?.colorMode).toBe('duo');
  });

  it('writes only the mode being tuned', () => {
    const onTuningsChange = render('sonnet');

    act(() => setSlider(container, 1, '1.2'));

    const written = onTuningsChange.mock.calls[0][0] as Record<string, Record<string, unknown>>;
    expect(Object.keys(written)).toEqual(['sonnet']);
  });
});
