import { DEFAULT_MONET_BACKGROUND_TUNING } from '../../../types';
import { MonetBackgroundSettingsCard } from './MonetBackgroundSettingsCard';
import { defineVisualizerBackground } from '../definition';

// src/components/visualizer/backgrounds/monet/entry.tsx
// Registers the Monet image-treatment shell background.

export default defineVisualizerBackground({
    mode: 'monet',
    order: 20,
    labelKey: 'options.visualizerBackgroundModeMonet',
    labelFallback: 'Monet',
    loadRender: () => import('./render'),
    renderSettingsPanel: ({
        config,
        actions,
        t,
        isDaylight,
        theme,
        controlCardBg,
        rangeInputClass,
        onSliderPointerDown,
        onSliderCommit,
    }) => (
        <MonetBackgroundSettingsCard
            t={t}
            isDaylight={isDaylight}
            theme={theme}
            controlCardBg={controlCardBg}
            rangeInputClass={rangeInputClass}
            tuning={config?.monet?.tuning ?? DEFAULT_MONET_BACKGROUND_TUNING}
            onTuningChange={actions?.monet?.onTuningChange}
            monetBackgroundImage={config?.customImage}
            onUploadMonetBackgroundImage={actions?.customImage?.onUpload}
            onClearMonetBackgroundImage={actions?.customImage?.onClear}
            isLoadingMonetBackgroundImage={actions?.customImage?.isLoading}
            onSliderPointerDown={onSliderPointerDown}
            onSliderCommit={onSliderCommit}
        />
    ),
    resetSettings: actions => actions?.monet?.onResetTuning?.(),
});
