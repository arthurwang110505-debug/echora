import React from 'react';
import { defineVisualizer } from '../definition';
import { lazyVisualizer } from '../lazyVisualizer';
import { PartitaSettingsPanel } from '../settingsPanels';

// src/components/visualizer/partita/entry.tsx
// Registers Partita and its preview tuning panel.
export default defineVisualizer({
    mode: 'partita',
    order: 30,
    labelKey: 'ui.visualizerPartita',
    labelFallback: '云阶',
    previewSeed: 'partita',
    previewStartOffset: 0,
    tuningKind: 'partita',
    render: lazyVisualizer(() => import('./VisualizerPartita')),
    renderSettingsPanel: props => <PartitaSettingsPanel {...props} />,
    resetSettings: ({ resetPartitaTuning }) => {
        resetPartitaTuning?.();
    },
});
