import type { VisualizerBackgroundRenderProps } from '../definition';
import SoraBackground from './SoraBackground';

// src/components/visualizer/backgrounds/sora/render.tsx
// The shader starfield itself. Loaded through `entry.tsx`'s `loadRender`, so twgl.js (388 kB)
// arrives when this background is selected rather than with every `/player` visit.
const SoraBackgroundRender = ({ theme, isDaylight, paused, performanceTier }: VisualizerBackgroundRenderProps) => (
    <div className="absolute inset-0 z-0">
        <SoraBackground theme={theme} isDaylight={isDaylight} paused={paused} performanceTier={performanceTier} />
    </div>
);

export default SoraBackgroundRender;
