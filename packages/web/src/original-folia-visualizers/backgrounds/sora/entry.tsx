import { defineVisualizerBackground } from '../definition';

// src/components/visualizer/backgrounds/sora/entry.tsx
// Registers the shader-based Sora starfield shell background.
//
// Metadata only. The implementation (and twgl.js with it) is behind `loadRender`, because this
// module is part of `registry.tsx`'s eager glob and therefore part of the stage chunk.

export default defineVisualizerBackground({
    mode: 'sora',
    order: 50,
    labelKey: 'options.visualizerBackgroundModeSora',
    labelFallback: 'Sora',
    loadRender: () => import('./render'),
});
