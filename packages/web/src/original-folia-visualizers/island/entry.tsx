import React from 'react';
import { defineVisualizer } from '../definition';
import { lazyVisualizer } from '../lazyVisualizer';

const VisualizerIsland = lazyVisualizer(() => import('./VisualizerIsland'));

// src/original-folia-visualizers/island/entry.tsx
// Registers 靈動詞島: the lyric readout as a stage mode - one line, its translation, and a ring
// that fills with the line. Credited to Lyricify's Dynamic Lyrics Island (CC BY-SA 4.0); the
// implementation is Echora's own.
export default defineVisualizer({
    mode: 'island',
    // Last: it is the quietest mode, and it should not sit in the middle of the scene directors.
    order: 140,
    labelKey: 'ui.visualizerIsland',
    labelFallback: '靈動詞島',
    previewSeed: 'island',
    previewStartOffset: 0,
    tuningKind: 'none',
    usesWordSegmentation: true,
    // No key on the seed: there is no runtime to rebuild, only React state to re-resolve.
    render: props => <VisualizerIsland {...props} />,
});
