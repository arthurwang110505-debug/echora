import { afterEach, describe, expect, it } from 'vitest';
import { detachLocalAudioAnalyser, sampleLocalAudioBands } from './localAudioAnalyser';

describe('localAudioAnalyser', () => {
  afterEach(() => {
    detachLocalAudioAnalyser();
  });

  it('returns null when no audio graph is attached so the stage can fall back', () => {
    expect(sampleLocalAudioBands(true)).toBeNull();
    expect(sampleLocalAudioBands(false)).toBeNull();
  });
});
