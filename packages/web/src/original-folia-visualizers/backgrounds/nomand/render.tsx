import type { VisualizerBackgroundRenderProps } from '../definition';
import NomandBackgroundLayer from './NomandBackgroundLayer';

// src/components/visualizer/backgrounds/nomand/render.tsx
// The Paper dithering layer, loaded through `entry.tsx`'s `loadRender`.
const NomandBackgroundRender = ({ config, coverUrl, theme, isDaylight }: VisualizerBackgroundRenderProps) => (
    <NomandBackgroundLayer
        coverUrl={coverUrl}
        monetBackgroundImage={config?.customImage}
        tuning={config?.nomand?.tuning}
        theme={theme}
        isDaylight={isDaylight}
    />
);

export default NomandBackgroundRender;
