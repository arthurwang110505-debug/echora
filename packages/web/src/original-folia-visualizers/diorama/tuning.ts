import { DEFAULT_DIORAMA_TUNING } from '../../types';
// Echora note: the helper lives in ../tuningAdapter rather than ../tuningRegistry - the
// registry eagerly imports every adapter, so importing the helper from it is a value cycle.
import { defineVisualizerTuning } from '../tuningAdapter';

// Injects Diorama's strongly typed tuning at the renderer boundary.
export default defineVisualizerTuning({ mode: 'diorama', settingsKey: 'dioramaTuning', settingsSetterKey: 'handleSetDioramaTuning', defaults: DEFAULT_DIORAMA_TUNING, apply: (props, tuning) => ({ ...props, dioramaTuning: tuning }) });
