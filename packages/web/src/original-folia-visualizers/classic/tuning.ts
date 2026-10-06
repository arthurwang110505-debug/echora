// Echora note: the helper lives in ../tuningAdapter rather than ../tuningRegistry - the
// registry eagerly imports every adapter, so importing the helper from it is a value cycle.
import { DEFAULT_CLASSIC_TUNING } from '../../types';
import { defineVisualizerTuning } from '../tuningAdapter';

// Injects Classic's strongly typed tuning at the renderer boundary.
export default defineVisualizerTuning({ mode: 'classic', settingsKey: 'classicTuning', settingsSetterKey: 'handleSetClassicTuning', defaults: DEFAULT_CLASSIC_TUNING, apply: (props, tuning) => ({ ...props, classicTuning: tuning }) });
