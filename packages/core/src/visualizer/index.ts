// Visualizer definitions and registry
export type {
  VisualizerDefinition,
  VisualizerContext,
  VisualizerParams,
  LyricLine,
  LyricWord,
  ThemeConfig,
  ParamSchema,
  VisualizerId,
} from './types';

export {
  liuguangDefinition,
  xinxiangDefinition,
  visualizerRegistry,
  getVisualizer,
  getAllVisualizers,
} from './definitions';
