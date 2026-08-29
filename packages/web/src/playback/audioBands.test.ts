import { describe, expect, it } from 'vitest';
import {
  frequencyBinsToAudioBands,
  isSilentSpectrum,
  pickAutoVisualizerMode,
  placeholderAudioBands,
  resolveStageAudioBands,
  SILENT_AUDIO_BANDS,
  visualizerEnergy,
} from './audioBands';

const binsWithEnergy = (peakBin: number, value = 220) => {
  const bins = new Uint8Array(1024);
  bins[peakBin] = value;
  bins[peakBin + 1] = value;
  return bins;
};

describe('audioBands', () => {
  it('maps low-frequency energy to bass and high-frequency energy to treble', () => {
    const bass = frequencyBinsToAudioBands(binsWithEnergy(2), 44100);
    const treble = frequencyBinsToAudioBands(binsWithEnergy(400), 44100);

    expect(bass.bass).toBeGreaterThan(0.3);
    expect(bass.treble).toBeLessThan(0.05);
    expect(treble.treble).toBeGreaterThan(0.3);
    expect(treble.bass).toBeLessThan(0.05);
  });

  it('treats empty or near-zero FFT data as silent so CORS-tainted media can fall back', () => {
    expect(isSilentSpectrum(new Uint8Array(1024))).toBe(true);
    expect(isSilentSpectrum(Uint8Array.from([0, 1, 2, 0]))).toBe(true);
    expect(isSilentSpectrum(binsWithEnergy(8, 40))).toBe(false);
  });

  it('keeps the placeholder pulse quiet while paused', () => {
    const paused = placeholderAudioBands(12, false);
    const playing = placeholderAudioBands(12, true);

    expect(paused).toEqual(SILENT_AUDIO_BANDS);
    expect(playing.bass).toBeGreaterThan(paused.bass);
  });

  it('prefers live bands while playing and always goes quiet when paused', () => {
    const live = { bass: 0.9, lowMid: 0.4, mid: 0.3, vocal: 0.5, treble: 0.2 };
    expect(resolveStageAudioBands({ isPlaying: true, displayedTime: 8, liveBands: live }).bass).toBe(0.9);
    expect(resolveStageAudioBands({ isPlaying: false, displayedTime: 8, liveBands: live })).toEqual(SILENT_AUDIO_BANDS);
    expect(resolveStageAudioBands({ isPlaying: true, displayedTime: 8, liveBands: null }).bass).toBeGreaterThan(0.2);
  });

  it('picks a louder visualizer mode from real energy instead of a sine wave', () => {
    expect(pickAutoVisualizerMode(visualizerEnergy({ bass: 0.9, lowMid: 0.7, mid: 0.6, vocal: 0.5, treble: 0.4 }))).toBe('claddagh');
    expect(pickAutoVisualizerMode(0.5)).toBe('cadenza');
    expect(pickAutoVisualizerMode(0.2)).toBe('classic');
  });
});
