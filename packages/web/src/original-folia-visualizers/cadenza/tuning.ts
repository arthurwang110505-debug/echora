// Echora note: the helper lives in ../tuningAdapter rather than ../tuningRegistry - the
// registry eagerly imports every adapter, so importing the helper from it is a value cycle.
import { defineVisualizerTuning } from '../tuningAdapter';
import { DEFAULT_CADENZA_TUNING } from '../../types';

// Injects Cadenza's strongly typed tuning at the renderer boundary.
export default defineVisualizerTuning({ mode: 'cadenza', settingsKey: 'cadenzaTuning', settingsSetterKey: 'handleSetCadenzaTuning', defaults: DEFAULT_CADENZA_TUNING, apply: (props, tuning) => ({ ...props, cadenzaTuning: tuning }) });
