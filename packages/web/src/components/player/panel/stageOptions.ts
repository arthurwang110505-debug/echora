// src/components/player/panel/stageOptions.ts
// Single source of truth for the stage pickers shared by the immersive chrome and the
// 播放控制 tab of the side panel: which lyrics animation modes and which background
// effects Echora can offer, in the order they should be listed.

export type StageOption = { value: string; label: string };

export const VISUALIZER_OPTIONS: readonly StageOption[] = [
  { value: 'classic', label: 'Classic' },
  { value: 'cadenza', label: 'Cadenza' },
  { value: 'partita', label: 'Partita' },
  { value: 'fume', label: 'Fume' },
  { value: 'monet', label: 'Monet' },
  { value: 'cappella', label: 'Cappella' },
  { value: 'pendolo', label: 'Pendolo' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'claddagh', label: 'Claddagh' },
  { value: 'diorama', label: 'Diorama' },
  { value: 'tilt', label: 'Tilt' },
] as const;

export const BACKGROUND_OPTIONS: readonly StageOption[] = [
  { value: 'latent', label: 'Latent' },
  { value: 'common', label: 'Geometric' },
  { value: 'fluid', label: 'Fluid' },
  { value: 'monet', label: 'Monet' },
  { value: 'nomand', label: 'Nomand' },
  { value: 'sora', label: 'Sora' },
  { value: 'url', label: 'Image URL' },
] as const;

/** Steps through a closed option list, wrapping at both ends. */
export function stepOption(options: readonly StageOption[], current: string, direction: -1 | 1): string {
  if (options.length === 0) return current;
  const index = options.findIndex(option => option.value === current);
  const from = index < 0 ? 0 : index;
  const next = (from + direction + options.length) % options.length;
  return options[next].value;
}
