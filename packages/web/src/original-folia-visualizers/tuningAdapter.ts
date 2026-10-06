import type {
    CappellaTuning,
    CadenzaTuning,
    ClassicTuning,
    CladdaghTuning,
    DioramaTuning,
    FumeTuning,
    MonetTuning,
    PartitaTuning,
    PendoloTuning,
    SonnetTuning,
    TemperaTuning,
    TiltTuning,
} from '../types';
import type { VisualizerSharedProps } from './definition';

/**
 * The tuning adapter contract, on a module of its own.
 *
 * Echora note: upstream declares these types and `defineVisualizerTuning` inside
 * `tuningRegistry.ts`, and every mode's `tuning.ts` imports the helper from there. The registry imports
 * every adapter module (an eager `import.meta.glob`), so that is a *runtime import cycle through a
 * value* - which only works when the bundler hoists the function declaration above the adapter's
 * call. Rollup's production output does; esbuild's transform (which is what Vitest runs) does not,
 * and the helper resolves to `undefined` the moment a test imports the registry - which is exactly
 * what `tuningRegistry.test.ts` has to do to pin the bundle-key and defaults contract.
 *
 * The types live here so `tuning.ts` keeps importing a module with no eager glob in it, and the
 * registry re-exports them for its existing importers (`definition.ts`, the appearance codec). The
 * helper is deliberately *not* re-exported from the registry: a future ported adapter that copies
 * upstream's import path fails loudly instead of quietly rebuilding the cycle.
 */

/** Every mode that carries a tuning, keyed by the bare mode name the bundle uses. */
export interface VisualizerTuningMap {
    classic: ClassicTuning;
    cadenza: CadenzaTuning;
    partita: PartitaTuning;
    fume: FumeTuning;
    claddagh: CladdaghTuning;
    cappella: CappellaTuning;
    tilt: TiltTuning;
    diorama: DioramaTuning;
    monet: MonetTuning;
    pendolo: PendoloTuning;
    sonnet: SonnetTuning;
    tempera: TemperaTuning;
}

export type VisualizerTuningMode = keyof VisualizerTuningMap;
export type VisualizerTuningBundle = Partial<VisualizerTuningMap>;

export interface VisualizerTuningAdapter<M extends VisualizerTuningMode = VisualizerTuningMode> {
    mode: M;
    settingsKey: string;
    settingsSetterKey: string;
    /**
     * The mode's complete default tuning. An entry in the bundle can be partial - the quick-tuning
     * panel seeds one with only the fields its generic sliders touch, and a hand-edited cfg URL can
     * carry a truncated object - while a renderer reads its tuning's fields directly. `apply`
     * therefore merges the incoming value over these defaults rather than handing the raw object
     * down, so a partial entry can never blank a field the mode needs (Tempera's `layerImages`, say,
     * is read with `.map`).
     */
    defaults?: VisualizerTuningMap[M];
    apply: (props: VisualizerSharedProps, tuning: VisualizerTuningMap[M]) => VisualizerSharedProps;
}

export const defineVisualizerTuning = <M extends VisualizerTuningMode>(
    adapter: VisualizerTuningAdapter<M>,
) => adapter;
