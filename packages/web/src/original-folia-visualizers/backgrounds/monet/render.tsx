import type { VisualizerBackgroundRenderProps } from '../definition';
import MonetBackgroundLayer from './MonetBackgroundLayer';

// src/components/visualizer/backgrounds/monet/render.tsx
// The Monet image-treatment layer, loaded through `entry.tsx`'s `loadRender`.
const MonetBackgroundRender = ({ config, coverUrl, theme, isDaylight }: VisualizerBackgroundRenderProps) => (
    <MonetBackgroundLayer
        coverUrl={coverUrl}
        monetBackgroundImage={config?.customImage}
        theme={theme}
        isDaylight={isDaylight}
        tuning={config?.monet?.tuning}
        transparentBackground={config?.transparent}
    />
);

export default MonetBackgroundRender;
