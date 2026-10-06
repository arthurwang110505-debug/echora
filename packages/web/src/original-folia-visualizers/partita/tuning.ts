import { DEFAULT_PARTITA_TUNING } from '../../types';
// Echora note: the helper lives in ../tuningAdapter rather than ../tuningRegistry - the
// registry eagerly imports every adapter, so importing the helper from it is a value cycle.
import { defineVisualizerTuning } from '../tuningAdapter';

// Injects Partita's strongly typed tuning at the renderer boundary.
export default defineVisualizerTuning({ mode: 'partita', settingsKey: 'partitaTuning', settingsSetterKey: 'handleSetPartitaTuning', defaults: DEFAULT_PARTITA_TUNING, apply: (props, tuning) => ({ ...props, partitaTuning: tuning }) });
