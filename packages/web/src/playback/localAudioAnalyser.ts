import {
  frequencyBinsToAudioBands,
  isSilentSpectrum,
  SILENT_AUDIO_BANDS,
  type AudioBandLevels,
} from './audioBands';

// src/playback/localAudioAnalyser.ts
//
// One AudioContext, one analyser, created lazily and never torn down.
//
// Two footguns are encoded in this file's shape:
//  1. `createMediaElementSource()` claims an HTMLMediaElement for the whole document
//     lifetime. Once claimed, the element is audible *only* through the graph, so
//     disconnecting the chain or closing the context leaves that element permanently
//     silent - and a second `createMediaElementSource()` on it throws InvalidStateError.
//     React StrictMode double-mounts effects, so a "close it on unmount" design is
//     silent in every dev session even for perfectly readable files.
//  2. A tainted (cross-origin, non-CORS) media element must output silence, so the
//     caller has to decide routing before `audio.src` is set - see ./audioRouting.ts.

export const LOCAL_ANALYSER_FFT_SIZE = 2048;

type AudioContextCtor = typeof AudioContext;

export type LocalAnalyserAttachReason = 'routed' | 'reused' | 'unsupported' | 'claimed' | 'graph-failed';
export type LocalAnalyserAttachResult = { routed: boolean; reason: LocalAnalyserAttachReason };

let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let frequencyData: Uint8Array<ArrayBuffer> | null = null;
let sampling = false;
let attachedAudio: HTMLAudioElement | null = null;
let silentFrames = 0;
const routedElements = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();

const getAudioContextCtor = (): AudioContextCtor | null => {
  if (typeof window === 'undefined') return null;
  const host = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return host.AudioContext || host.webkitAudioContext || null;
};

const ensureGraph = (): boolean => {
  const Context = getAudioContextCtor();
  if (!Context) return false;
  try {
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new Context();
      analyser = null;
      frequencyData = null;
    }
    if (!analyser) {
      analyser = audioContext.createAnalyser();
      analyser.fftSize = LOCAL_ANALYSER_FFT_SIZE;
      analyser.smoothingTimeConstant = 0.72;
      analyser.connect(audioContext.destination);
    }
    if (!frequencyData) frequencyData = new Uint8Array(analyser.frequencyBinCount);
    return true;
  } catch {
    // A missing/blocked Web Audio implementation must degrade to the synthetic pulse,
    // never to a muted <audio> element.
    return false;
  }
};

/**
 * Idempotent by design: repeated calls (StrictMode, route remounts, track changes)
 * reuse the cached source node instead of claiming the element a second time.
 */
export const attachLocalAudioAnalyser = (audio: HTMLAudioElement): LocalAnalyserAttachResult => {
  if (!ensureGraph() || !audioContext || !analyser) return { routed: false, reason: 'unsupported' };

  const cached = routedElements.get(audio);
  if (!cached) {
    try {
      const source = audioContext.createMediaElementSource(audio);
      source.connect(analyser);
      routedElements.set(audio, source);
    } catch {
      // Somebody else already owns this element; leave it playing natively.
      return { routed: false, reason: 'claimed' };
    }
  } else {
    // `connect()` to the same input is idempotent, and never disconnecting here is
    // what keeps a remount from blanking the element for one render quantum.
    try {
      cached.connect(analyser);
    } catch {
      // The cached connection is already valid; nothing to undo.
    }
  }

  attachedAudio = audio;
  sampling = true;
  silentFrames = 0;
  void resumeLocalAudioAnalyser();
  return { routed: true, reason: cached ? 'reused' : 'routed' };
};

/**
 * Stops sampling only. The graph, the context and the element claim stay alive on
 * purpose - that is what makes remounting the player safe again.
 */
export const detachLocalAudioAnalyser = () => {
  sampling = false;
  attachedAudio = null;
  silentFrames = 0;
};

/** True when the element's audible output currently flows through our graph. */
export const isLocalAudioRouted = (audio: HTMLAudioElement) => routedElements.has(audio);

export const resumeLocalAudioAnalyser = async (): Promise<boolean> => {
  const context = audioContext;
  if (!context) return false;
  // Covers 'suspended' (autoplay policy) and iOS' 'interrupted' (calls, Siri, mute switch).
  if (context.state === 'running') return true;
  try {
    await context.resume();
  } catch {
    // Autoplay policies can reject until the next gesture; playback itself still works.
    return false;
  }
  // Widened on purpose: the early return above narrows `state` for the rest of the
  // function, but `resume()` is asynchronous and the real state can still land on running.
  return (context.state as AudioContextState) === 'running';
};

export const getLocalAnalyserHealth = () => ({
  active: sampling,
  contextState: audioContext?.state ?? 'none',
  silentFrames,
  attached: Boolean(attachedAudio),
});

/** True when the routed element actually holds a local source right now. */
const hasLocalSource = (element: HTMLAudioElement | null): boolean => {
  if (!element) return false;
  const attribute = typeof element.getAttribute === 'function' ? element.getAttribute('src') : null;
  return Boolean(element.currentSrc || attribute || element.src);
};

/**
 * Live FFT bands for the local HTML audio element.
 * Returns silent bands when paused, real bands when the analyser has energy,
 * and null when FFT is unavailable (no graph, or CORS-tainted zeros) so callers
 * can fall back to a time-based pulse instead of freezing the stage.
 */
export const sampleLocalAudioBands = (isPlaying: boolean): AudioBandLevels | null => {
  if (!sampling || !analyser || !audioContext || !frequencyData) return null;
  // No source on the element means the app is playing something else entirely (a YouTube
  // iframe, Spotify). Reporting "silent" here would pin the stage near zero energy, so we
  // report "unavailable" instead and let the caller use its pulse fallback.
  if (!hasLocalSource(attachedAudio)) return null;
  if (!isPlaying || attachedAudio?.paused || attachedAudio?.ended) {
    silentFrames = 0;
    return SILENT_AUDIO_BANDS;
  }

  analyser.getByteFrequencyData(frequencyData);
  if (isSilentSpectrum(frequencyData)) {
    silentFrames += 1;
    return null;
  }
  silentFrames = 0;
  return frequencyBinsToAudioBands(frequencyData, audioContext.sampleRate);
};
