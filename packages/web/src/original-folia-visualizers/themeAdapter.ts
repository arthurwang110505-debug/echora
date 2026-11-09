// src/original-folia-visualizers/themeAdapter.ts
//
// One place that adapts the app's `ThemeConfig` to the visualizer graph's `Theme`.
//
// This used to live inside `OriginalFoliaVisualizerStage`. It moved out when the 靈動詞島 overlay -
// which renders outside the stage subtree - needed the same conversion: importing it from the stage
// component would have made the player page depend on a component it already mocks in its own
// tests, which is exactly the coupling `PlayerPanel.test.tsx` catches. The mapping belongs next to
// the contract it maps to, not next to one of its consumers.
import type { ThemeConfig } from '@echora/core';
import type { Theme } from '../types';

export const toOriginalTheme = (theme: ThemeConfig): Theme => ({
  name: theme.name,
  backgroundColor: theme.backgroundColor || '#07090e',
  primaryColor: theme.primaryColor || '#62f5c4',
  accentColor: theme.accentColor || '#62f5c4',
  secondaryColor: theme.secondaryColor || '#6366f1',
  fontStyle: theme.fontStyle || 'sans',
  animationIntensity: 'normal',
  fontWeight: 700,
});
