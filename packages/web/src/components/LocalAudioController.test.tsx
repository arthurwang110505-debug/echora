// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import LocalAudioController from './LocalAudioController';
import { usePlayerStore } from '../store/playerStore';
import type { MediaCommand } from '../playback/mediaCommand';
import type { Song } from '@echora/core';

// jsdom ships no Web Audio, so the tests install a minimal fake. Without it every
// attach would degrade and the CORS/routing assertions below could not be observed.
const graph = { claims: 0, closes: 0, resumes: 0, refuseNextClaim: false };

class FakeAnalyser {
  fftSize = 0;
  smoothingTimeConstant = 0;
  frequencyBinCount = 1024;
  connect() { /* connected to destination by the module */ }
  disconnect() { /* no-op */ }
  getByteFrequencyData(target: Uint8Array<ArrayBuffer>) { target.fill(0); }
}

class FakeAudioContext {
  state = 'running';
  sampleRate = 48_000;
  destination = {};
  createAnalyser() { return new FakeAnalyser(); }
  createMediaElementSource() {
    graph.claims += 1;
    if (graph.refuseNextClaim) {
      graph.refuseNextClaim = false;
      throw new Error('HTMLMediaElement already connected previously to a different MediaElementSourceNode');
    }
    return { connect() { /* no-op */ }, disconnect() { /* no-op */ } };
  }
  async resume() { graph.resumes += 1; }
  async close() { graph.closes += 1; this.state = 'closed'; }
}

const makeSong = (audioUrl: string): Song => ({
  id: `song-${audioUrl.length}-${audioUrl.slice(-6)}`,
  title: 'Routing probe',
  artists: [{ id: 'artist', name: 'Echora' }],
  durationMs: 60_000,
  source: 'local',
  audioUrl,
} as unknown as Song);

let root: Root | null = null;

/**
 * Everything is mounted inside StrictMode on purpose: the double effect invocation is the
 * exact condition that used to strand the <audio> element on a closed AudioContext.
 */
const mount = async () => {
  const host = document.createElement('div');
  document.body.append(host);
  await act(async () => {
    root = createRoot(host);
    root.render(<StrictMode><LocalAudioController /></StrictMode>);
  });
};

const flush = async () => {
  await act(async () => {
    await new Promise(resolve => window.setTimeout(resolve, 0));
  });
};

const drive = async (url: string) => {
  const command: MediaCommand = { seq: (usePlayerStore.getState().localCommand.seq || 0) + 1, action: 'load', url, autoplay: false };
  await act(async () => {
    usePlayerStore.setState({ currentSong: makeSong(url), localCommand: command, isPlaying: false, localError: null });
  });
  await flush();
};

const audioElement = () => document.querySelector('audio') as HTMLAudioElement;
const jsdelivrDemo = 'https://cdn.jsdelivr.net/gh/some/owner@main/demo.mp3';

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  vi.stubGlobal('AudioContext', FakeAudioContext);
  Object.defineProperty(window, 'AudioContext', { value: FakeAudioContext, configurable: true });
  graph.claims = 0;
  graph.closes = 0;
  graph.resumes = 0;
  usePlayerStore.setState({ currentSong: null, localCommand: { seq: 0, action: 'idle' }, localSpectrum: null, localError: null });
});

afterEach(() => {
  act(() => { root?.unmount(); });
  root = null;
  document.body.innerHTML = '';
  graph.refuseNextClaim = false;
  vi.unstubAllGlobals();
});

describe('LocalAudioController routing', () => {
  it('opts a CORS-capable CDN into crossorigin before the src is assigned', async () => {
    await mount();
    await drive(jsdelivrDemo);

    const audio = audioElement();
    expect(audio.getAttribute('crossorigin')).toBe('anonymous');
    expect(audio.getAttribute('src')).toContain('cdn.jsdelivr.net/gh/some/owner@main/demo.mp3');
    expect(usePlayerStore.getState().localSpectrum?.mode).toBe('analyser');
    expect(graph.claims).toBe(1);
  });

  it('leaves same-origin and blob sources on the attribute-free path', async () => {
    await mount();
    await drive('/audio/own-song.mp3');
    expect(audioElement().getAttribute('crossorigin')).toBeNull();

    await drive('blob:https://echora.test/7eb0a9');
    expect(audioElement().getAttribute('crossorigin')).toBeNull();
    expect(audioElement().getAttribute('src')).toBe('blob:https://echora.test/7eb0a9');
  });

  it('keeps audio audible when an unknown host refuses CORS', async () => {
    await mount();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('CORS blocked'); }));

    await drive('https://random-host.test/song.mp3');

    const audio = audioElement();
    expect(audio.getAttribute('crossorigin'), 'a refused probe must not force CORS mode').toBeNull();
    expect(audio.getAttribute('src'), 'the track must still load so sound is never lost').toContain('random-host.test/song.mp3');
    expect(usePlayerStore.getState().localSpectrum).toMatchObject({ mode: 'direct', reason: 'cors-probe-failed' });
  });

  it('upgrades an unknown host once the probe succeeds', async () => {
    await mount();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));

    await drive('https://friendly-host.test/song.mp3');
    expect(audioElement().getAttribute('crossorigin')).toBe('anonymous');
  });

  it('retries a failed CORS load once, then stays on native output', async () => {
    await mount();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
    await drive('https://retry-host.test/flaky.mp3');
    expect(audioElement().getAttribute('crossorigin')).toBe('anonymous');

    const audio = audioElement();
    await act(async () => { audio.dispatchEvent(new Event('error')); });
    await flush();

    expect(audio.getAttribute('crossorigin'), 'the retry must drop CORS so playback survives').toBeNull();
    expect(usePlayerStore.getState().localSpectrum).toMatchObject({ mode: 'direct' });

    // A second error on the same URL is surfaced instead of retried forever.
    await act(async () => { audio.dispatchEvent(new Event('error')); });
    expect(usePlayerStore.getState().playbackState).toBe('error');
  });

  it('survives a StrictMode remount without re-claiming the element or closing the graph', async () => {
    await mount();
    await drive(jsdelivrDemo);
    expect(graph.claims).toBe(1);

    // A route change that unmounts and remounts the provider must not re-claim the
    // element (InvalidStateError) nor close the context - both used to mean "no sound".
    act(() => { root?.unmount(); });
    graph.claims = 0;
    await mount();
    await drive(jsdelivrDemo);

    expect(graph.claims).toBeLessThanOrEqual(1);
    expect(graph.closes).toBe(0);
    expect(audioElement().getAttribute('crossorigin')).toBe('anonymous');
  });

  it('drops the CORS opt-in when the element cannot be claimed at all', async () => {
    await mount();
    graph.refuseNextClaim = true;
    await drive(jsdelivrDemo);

    const audio = audioElement();
    expect(usePlayerStore.getState().localSpectrum?.mode).toBe('direct');
    expect(audio.getAttribute('crossorigin'), 'nothing is measured, so CORS mode is pure risk').toBeNull();
    expect(audio.getAttribute('src'), 'playback must still work').toContain('cdn.jsdelivr.net');
  });
});
