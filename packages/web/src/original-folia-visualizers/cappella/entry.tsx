import React from 'react';
import { defineVisualizer } from '../definition';
import { lazyVisualizer } from '../lazyVisualizer';
import { CappellaSettingsPanel } from '../settingsPanels';

// src/components/visualizer/cappella/entry.tsx
// Registers the Cappella chat visualizer mode.
export default defineVisualizer({
    mode: 'cappella',
    order: 50,
    labelKey: 'ui.visualizerCappella',
    labelFallback: 'Cappella',
    previewSeed: 'cappella',
    previewStartOffset: 0,
    tuningKind: 'cappella',
    render: lazyVisualizer(() => import('./VisualizerCappella')),
    renderSettingsPanel: props => <CappellaSettingsPanel {...props} />,
    resetSettings: props => {
        props.resetCappellaTuning?.();
    },
});
