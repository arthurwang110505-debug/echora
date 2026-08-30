export type MediaCommandAction = 'idle' | 'load' | 'play' | 'pause' | 'seek';

export type MediaCommand = {
  seq: number;
  action: MediaCommandAction;
  url?: string;
  time?: number;
  autoplay?: boolean;
};

export const IDLE_MEDIA_COMMAND: MediaCommand = { seq: 0, action: 'idle' };

export const nextMediaCommand = (
  previous: MediaCommand | undefined,
  patch: Omit<MediaCommand, 'seq'>,
): MediaCommand => ({
  ...patch,
  seq: (previous?.seq || 0) + 1,
});
