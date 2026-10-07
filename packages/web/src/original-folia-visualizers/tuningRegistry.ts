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

export const applyVisualizerTuning = (
    mode: VisualizerMode,
    props: VisualizerSharedProps,
    bundle?: VisualizerTuningBundle,
): VisualizerSharedProps => {
    const adapter = adaptersByMode.get(mode as VisualizerTuningMode);
    const tuning = bundle?.[mode as VisualizerTuningMode];
    if (!adapter || tuning === undefined) return props;

    const resolved = adapter.defaults ? { ...adapter.defaults, ...(tuning as object) } : tuning;
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
