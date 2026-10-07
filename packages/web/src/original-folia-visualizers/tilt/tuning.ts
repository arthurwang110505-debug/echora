import { DEFAULT_TILT_TUNING } from '../../types';
// Echora note: the helper lives in ../tuningAdapter rather than ../tuningRegistry - the
// registry eagerly imports every adapter, so importing the helper from it is a value cycle.
import { defineVisualizerTuning } from '../tuningAdapter';

// Injects Tilt's strongly typed tuning at the renderer boundary.
export default defineVisualizerTuning({ mode: 'tilt', settingsKey: 'tiltTuning', settingsSetterKey: 'handleSetTiltTuning', defaults: DEFAULT_TILT_TUNING, apply: (props, tuning) => ({ ...props, tiltTuning: tuning }) });
