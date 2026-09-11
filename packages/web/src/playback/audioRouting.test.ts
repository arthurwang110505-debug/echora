import { describe, expect, it } from 'vitest';
import {
  CORS_ENABLED_AUDIO_HOSTS,
  createCorsProbeCache,
  probeAudioCorsSupport,
  resolveAudioRouting,
  resolveAudioRoutingForPlayback,
  withProbeResult,
} from './audioRouting';

const PAGE = 'https://echora.example.app';

describe('audioRouting.resolveAudioRouting', () => {
  it('routes same-origin and local sources through the analyser without CORS', () => {
    expect(resolveAudioRouting('/audio/demo.mp3', PAGE)).toMatchObject({
      mode: 'analyser',
      crossOrigin: null,
      reason: 'same-origin',
      requiresProbe: false,
    });
    expect(resolveAudioRouting(PAGE + '/a.mp3', PAGE).reason).toBe('same-origin');
    expect(resolveAudioRouting('blob:https://echora.example.app/abc', PAGE)).toMatchObject({
      mode: 'analyser',
      reason: 'local-source',
    });
    expect(resolveAudioRouting('data:audio/wav;base64,AAAA', PAGE).mode).toBe('analyser');
  });

  it('routes allowlisted CDNs in CORS mode so the analyser is allowed to read them', () => {
    const decision = resolveAudioRouting('https://cdn.jsdelivr.net/gh/user/repo@main/song.mp3', PAGE);
    expect(decision).toMatchObject({ mode: 'analyser', crossOrigin: 'anonymous', reason: 'cors-allowlist' });
    expect(CORS_ENABLED_AUDIO_HOSTS).toContain('cdn.jsdelivr.net');
  });

  it('asks for a probe on unknown cross-origin hosts instead of assuming silence is fine', () => {
    const decision = resolveAudioRouting('https://some-host.test/song.mp3', PAGE);
    expect(decision.mode).toBe('analyser');
    expect(decision.requiresProbe).toBe(true);
  });

  it('downgrades to native output when the probe fails - audio must never depend on the graph', () => {
    expect(withProbeResult(resolveAudioRouting('https://some-host.test/song.mp3', PAGE), false)).toEqual({
      mode: 'direct',
      crossOrigin: null,
      reason: 'cors-probe-failed',
      requiresProbe: false,
    });
    expect(withProbeResult(resolveAudioRouting('https://some-host.test/song.mp3', PAGE), true).reason).toBe('cors-probe-ok');
  });

  it('never routes dangerous schemes and never trusts garbage with a crossOrigin flag', () => {
    for (const bad of ['', '   ', undefined, null]) {
      const decision = resolveAudioRouting(bad as string, PAGE);
      expect(decision.mode).toBe('direct');
      expect(decision.crossOrigin).toBeNull();
      expect(decision.requiresProbe).toBe(false);
    }
    for (const dangerous of ['javascript:alert(1)', 'file:///C:/song.mp3', 'chrome://x']) {
      expect(resolveAudioRouting(dangerous, PAGE).mode, dangerous).toBe('direct');
    }
    // A malformed value resolves against the page, so it stays same-origin: routing it is
    // safe (same-origin can never be CORS-tainted) and the element simply fails to load.
    expect(resolveAudioRouting('not a url', PAGE)).toMatchObject({ mode: 'analyser', crossOrigin: null, reason: 'same-origin' });
    // Without a usable page origin, nothing is trusted enough to be routed.
    expect(resolveAudioRouting('/a.mp3', 'not-an-origin').mode).toBe('direct');
  });

  it('resolves the probe through the injected implementation', async () => {
    const probe = async () => false;
    const decision = await resolveAudioRoutingForPlayback('https://some-host.test/song.mp3', { pageOrigin: PAGE, probe });
    expect(decision.mode).toBe('direct');

    const noProbeNeeded = await resolveAudioRoutingForPlayback(PAGE + '/song.mp3', {
      pageOrigin: PAGE,
      probe: async () => { throw new Error('must not probe same-origin audio'); },
    });
    expect(noProbeNeeded.mode).toBe('analyser');
  });

  it('probes once per origin and survives a rejecting fetch', async () => {
    let calls = 0;
    const probe = async () => { calls += 1; return true; };
    const cached = createCorsProbeCache(probe);
    await cached('https://some-host.test/a.mp3', PAGE);
    await cached('https://some-host.test/b.mp3', PAGE);
    expect(calls).toBe(1);

    const failing = createCorsProbeCache(async () => { throw new Error('offline'); });
    await expect(failing('https://broken.test/a.mp3', PAGE)).resolves.toBe(false);
  });

  it('treats a non-callable fetch implementation as "cannot verify" and keeps audio local', async () => {
    expect(await probeAudioCorsSupport('https://x.test/a.mp3', null)).toBe(false);
    expect(await probeAudioCorsSupport('https://x.test/a.mp3', undefined)).toBe(false);
    expect(await probeAudioCorsSupport('https://x.test/a.mp3', (() => { throw new Error('nope'); }) as unknown as typeof fetch)).toBe(false);
    expect(await probeAudioCorsSupport('https://x.test/a.mp3', (async () => ({ ok: true })) as unknown as typeof fetch)).toBe(true);
  });
});
