import type { VisualizerMode } from '../types';
import type { VisualizerSharedProps } from './definition';
import type {
    VisualizerTuningAdapter,
    VisualizerTuningBundle,
    VisualizerTuningMode,
} from './tuningAdapter';

export type {
    VisualizerTuningAdapter,
    VisualizerTuningBundle,
    VisualizerTuningMap,
    VisualizerTuningMode,
} from './tuningAdapter';

// src/components/visualizer/tuningRegistry.ts
// Pure-data registry for transporting heterogeneous visualizer tuning without importing renderers.
// The adapter types and `defineVisualizerTuning` live in `./tuningAdapter` - see the note there for
// why they are not declared in this file the way upstream declares them.

interface VisualizerTuningModule {
    default: VisualizerTuningAdapter;
}

const tuningModules = import.meta.glob<VisualizerTuningModule>('./*/tuning.ts', { eager: true });
const adapters = Object.values(tuningModules).map(module => module.default);
const adaptersByMode = new Map<VisualizerTuningMode, VisualizerTuningAdapter>();

adapters.forEach(adapter => {
    if (adaptersByMode.has(adapter.mode)) {
        throw new Error(`[VisualizerTuningRegistry] Duplicate adapter for "${adapter.mode}"`);
    }
    adaptersByMode.set(adapter.mode, adapter);
});

/**
 * Merged tunings, keyed by the object the bundle actually holds.
 *
 * The merge exists so a partial bundle entry cannot blank a field the renderer reads (see
 * `VisualizerTuningAdapter.defaults`). It also has to be STABLE: the renderers guard their
 * expensive paths on tuning identity - `TemperaPixiRuntime.setTuning` and
 * `LumierePixiRuntime.setTuning` both start with `if (previous === tuning) return;` - and this
 * function runs on every host render, which for the player is every `timeupdate` (~4/s). Merging
 * unconditionally handed those guards a fresh object each time, so a stage that had merely been
 * re-rendered re-ran its whole tuning path: for lumiere that is `applySceneTuning` →
 * `refreshQuality` over every cached scene, for tempera a resolution snap plus `applyPool` over
 * every shot of every cached scene.
 *
 * Keyed by the bundle's own object, so the merged result is identical for as long as the stored
 * tuning is - and a slider drag, which writes a new object, still produces a new one.
 */
const mergedTunings = new WeakMap<object, { defaults: object; merged: unknown }>();

const resolveTuning = (defaults: object | undefined, tuning: object) => {
    if (!defaults) return tuning;
    const cached = mergedTunings.get(tuning);
    if (cached && cached.defaults === defaults) return cached.merged;
    const merged = { ...defaults, ...tuning };
    mergedTunings.set(tuning, { defaults, merged });
    return merged;
};

export const applyVisualizerTuning = (
    mode: VisualizerMode,
    props: VisualizerSharedProps,
    bundle?: VisualizerTuningBundle,
): VisualizerSharedProps => {
    const adapter = adaptersByMode.get(mode as VisualizerTuningMode);
    const tuning = bundle?.[mode as VisualizerTuningMode];
    if (!adapter || tuning === undefined) return props;

    const resolved = typeof tuning === 'object' && tuning !== null
        ? resolveTuning(adapter.defaults as object | undefined, tuning as object)
        : tuning;
    return adapter.apply(props, resolved as never);
};

export const getVisualizerTuningModes = (): VisualizerTuningMode[] => [...adaptersByMode.keys()];

export const collectVisualizerTunings = (settings: Record<string, unknown>): VisualizerTuningBundle => {
    const bundle: VisualizerTuningBundle = {};
    adapters.forEach(adapter => {
        const value = settings[adapter.settingsKey];
        if (value !== undefined) {
            (bundle as Record<string, unknown>)[adapter.mode] = value;
        }
    });
    return bundle;
};

export const applyVisualizerTuningsToSettings = (
    settings: Record<string, unknown>,
    bundle: VisualizerTuningBundle,
) => {
    adapters.forEach(adapter => {
        const value = bundle[adapter.mode];
        const setter = settings[adapter.settingsSetterKey];
        if (value !== undefined && typeof setter === 'function') {
            setter(value);
        }
    });
};
