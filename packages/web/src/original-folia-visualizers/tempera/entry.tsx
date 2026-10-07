// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/entry.tsx
//
// Kept deliberately close to upstream: this is a scene director, and the value is in its
// measured constants and its ordering of work per frame, not in a rewrite. Echora-specific
// changes are marked with an "Echora note:" comment.
import { DEFAULT_TEMPERA_TUNING } from '../../types';
import { defineVisualizer } from '../definition';
import { lazyVisualizer } from '../lazyVisualizer';
import TemperaSettingsPanel from './TemperaSettingsPanel';

// Echora note: upstream uses React.lazy directly; Echora's modes go through `lazyVisualizer`,
// which adds the Suspense boundary the registry relies on (the registry entry stays synchronous).
const VisualizerTempera = lazyVisualizer(() => import('./VisualizerTempera'));

// src/components/visualizer/tempera/entry.tsx
// Registers 凝彩, the deterministic block-composition lyric-PV director.
export default defineVisualizer({
    mode: 'tempera',
    order: 20,
    labelKey: 'ui.visualizerTempera',
    labelFallback: 'Tempera',
    previewSeed: 'tempera',
    previewStartOffset: 0,
    tuningKind: 'tempera',
    usesWordSegmentation: true,
    // Deliberately unkeyed on the seed: the runtime hands a track change over in place
    // (see songHandover.ts / pixiRuntimeHost.ts). Remounting here would throw the WebGL
    // context away mid-transition and leave the frame empty for the whole rebuild.
    render: props => <VisualizerTempera {...props} />,
    renderSettingsPanel: props => <TemperaSettingsPanel {...props} />,
    resetSettings: ({ resetTemperaTuning, setDraftTemperaTuning }) => {
        setDraftTemperaTuning?.(DEFAULT_TEMPERA_TUNING);
        resetTemperaTuning?.();
    },
});
