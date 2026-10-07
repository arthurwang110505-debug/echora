import { DEFAULT_CLADDAGH_TUNING } from '../../types';
// Echora note: the helper lives in ../tuningAdapter rather than ../tuningRegistry - the
// registry eagerly imports every adapter, so importing the helper from it is a value cycle.
import { defineVisualizerTuning } from '../tuningAdapter';

// Injects Claddagh's strongly typed tuning at the renderer boundary.
export default defineVisualizerTuning({ mode: 'claddagh', settingsKey: 'claddaghTuning', settingsSetterKey: 'handleSetCladdaghTuning', defaults: DEFAULT_CLADDAGH_TUNING, apply: (props, tuning) => ({ ...props, claddaghTuning: tuning }) });
