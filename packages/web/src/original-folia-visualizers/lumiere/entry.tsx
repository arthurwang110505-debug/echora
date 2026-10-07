// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/entry.tsx
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
import { DEFAULT_LUMIERE_TUNING } from '../../types';
import { defineVisualizer } from '../definition';
import { lazyVisualizer } from '../lazyVisualizer';
import LumiereSettingsPanel from './LumiereSettingsPanel';

// Echora note: upstream uses React.lazy directly; Echora's modes go through `lazyVisualizer`,
// which adds the Suspense boundary the registry relies on (the registry entry stays synchronous).
const VisualizerLumiere = lazyVisualizer(() => import('./VisualizerLumiere'));

// src/components/visualizer/lumiere/entry.tsx
// Registers 繪光, the stage-lighting lyric director: volumetric light, fog, line art and lyrics lit by the beams.
export default defineVisualizer({
    mode: 'lumiere',
    order: 25,
    labelKey: 'ui.visualizerLumiere',
    labelFallback: '繪光',
    previewSeed: 'lumiere',
    previewStartOffset: 0,
    tuningKind: 'lumiere',
    usesWordSegmentation: true,
    // Deliberately unkeyed on the seed, like tempera: the runtime hands a track change over in
    // place (songHandover.ts / pixiRuntimeHost.ts) instead of throwing the WebGL context away.
    render: props => <VisualizerLumiere {...props} />,
    renderSettingsPanel: props => <LumiereSettingsPanel {...props} />,
    resetSettings: ({ resetLumiereTuning, setDraftLumiereTuning }) => {
        setDraftLumiereTuning?.(DEFAULT_LUMIERE_TUNING);
        resetLumiereTuning?.();
    },
});
