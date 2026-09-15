import { describe, expect, it } from 'vitest';
import { isYouTubeVideo, shouldUseYouTubeMusicStage } from './youtubePlayback';

describe('YouTube playback mode', () => {
  it('keeps explicitly music-classified YouTube items in the lyrics Stage', () => {
    const song = { source: 'ytmusic' as const, youtubeVideoKind: 'music' as const };
    expect(isYouTubeVideo(song)).toBe(false);
    expect(shouldUseYouTubeMusicStage(song)).toBe(true);
  });

  it('routes ordinary and unknown YouTube items to the direct video player', () => {
    expect(isYouTubeVideo({ source: 'ytmusic', youtubeVideoKind: 'video' })).toBe(true);
    expect(isYouTubeVideo({ source: 'ytmusic', youtubeVideoKind: 'unknown' })).toBe(true);
    expect(isYouTubeVideo({ source: 'ytmusic' })).toBe(true);
    expect(shouldUseYouTubeMusicStage({ source: 'ytmusic', youtubeVideoKind: 'video' })).toBe(false);
  });

  it('does not change non-YouTube playback', () => {
    expect(isYouTubeVideo({ source: 'local', youtubeVideoKind: 'unknown' })).toBe(false);
    expect(shouldUseYouTubeMusicStage({ source: 'local' })).toBe(true);
  });
});
