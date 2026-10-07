import { DEFAULT_PENDOLO_TUNING } from '../../types';
// Echora note: the helper lives in ../tuningAdapter rather than ../tuningRegistry - the
// registry eagerly imports every adapter, so importing the helper from it is a value cycle.
import { defineVisualizerTuning } from '../tuningAdapter';

// src/components/visualizer/pendolo/tuning.ts
// Injects Pendolo's strongly typed tuning at the renderer boundary.
export default defineVisualizerTuning({
    mode: 'pendolo',
    settingsKey: 'pendoloTuning',
    settingsSetterKey: 'handleSetPendoloTuning',
    defaults: DEFAULT_PENDOLO_TUNING,
    apply: (props, tuning) => ({ ...props, pendoloTuning: tuning }),
});
