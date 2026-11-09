
import { motion } from 'framer-motion';
import type { VisualizerBackgroundRenderProps } from '../definition';
import FluidBackground from './FluidBackground';
import GeometricBackground from './GeometricBackground';

// src/components/visualizer/backgrounds/common/render.tsx
// The built-in cover-colour wash plus the geometric layer, loaded through `entry.tsx`'s
// `loadRender` so the stage chunk does not carry it for every visitor.
const CommonBackgroundRender = ({
    config,
    theme,
    coverUrl,
    audioPower,
    audioBands,
    seed,
    staticMode,
    paused,
    performanceTier = 'full',
}: VisualizerBackgroundRenderProps) => {
    const common = config?.common;
    const useCoverColorBg = common?.useCoverColorBg ?? false;

    return (
        <>
            {useCoverColorBg && (
                <motion.div
                    key="fluid-bg"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1 }}
                    className="absolute inset-0 z-0"
                >
                    <FluidBackground coverUrl={coverUrl} theme={theme} />
                </motion.div>
            )}
            <div
                className="absolute inset-0 z-0 transition-all duration-1000"
                style={{
                    backgroundColor: theme.backgroundColor,
                    opacity: useCoverColorBg ? common?.opacity ?? 0.75 : 1,
                }}
            />
            {!staticMode && (
                <div className="absolute inset-0 z-0">
                    <GeometricBackground
                        theme={theme}
                        audioPower={audioPower}
                        audioBands={audioBands}
                        seed={seed}
                        hideShapes={common?.disableGeometricBackground ?? false}
                        performanceTier={performanceTier}
                        disableVignette={common?.disableVignette ?? false}
                        paused={paused}
                    />
                </div>
            )}
        </>
    );
};

export default CommonBackgroundRender;
