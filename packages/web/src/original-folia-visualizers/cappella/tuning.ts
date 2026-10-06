import { DEFAULT_CAPPELLA_TUNING } from '../../types';
// Echora note: the helper lives in ../tuningAdapter rather than ../tuningRegistry - the
// registry eagerly imports every adapter, so importing the helper from it is a value cycle.
import { defineVisualizerTuning } from '../tuningAdapter';

// Injects Cappella's strongly typed tuning at the renderer boundary.
export default defineVisualizerTuning({ mode: 'cappella', settingsKey: 'cappellaTuning', settingsSetterKey: 'handleSetCappellaTuning', defaults: DEFAULT_CAPPELLA_TUNING, apply: (props, tuning) => ({ ...props, cappellaTuning: tuning }) });
