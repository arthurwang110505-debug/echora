import type { VisualizerBackgroundRenderProps } from '../definition';
import UrlBackgroundLayer from './UrlBackgroundLayer';

// src/components/visualizer/backgrounds/url/render.tsx
// The embedded-page layer, loaded through `entry.tsx`'s `loadRender`.
const UrlBackgroundRender = ({ config }: VisualizerBackgroundRenderProps) => (
    <UrlBackgroundLayer
        urlBackgroundList={config?.url?.items}
        urlBackgroundSelectedId={config?.url?.selectedId}
    />
);

export default UrlBackgroundRender;
