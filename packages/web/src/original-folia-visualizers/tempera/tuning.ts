// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/tuning.ts
//
// Kept deliberately close to upstream: this is a scene director, and the value is in its
// measured constants and its ordering of work per frame, not in a rewrite. Echora-specific
// changes are marked with an "Echora note:" comment.
import { DEFAULT_TEMPERA_TUNING } from '../../types';
// Echora note: the helper lives in ../tuningAdapter rather than ../tuningRegistry - the
// registry eagerly imports every adapter, so importing the helper from it is a value cycle.
import { defineVisualizerTuning } from '../tuningAdapter';

// src/components/visualizer/tempera/tuning.ts
// Injects Tempera's strongly typed tuning at the renderer boundary.
export default defineVisualizerTuning({
    mode: 'tempera',
    settingsKey: 'temperaTuning',
    settingsSetterKey: 'handleSetTemperaTuning',
    defaults: DEFAULT_TEMPERA_TUNING,
    apply: (props, tuning) => ({ ...props, temperaTuning: tuning }),
});
