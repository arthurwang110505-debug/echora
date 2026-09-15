export type AudioBandLevels = {
  bass: number;
  lowMid: number;
  mid: number;
  vocal: number;
  treble: number;
};

export const SILENT_AUDIO_BANDS: AudioBandLevels = {
  bass: 0.02,
  lowMid: 0.015,
  mid: 0.015,
  vocal: 0.015,
  treble: 0.01,
};

const BAND_RANGES_HZ = {
  bass: [20, 150],
  lowMid: [150, 400],
  mid: [400, 1200],
  vocal: [1000, 3500],
  treble: [3500, 16000],
} as const;

const hzToBin = (hz: number, sampleRate: number, binCount: number) => {
  const nyquist = sampleRate / 2;
  if (!Number.isFinite(hz) || !Number.isFinite(sampleRate) || sampleRate <= 0 || binCount <= 0) return 0;
  return Math.max(0, Math.min(binCount - 1, Math.round((hz / nyquist) * binCount)));
};

const averageBinRange = (bins: ArrayLike<number>, startHz: number, endHz: number, sampleRate: number) => {
  const start = hzToBin(startHz, sampleRate, bins.length);
  const end = Math.max(start + 1, hzToBin(endHz, sampleRate, bins.length));
  let sum = 0;
  let peak = 0;
  for (let index = start; index < end; index += 1) {
    const value = bins[index] || 0;
    sum += value;
    if (value > peak) peak = value;
  }
  const average = sum / Math.max(1, end - start) / 255;
  const mixed = average * 0.4 + (peak / 255) * 0.6;
  return Math.min(1, Math.max(0, mixed ** 0.65));
};

export const isSilentSpectrum = (bins: ArrayLike<number>) => {
  if (!bins.length) return true;
  let peak = 0;
  for (let index = 0; index < bins.length; index += 1) {
    const value = bins[index] || 0;
    if (value > peak) peak = value;
    if (peak >= 8) return false;
  }
  return true;
};

export const frequencyBinsToAudioBands = (
  bins: ArrayLike<number>,
  sampleRate = 44100,
): AudioBandLevels => ({
  bass: averageBinRange(bins, BAND_RANGES_HZ.bass[0], BAND_RANGES_HZ.bass[1], sampleRate),
  lowMid: averageBinRange(bins, BAND_RANGES_HZ.lowMid[0], BAND_RANGES_HZ.lowMid[1], sampleRate),
  mid: averageBinRange(bins, BAND_RANGES_HZ.mid[0], BAND_RANGES_HZ.mid[1], sampleRate),
  vocal: averageBinRange(bins, BAND_RANGES_HZ.vocal[0], BAND_RANGES_HZ.vocal[1], sampleRate),
  treble: averageBinRange(bins, BAND_RANGES_HZ.treble[0], BAND_RANGES_HZ.treble[1], sampleRate),
});

/** Used when FFT is unavailable (YouTube iframe, CORS-tainted media). Paused stays quiet. */
export const placeholderAudioBands = (displayedTime: number, isPlaying: boolean): AudioBandLevels => {
  if (!isPlaying) return SILENT_AUDIO_BANDS;
  const time = Number.isFinite(displayedTime) ? displayedTime : 0;
  return {
    bass: 0.42 + Math.sin(time * 5.2) * 0.16,
    lowMid: 0.34 + Math.sin(time * 3.1 + 1) * 0.12,
    mid: 0.28 + Math.sin(time * 2.2 + 2) * 0.1,
    vocal: 0.38 + Math.sin(time * 4.0 + 0.5) * 0.14,
    treble: 0.24 + Math.sin(time * 7.0 + 2.5) * 0.1,
  };
};

export const resolveStageAudioBands = (options: {
  isPlaying: boolean;
  displayedTime: number;
  liveBands?: AudioBandLevels | null;
  fallbackBands?: AudioBandLevels | null;
}): AudioBandLevels => {
  if (!options.isPlaying) return SILENT_AUDIO_BANDS;
  if (options.liveBands) return options.liveBands;
  if (options.fallbackBands) return options.fallbackBands;
  return placeholderAudioBands(options.displayedTime, true);
};

export const visualizerEnergy = (bands: AudioBandLevels) => (
  bands.bass * 0.5 + bands.mid * 0.3 + bands.vocal * 0.2
);

export const pickAutoVisualizerMode = (energy: number): 'classic' | 'cadenza' | 'claddagh' => {
  if (energy > 0.72) return 'claddagh';
  if (energy > 0.45) return 'cadenza';
  return 'classic';
};
