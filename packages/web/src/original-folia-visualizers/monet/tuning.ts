import { DEFAULT_MONET_TUNING } from '../../types';
// Echora note: the helper lives in ../tuningAdapter rather than ../tuningRegistry - the
// registry eagerly imports every adapter, so importing the helper from it is a value cycle.
import { defineVisualizerTuning } from '../tuningAdapter';

// Injects Monet's strongly typed tuning at the renderer boundary.
export default defineVisualizerTuning({ mode: 'monet', settingsKey: 'monetTuning', settingsSetterKey: 'handleSetMonetTuning', defaults: DEFAULT_MONET_TUNING, apply: (props, tuning) => ({ ...props, monetTuning: tuning }) });
