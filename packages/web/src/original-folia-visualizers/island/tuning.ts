// src/original-folia-visualizers/island/tuning.ts
// Injects 靈動詞島's tuning at the renderer boundary. The island is deliberately sparse - it has
// three knobs, all of which are about legibility at small sizes rather than about art direction.
import { DEFAULT_ISLAND_TUNING } from '../../types';
import { defineVisualizerTuning } from '../tuningAdapter';

export default defineVisualizerTuning({
    mode: 'island',
    settingsKey: 'islandTuning',
    settingsSetterKey: 'handleSetIslandTuning',
    defaults: DEFAULT_ISLAND_TUNING,
    apply: (props, tuning) => ({ ...props, islandTuning: tuning }),
});
