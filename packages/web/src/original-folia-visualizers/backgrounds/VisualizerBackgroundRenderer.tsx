import React, { Suspense, lazy, type ComponentType } from 'react';
import type { VisualizerBackgroundRenderProps } from './definition';
import {
    DEFAULT_VISUALIZER_BACKGROUND_MODE,
    getVisualizerBackgroundRegistryEntry,
} from './registry';

// src/components/visualizer/backgrounds/VisualizerBackgroundRenderer.tsx
// Selects the active shell background through the discoverable background registry.
//
// Every background except the default is loaded on demand, and that is the point of this file.
// `registry.tsx` globs `*/entry.tsx` eagerly, so anything an entry imports statically lands in
// the stage chunk and is fetched by every `/player` visit. Before the split that was every
// background implementation at once - 388 kB of twgl for Sora's starfield among them - for a
// screen that draws one of them.
//
// The registry keeps the metadata (mode, order, labels, settings panel) synchronous, so the
// picker and the settings cards behave exactly as before. `latent` is the default and keeps its
// eager `render`, so the common case has no extra round trip and no empty first frame.

type BackgroundComponent = ComponentType<VisualizerBackgroundRenderProps>;

const lazyComponents = new Map<string, ComponentType<VisualizerBackgroundRenderProps>>();

/**
 * Resolves the component for a mode, creating its `lazy()` wrapper once.
 *
 * The wrapper must be stable across renders: a fresh `lazy()` each render remounts the
 * background, which for the shader modes means tearing down and rebuilding a WebGL context on
 * every parent update.
 */
const resolveBackgroundComponent = (mode: string) => {
    const cached = lazyComponents.get(mode);
    if (cached) return cached;

    const load = getVisualizerBackgroundRegistryEntry(mode).loadRender;
    if (!load) return null;

    const LazyBackground = lazy(load as unknown as () => Promise<{ default: BackgroundComponent }>);
    lazyComponents.set(mode, LazyBackground);
    return LazyBackground;
};

const VisualizerBackgroundRenderer: React.FC<VisualizerBackgroundRenderProps> = (props) => {
    if (props.config?.transparent) {
        return null;
    }

    const mode = props.config?.mode ?? DEFAULT_VISUALIZER_BACKGROUND_MODE;
    const BackgroundComponent = resolveBackgroundComponent(mode);
    if (!BackgroundComponent) {
        return <>{getVisualizerBackgroundRegistryEntry(mode).render?.(props)}</>;
    }

    // `fallback={null}` on purpose: an absent background still shows the theme colour underneath,
    // which reads as a deliberate fade-in rather than as a missing layer.
    return (
        <Suspense fallback={null}>
            <BackgroundComponent {...props} />
        </Suspense>
    );
};

export default VisualizerBackgroundRenderer;
