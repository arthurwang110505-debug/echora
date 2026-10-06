import type { ThemeConfig } from '@echora/core';
import { ListMusic, Mic2, MonitorSmartphone, Palette, Command, type LucideIcon } from 'lucide-react';
import { VISUALIZER_OPTIONS } from '../player/panel/stageOptions';

/**
 * Content for the landing's acts. Mode scenes map onto the real
 * `@echora/core` visualizer registry ids so the Modes act renders the actual
 * engines; each carries the player-style theme that lights the whole page
 * while it is on stage.
 */

export interface ModeScene {
  /** Real player stage id (see `VISUALIZER_OPTIONS`). */
  id: string;
  /** Display name exactly as the player's stage picker lists it. */
  name: string;
  descriptionKey: string;
  theme: ThemeConfig;
}

const theme = (name: string, accentColor: string, primaryColor: string, secondaryColor: string): ThemeConfig => ({
  name,
  backgroundColor: '#07090e',
  accentColor,
  primaryColor,
  secondaryColor,
});

/** One palette per real stage mode; the page relights with it while that mode is on stage. */
const MODE_PALETTES: Record<string, [accent: string, primary: string, secondary: string]> = {
  classic: ['#62f5c4', '#6366f1', '#22d3ee'],
  cadenza: ['#a5b4fc', '#22d3ee', '#f0abfc'],
  // Tempera paints with two inks on paper, so the landing relights to a print palette:
  // vermillion accent, cream paper, Prussian blue.
  tempera: ['#e2634a', '#f0e2c8', '#2f6f8f'],
  partita: ['#fde68a', '#818cf8', '#62f5c4'],
  fume: ['#cbd5e1', '#64748b', '#a5b4fc'],
  monet: ['#c4b5fd', '#62f5c4', '#fda4af'],
  cappella: ['#f5f5f4', '#a8a29e', '#62f5c4'],
  pendolo: ['#fbbf24', '#f472b6', '#38bdf8'],
  sonnet: ['#fda4af', '#c084fc', '#fde68a'],
  claddagh: ['#86efac', '#2dd4bf', '#fbbf24'],
  diorama: ['#38bdf8', '#f472b6', '#fde68a'],
  tilt: ['#f0abfc', '#62f5c4', '#60a5fa'],
};

/**
 * The Modes act walks the player's real stage picker — same ids, same names,
 * same order — so what the landing promises is exactly what /player offers.
 */
export const MODE_SCENES: ModeScene[] = VISUALIZER_OPTIONS.map(option => {
  const [accent, primary, secondary] = MODE_PALETTES[option.value] ?? MODE_PALETTES.classic;
  return {
    id: option.value,
    name: option.label,
    descriptionKey: `welcome.mode_${option.value}`,
    theme: theme(option.label, accent, primary, secondary),
  };
});

export interface LandingFeature {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Short stage-style label shown as the card's "cue number". */
  cue: string;
}

export const LANDING_FEATURES: LandingFeature[] = [
  { icon: Mic2, title: 'welcome.featureStageTitle', description: 'welcome.featureStageDesc', cue: '01' },
  { icon: Palette, title: 'welcome.featureAiTitle', description: 'welcome.featureAiDesc', cue: '02' },
  { icon: ListMusic, title: 'welcome.featureMusicTitle', description: 'welcome.featureMusicDesc', cue: '03' },
  { icon: Command, title: 'welcome.featureControlTitle', description: 'welcome.featureControlDesc', cue: '04' },
  { icon: MonitorSmartphone, title: 'welcome.featureInstallTitle', description: 'welcome.featureInstallDesc', cue: '05' },
];
