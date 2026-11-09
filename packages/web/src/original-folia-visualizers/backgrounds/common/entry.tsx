import { defineVisualizerBackground } from '../definition';
import CommonBackgroundSettingsCard from './CommonBackgroundSettingsCard';

// src/components/visualizer/backgrounds/common/entry.tsx
// Registers the built-in cover-color and geometric shell background.

export default defineVisualizerBackground({
    mode: 'common',
    order: 10,
    labelKey: 'options.visualizerBackgroundModeCommon',
    labelFallback: 'Common',
    loadRender: () => import('./render'),
    renderSettingsPanel: props => <CommonBackgroundSettingsCard {...props} />,
    resetSettings: actions => {
        actions?.common?.onOpacityChange?.(0.75);
        actions?.common?.onCoverColorChange?.(false);
        actions?.common?.onDisableVignetteChange?.(false);
        actions?.common?.onDisableGeometricChange?.(false);
    },
});
