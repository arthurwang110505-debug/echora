import React from 'react';
import { DEFAULT_CLADDAGH_TUNING } from '../../../types';
import { defineVisualizer } from '../definition';
import { lazyVisualizer } from '../lazyVisualizer';
import { CladdaghSettingsPanel } from '../settingsPanels';

// src/components/visualizer/claddagh/entry.tsx

export default defineVisualizer({
    mode: 'claddagh',
    order: 45,
    labelKey: 'ui.visualizerCladdagh',
    labelFallback: 'Claddagh',
    previewSeed: 'claddagh',
    previewStartOffset: 0,
    tuningKind: 'claddagh',
    render: lazyVisualizer(() => import('./VisualizerCladdagh')),
    renderSettingsPanel: props => <CladdaghSettingsPanel {...props} />,
    resetSettings: ({ resetCladdaghTuning, setDraftCladdaghTuning }) => {
        setDraftCladdaghTuning?.(DEFAULT_CLADDAGH_TUNING);
        resetCladdaghTuning?.();
    },
});
