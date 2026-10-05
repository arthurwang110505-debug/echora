import type { ThemeConfig } from '@echora/core';
import { ListMusic, Mic2, MonitorSmartphone, Palette, Command, type LucideIcon } from 'lucide-react';

/**
 * Content for the landing's acts. Mode scenes map onto the real
 * `@echora/core` visualizer registry ids so the Modes act renders the actual
 * engines; each carries the player-style theme that lights the whole page
 * while it is on stage.
 */

export interface ModeScene {
  id: string;
  /** Display name (the player lists engines by their English name). */
  name: string;
  nameZh: string;
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

export const MODE_SCENES: ModeScene[] = [
  { id: 'liuguang', name: 'Liuguang', nameZh: '流光', descriptionKey: 'welcome.modeLiuguang', theme: theme('Liuguang', '#62f5c4', '#6366f1', '#22d3ee') },
  { id: 'xinxiang', name: 'Xinxiang', nameZh: '心象', descriptionKey: 'welcome.modeXinxiang', theme: theme('Xinxiang', '#a5b4fc', '#22d3ee', '#f0abfc') },
  { id: 'fuguang', name: 'Fuguang', nameZh: '浮光', descriptionKey: 'welcome.modeFuguang', theme: theme('Fuguang', '#c4b5fd', '#62f5c4', '#fda4af') },
  { id: 'yinlang', name: 'Yinlang', nameZh: '音浪', descriptionKey: 'welcome.modeYinlang', theme: theme('Yinlang', '#38bdf8', '#f472b6', '#fde68a') },
  { id: 'xingchen', name: 'Xingchen', nameZh: '星辰', descriptionKey: 'welcome.modeXingchen', theme: theme('Xingchen', '#fde68a', '#818cf8', '#62f5c4') },
  { id: 'shengtai', name: 'Shengtai', nameZh: '生態', descriptionKey: 'welcome.modeShengtai', theme: theme('Shengtai', '#86efac', '#2dd4bf', '#fbbf24') },
  { id: 'moli', name: 'Moli', nameZh: '魔力', descriptionKey: 'welcome.modeMoli', theme: theme('Moli', '#f0abfc', '#62f5c4', '#60a5fa') },
];

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
