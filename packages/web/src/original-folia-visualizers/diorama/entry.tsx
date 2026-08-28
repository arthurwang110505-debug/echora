import React from 'react';
import { defineVisualizer } from '../definition';
import { lazyVisualizer } from '../lazyVisualizer';
import { DioramaSettingsPanel } from '../settingsPanels';

// src/components/visualizer/diorama/entry.tsx
// Registers Diorama: a procedural 3D lyric flythrough with lyric-synced cinematic camera work, plus
// its tuning panel (camera speed / motion amount / geometry visibility and response / particles).
export default defineVisualizer({
    mode: 'diorama',
    order: 60,
    labelKey: 'ui.visualizerDiorama',
    labelFallback: '镜台',
    previewSeed: 'diorama',
    previewStartOffset: 0,
    tuningKind: 'diorama',
    render: lazyVisualizer(() => import('./VisualizerDiorama')),
    renderSettingsPanel: props => <DioramaSettingsPanel {...props} />,
    resetSettings: ({ resetDioramaTuning }) => {
        resetDioramaTuning?.();
    },
});
