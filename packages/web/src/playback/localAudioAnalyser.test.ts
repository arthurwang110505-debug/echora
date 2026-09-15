import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type FakeElement = { paused: boolean; ended: boolean; currentSrc: string; src: string };

interface FakeWorld {
  counts: { claim: number; close: number; resume: number };
  spectrum: Uint8Array<ArrayBuffer>;
}

const SILENT_BANDS = { bass: 0.02, lowMid: 0.015, mid: 0.015, vocal: 0.015, treble: 0.01 };

/**
 * The analyser module keeps one graph in module scope, so every case re-imports it to
 * start from a clean slate - the same isolation a fresh page load gives the player.
 */
const loadModule = async (options: {
  initialState?: 'suspended' | 'running' | 'interrupted';
  claimMode?: 'ok' | 'throw-once';
  withAudioContext?: boolean;
} = {}) => {
  vi.resetModules();
  vi.unstubAllGlobals();

  const counts = { claim: 0, close: 0, resume: 0 };
  const spectrum = new Uint8Array(1024);
  let state: AudioContextState = options.initialState ?? 'running';
  const claimMode = options.claimMode ?? 'ok';
  let claimFailuresLeft = claimMode === 'throw-once' ? 1 : 0;

  if (options.withAudioContext !== false) {
    class FakeAnalyser {
      fftSize = 0;
      smoothingTimeConstant = 0;
      frequencyBinCount = 1024;
      connect() { /* connected to destination by the module */ }
      disconnect() { /* no-op */ }
      getByteFrequencyData(target: Uint8Array<ArrayBuffer>) { target.set(spectrum); }
    }
    class FakeAudioContext {
      destination = {};
      sampleRate = 48_000;
      get state() { return state; }
      createAnalyser() { return new FakeAnalyser(); }
      createMediaElementSource() {
        counts.claim += 1;
        if (claimFailuresLeft > 0) {
          claimFailuresLeft -= 1;
          throw new Error('HTMLMediaElement already connected previously');
        }
        return { connect() { /* no-op */ }, disconnect() { /* no-op */ } };
      }
      async resume() { counts.resume += 1; state = 'running'; }
      async close() { counts.close += 1; state = 'closed'; }
    }
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
  } else {
    vi.stubGlobal('window', {});
  }

  const mod = await import('./localAudioAnalyser');
  return { mod, world: { counts, spectrum } satisfies FakeWorld };
};

const makeElement = (overrides: Partial<FakeElement> = {}): HTMLAudioElement => (
  {
    paused: true,
    ended: false,
    // The analyser distinguishes "loaded but paused" from "no local source at all",
    // so the fakes carry one unless a test clears it.
    currentSrc: 'https://cdn.jsdelivr.net/gh/some/owner@main/demo.mp3',
    src: 'https://cdn.jsdelivr.net/gh/some/owner@main/demo.mp3',
    ...overrides,
  } as unknown as HTMLAudioElement
);

describe('localAudioAnalyser', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when no audio graph is attached so the stage can fall back', async () => {
    const { mod } = await loadModule();
    expect(mod.sampleLocalAudioBands(true)).toBeNull();
    expect(mod.sampleLocalAudioBands(false)).toBeNull();
  });

  it('claims an element exactly once, so a StrictMode remount cannot strand it', async () => {
    const { mod, world } = await loadModule({ initialState: 'suspended' });
    const audio = makeElement();

    expect(mod.attachLocalAudioAnalyser(audio)).toMatchObject({ routed: true, reason: 'routed' });
    // StrictMode re-runs the mount effect, and route changes re-attach the controller.
    // A second createMediaElementSource() on the same element used to throw, after which
    // the old code closed the context - leaving that element silent for the whole session.
    expect(mod.attachLocalAudioAnalyser(audio)).toMatchObject({ routed: true, reason: 'reused' });
    mod.detachLocalAudioAnalyser();
    expect(mod.attachLocalAudioAnalyser(audio)).toMatchObject({ routed: true, reason: 'reused' });

    expect(world.counts.claim).toBe(1);
    expect(world.counts.close).toBe(0);
    expect(mod.isLocalAudioRouted(audio)).toBe(true);
  });

  it('resumes the context on attach for both autoplay suspension and iOS interruptions', async () => {
    for (const initialState of ['suspended', 'interrupted'] as const) {
      const { mod, world } = await loadModule({ initialState });
      mod.attachLocalAudioAnalyser(makeElement());
      expect(world.counts.resume).toBeGreaterThanOrEqual(1);
      await expect(mod.resumeLocalAudioAnalyser()).resolves.toBe(true);
      expect(mod.getLocalAnalyserHealth().contextState).toBe('running');
      mod.detachLocalAudioAnalyser();
    }
  });

  it('never claims a second element twice and keeps earlier elements usable', async () => {
    const { mod, world } = await loadModule();
    const first = makeElement();
    const second = makeElement();

    expect(mod.attachLocalAudioAnalyser(first).reason).toBe('routed');
    expect(mod.attachLocalAudioAnalyser(second).reason).toBe('routed');
    expect(world.counts.claim).toBe(2);
    expect(world.counts.close).toBe(0);
    expect(mod.isLocalAudioRouted(first)).toBe(true);
    expect(mod.isLocalAudioRouted(second)).toBe(true);
  });

  it('degrades to native output when Web Audio is unavailable instead of muting', async () => {
    const { mod } = await loadModule({ withAudioContext: false });
    const audio = makeElement();
    expect(mod.attachLocalAudioAnalyser(audio)).toEqual({ routed: false, reason: 'unsupported' });
    expect(mod.sampleLocalAudioBands(true)).toBeNull();
    expect(mod.isLocalAudioRouted(audio)).toBe(false);
  });

  it('degrades when the element is already owned by another graph', async () => {
    const { mod, world } = await loadModule({ claimMode: 'throw-once' });
    const audio = makeElement();
    expect(mod.attachLocalAudioAnalyser(audio)).toEqual({ routed: false, reason: 'claimed' });
    expect(mod.isLocalAudioRouted(audio)).toBe(false);
    expect(mod.sampleLocalAudioBands(true)).toBeNull();
    // A rejected claim must not tear down the shared graph: the next element still routes,
    // and the refused element keeps its native output instead of going silent.
    const other = makeElement();
    expect(mod.attachLocalAudioAnalyser(other).routed).toBe(true);
    expect(world.counts.close).toBe(0);
  });

  it('samples real bands only while the routed element has frames', async () => {
    const { mod, world } = await loadModule();
    const element: FakeElement = {
      paused: false,
      ended: false,
      currentSrc: 'https://cdn.jsdelivr.net/gh/some/owner@main/demo.mp3',
      src: 'https://cdn.jsdelivr.net/gh/some/owner@main/demo.mp3',
    };
    const audio = element as unknown as HTMLAudioElement;
    mod.attachLocalAudioAnalyser(audio);

    // All-zero FFT (CORS-tainted or silent file) must report "unavailable", not frozen bars.
    expect(mod.sampleLocalAudioBands(true)).toBeNull();
    expect(mod.sampleLocalAudioBands(false)).toEqual(SILENT_BANDS);

    world.spectrum.fill(200);
    const live = mod.sampleLocalAudioBands(true);
    expect(live).not.toBeNull();
    expect(live!.bass).toBeGreaterThan(0.2);

    element.paused = true;
    expect(mod.sampleLocalAudioBands(true)).toEqual(SILENT_BANDS);
  });

  it('stops sampling on detach while keeping the element routed', async () => {
    const { mod, world } = await loadModule();
    const audio = makeElement({ paused: false });
    mod.attachLocalAudioAnalyser(audio);
    world.spectrum.fill(120);
    expect(mod.sampleLocalAudioBands(true)).not.toBeNull();

    mod.detachLocalAudioAnalyser();
    expect(mod.sampleLocalAudioBands(true)).toBeNull();
    expect(mod.getLocalAnalyserHealth()).toMatchObject({ active: false, silentFrames: 0 });
    expect(mod.isLocalAudioRouted(audio)).toBe(true);
    expect(world.counts.close).toBe(0);
  });

  it('reports unavailable while another service owns playback', async () => {
    const { mod } = await loadModule();
    // A YouTube/Spotify track leaves the local element without a source; returning the
    // silent bands there would flatten the stage instead of letting it use its pulse.
    const sourceUrl = 'https://cdn.jsdelivr.net/gh/some/owner@main/demo.mp3';
    const element: FakeElement = { paused: true, ended: false, currentSrc: '', src: '' };
    const audio = element as unknown as HTMLAudioElement;
    mod.attachLocalAudioAnalyser(audio);
    expect(mod.sampleLocalAudioBands(true)).toBeNull();

    // Once the local source returns, "paused" is again a real answer.
    element.currentSrc = sourceUrl;
    element.src = sourceUrl;
    expect(mod.sampleLocalAudioBands(true)).toEqual(SILENT_BANDS);
  });

  it('counts consecutive silent frames so a tainted graph stays diagnosable', async () => {
    const { mod } = await loadModule();
    const audio = makeElement({ paused: false });
    mod.attachLocalAudioAnalyser(audio);
    for (let index = 0; index < 5; index += 1) expect(mod.sampleLocalAudioBands(true)).toBeNull();
    expect(mod.getLocalAnalyserHealth()).toMatchObject({ active: true, silentFrames: 5, attached: true });
  });
});
