import type { Song } from '@echora/core';

/** Ordinary or unknown YouTube items stay in the direct-video player. */
export const isYouTubeVideo = (song: Pick<Song, 'source' | 'youtubeVideoKind'> | null | undefined): boolean => (
  song?.source === 'ytmusic' && song.youtubeVideoKind !== 'music'
);

/** Only explicitly music-classified YouTube items receive lyrics and Echora music Stage. */
export const shouldUseYouTubeMusicStage = (song: Pick<Song, 'source' | 'youtubeVideoKind'> | null | undefined): boolean => (
  song?.source !== 'ytmusic' || song.youtubeVideoKind === 'music'
);
