import React from 'react';
import { defineVisualizer } from '../definition';
import { lazyVisualizer } from '../lazyVisualizer';
import { ClassicSettingsPanel } from '../settingsPanels';

// src/components/visualizer/classic/entry.tsx
// Registers the classic visualizer mode.
export default defineVisualizer({
    mode: 'classic',
    order: 10,
    labelKey: 'ui.visualizerClassic',
    labelFallback: 'Luminous',
    previewSeed: 'classic',
    previewStartOffset: 0,
    tuningKind: 'classic',
    render: lazyVisualizer(() => import('./Visualizer')),
    renderSettingsPanel: props => <ClassicSettingsPanel {...props} />,
    resetSettings: ({ resetClassicTuning }) => {
        resetClassicTuning?.();
    },
});
