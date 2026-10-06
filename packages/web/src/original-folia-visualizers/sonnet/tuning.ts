import { DEFAULT_SONNET_TUNING } from '../../types';
// Echora note: the helper lives in ../tuningAdapter rather than ../tuningRegistry - the
// registry eagerly imports every adapter, so importing the helper from it is a value cycle.
import { defineVisualizerTuning } from '../tuningAdapter';

// src/components/visualizer/sonnet/tuning.ts
// Injects Sonnet's strongly typed tuning at the renderer boundary.
export default defineVisualizerTuning({
    mode: 'sonnet',
    settingsKey: 'sonnetTuning',
    settingsSetterKey: 'handleSetSonnetTuning',
    defaults: DEFAULT_SONNET_TUNING,
    apply: (props, tuning) => ({ ...props, sonnetTuning: tuning }),
});
