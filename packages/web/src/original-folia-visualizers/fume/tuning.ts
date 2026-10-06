import { DEFAULT_FUME_TUNING } from '../../types';
// Echora note: the helper lives in ../tuningAdapter rather than ../tuningRegistry - the
// registry eagerly imports every adapter, so importing the helper from it is a value cycle.
import { defineVisualizerTuning } from '../tuningAdapter';

// Injects Fume's strongly typed tuning at the renderer boundary.
export default defineVisualizerTuning({ mode: 'fume', settingsKey: 'fumeTuning', settingsSetterKey: 'handleSetFumeTuning', defaults: DEFAULT_FUME_TUNING, apply: (props, tuning) => ({ ...props, fumeTuning: tuning }) });
