import { describe, expect, it } from 'vitest';
import { processLrcLibTrack } from './lrclib';

describe('LRCLib lyric availability', () => {
  it('marks instrumental tracks without fabricating a lyric line', () => {
    const result = processLrcLibTrack({
      id: 1,
      name: 'Instrumental',
      artistName: 'Echora',
      duration: 180,
      instrumental: true,
    });

    expect(result).toMatchObject({ availability: 'instrumental', lines: [] });
  });

  it('marks tracks without lyric text as unavailable', () => {
    const result = processLrcLibTrack({
      id: 2,
      name: 'No lyrics',
      artistName: 'Echora',
      duration: 180,
      instrumental: false,
    });

    expect(result).toMatchObject({ availability: 'unavailable', lines: [] });
  });
});
