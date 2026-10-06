// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/components/visualizer/tuning.ts
//
// Kept deliberately close to upstream: the value is in its measured constants and its ordering
// of work per frame, not in a rewrite. Echora changes are marked with an "Echora note:".
// Copyright (c) 2026 chthollyphile
// Echora note: the helper lives in ../tuningAdapter rather than ../tuningRegistry - the registry
// eagerly imports every adapter, so importing the helper from it is a value cycle.
import { DEFAULT_LUMIERE_TUNING } from '../../types';
import { defineVisualizerTuning } from '../tuningAdapter';

// src/components/visualizer/lumiere/tuning.ts
// Injects 繪光's strongly typed tuning at the renderer boundary.
export default defineVisualizerTuning({
    mode: 'lumiere',
    settingsKey: 'lumiereTuning',
    settingsSetterKey: 'handleSetLumiereTuning',
    defaults: DEFAULT_LUMIERE_TUNING,
    apply: (props, tuning) => ({ ...props, lumiereTuning: tuning }),
});
