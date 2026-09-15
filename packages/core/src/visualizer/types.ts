// Visualizer types
import type { LyricLine, ThemeConfig, ParamSchema } from '../types';
export type { LyricLine, LyricWord, ThemeConfig, ParamSchema, VisualizerId } from '../types';

export interface VisualizerParams {
  fontSize: number;
  fontFamily: string;
  opacity: number;
  textAlign: 'center' | 'left' | 'right';
  letterSpacing: number;
  lineHeight: number;
  bgColor: string;
  bgOpacity: number;
  showGeometricBg: boolean;
  geometricOpacity: number;
  glowIntensity: number;
  shadowEnabled: boolean;
  shadowBlur: number;
  shadowColor: string;
  animSpeed: number;
  animDirection: 'normal' | 'reverse' | 'bounce';
  customStyle?: Record<string, unknown>;
}

export interface VisualizerDefinition {
  id: string;
  name: string;
  nameZh: string;
  description: string;
  descriptionZh: string;
  defaultParams: VisualizerParams;
  paramsSchema: ParamSchema[];
  render: (ctx: VisualizerContext, params: VisualizerParams) => void;
  cleanup?: (ctx: VisualizerContext) => void;
}

export interface VisualizerContext {
  canvas?: any;
  animationId?: number;
  startTime?: number;
  currentTime?: number;
  width: number;
  height: number;
  dpr: number;
  lines: LyricLine[];
  currentIndex: number;
  progress: number;
  theme: ThemeConfig;
}
