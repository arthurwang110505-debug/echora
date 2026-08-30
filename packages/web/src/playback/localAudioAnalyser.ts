import {
  frequencyBinsToAudioBands,
  isSilentSpectrum,
  SILENT_AUDIO_BANDS,
  type AudioBandLevels,
} from './audioBands';

export const LOCAL_ANALYSER_FFT_SIZE = 2048;

type AudioContextCtor = typeof AudioContext;

let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let source: MediaElementAudioSourceNode | null = null;
let attachedAudio: HTMLAudioElement | null = null;
let frequencyData: Uint8Array<ArrayBuffer> | null = null;

const getAudioContextCtor = (): AudioContextCtor | null => {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext || null;
};

export const attachLocalAudioAnalyser = (audio: HTMLAudioElement) => {
  if (attachedAudio === audio && analyser) return;
  detachLocalAudioAnalyser();

  const Context = getAudioContextCtor();
  if (!Context) return;

  try {
    audioContext = new Context();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = LOCAL_ANALYSER_FFT_SIZE;
    analyser.smoothingTimeConstant = 0.72;
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    source = audioContext.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    attachedAudio = audio;
  } catch {
    detachLocalAudioAnalyser();
  }
};

export const detachLocalAudioAnalyser = () => {
  try { source?.disconnect(); } catch { /* already disconnected */ }
  try { analyser?.disconnect(); } catch { /* already disconnected */ }
  if (audioContext && audioContext.state !== 'closed') {
    void audioContext.close().catch(() => undefined);
  }
  source = null;
  analyser = null;
  audioContext = null;
  attachedAudio = null;
  frequencyData = null;
};

export const resumeLocalAudioAnalyser = async () => {
  if (audioContext?.state === 'suspended') {
    try { await audioContext.resume(); } catch { /* autoplay policies can reject until the next gesture */ }
  }
};

/**
 * Live FFT bands for the local HTML audio element.
 * Returns silent bands when paused, real bands when the analyser has energy,
 * and null when FFT is unavailable (no graph, or CORS-tainted zeros) so callers
 * can fall back to a time-based pulse instead of freezing the stage.
 */
export const sampleLocalAudioBands = (isPlaying: boolean): AudioBandLevels | null => {
  if (!analyser || !audioContext || !frequencyData) return null;
  if (!isPlaying || attachedAudio?.paused || attachedAudio?.ended) return SILENT_AUDIO_BANDS;

  analyser.getByteFrequencyData(frequencyData);
  if (isSilentSpectrum(frequencyData)) return null;
  return frequencyBinsToAudioBands(frequencyData, audioContext.sampleRate);
};
