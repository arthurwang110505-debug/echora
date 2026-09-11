// src/playback/audioRouting.ts
//
// Decides whether the local <audio> element may be routed through a Web Audio
// graph (for the spectrum analyser) or must keep its native output.
//
// Why this exists: per the Web Audio spec, a MediaElementAudioSourceNode MUST
// output silence for a media element whose fetch was labelled CORS-cross-origin,
// and once createMediaElementSource() is called the element's audible output only
// exists inside that graph. Routing a plain cross-origin <audio> through an analyser
// therefore mutes playback entirely ("the player runs, the stage animates, no sound").
// The decision has to be made before `audio.src` is assigned, because `crossOrigin`
// only affects the fetch when it is set first.

export type AudioRoutingMode = 'analyser' | 'direct';
export type AudioRoutingReason =
  | 'same-origin'
  | 'local-source'
  | 'cors-allowlist'
  | 'cors-probe-ok'
  | 'cors-probe-failed'
  | 'cors-probe-unavailable'
  | 'invalid-url'
  | 'no-page-origin';

export interface AudioRoutingDecision {
  mode: AudioRoutingMode;
  /** Value for `HTMLAudioElement.crossOrigin`; null means "leave the attribute unset". */
  crossOrigin: 'anonymous' | null;
  reason: AudioRoutingReason;
  /** True when the caller must confirm CORS with a probe before trusting `analyser`. */
  requiresProbe: boolean;
}

/**
 * Public CDNs that answer with `Access-Control-Allow-Origin: *` and support ranged
 * requests, so the analyser may read them without an extra probe round-trip.
 */
export const CORS_ENABLED_AUDIO_HOSTS = [
  'cdn.jsdelivr.net',
  'fastly.jsdelivr.net',
  'gcloud.jsdelivr.net',
  'gcore.jsdelivr.net',
  'testingcf.jsdelivr.net',
  'unpkg.com',
  'esm.sh',
] as const;

const FALLBACK_PAGE_ORIGIN = 'http://localhost:3000';

export const getPageOrigin = (): string => {
  if (typeof window === 'undefined') return FALLBACK_PAGE_ORIGIN;
  return window.location?.origin || FALLBACK_PAGE_ORIGIN;
};

const parseAudioUrl = (rawUrl: string, pageOrigin: string): URL | null => {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  try {
    return new URL(rawUrl, pageOrigin);
  } catch {
    return null;
  }
};

const directDecision = (reason: AudioRoutingReason): AudioRoutingDecision => ({
  mode: 'direct',
  crossOrigin: null,
  reason,
  requiresProbe: false,
});

/**
 * Pure first pass: local sources and allowlisted CDNs are safe to analyse, unknown
 * cross-origin hosts must be probed, anything unparsable must never be routed.
 */
export const resolveAudioRouting = (
  rawUrl: string | null | undefined,
  pageOrigin: string = getPageOrigin(),
  corsEnabledHosts: readonly string[] = CORS_ENABLED_AUDIO_HOSTS,
): AudioRoutingDecision => {
  const url = parseAudioUrl(String(rawUrl || ''), pageOrigin);
  if (!url) return directDecision('invalid-url');
  if (url.protocol === 'blob:' || url.protocol === 'data:') {
    return { mode: 'analyser', crossOrigin: null, reason: 'local-source', requiresProbe: false };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return directDecision('invalid-url');
  if (url.origin === pageOrigin) {
    return { mode: 'analyser', crossOrigin: null, reason: 'same-origin', requiresProbe: false };
  }
  if (corsEnabledHosts.includes(url.hostname)) {
    return { mode: 'analyser', crossOrigin: 'anonymous', reason: 'cors-allowlist', requiresProbe: false };
  }
  return { mode: 'analyser', crossOrigin: 'anonymous', reason: 'cors-probe-unavailable', requiresProbe: true };
};

/**
 * `HEAD` in CORS mode is the cheapest way to learn whether a host will let the page
 * read the bytes: the browser only resolves it when the response carries an
 * `Access-Control-Allow-Origin` match. Failures must fall back to `direct` - audio
 * without a spectrum is a cosmetic loss, audio routed into a tainted graph is silence.
 */
export const probeAudioCorsSupport = async (
  rawUrl: string,
  fetchImpl: typeof fetch | undefined | null,
): Promise<boolean> => {
  if (typeof fetchImpl !== 'function') return false;
  try {
    await fetchImpl(rawUrl, { method: 'HEAD', mode: 'cors', credentials: 'omit', cache: 'no-store' });
    return true;
  } catch {
    return false;
  }
};

export const withProbeResult = (decision: AudioRoutingDecision, probeSucceeded: boolean): AudioRoutingDecision => (
  probeSucceeded
    ? { ...decision, requiresProbe: false, reason: 'cors-probe-ok' }
    : directDecision('cors-probe-failed')
);

/**
 * Resolves the final routing decision, probing hosts that are not already allowlisted.
 * `probe` is injectable so the policy stays unit-testable without a network.
 */
export const resolveAudioRoutingForPlayback = async (
  rawUrl: string | null | undefined,
  options: {
    pageOrigin?: string;
    corsEnabledHosts?: readonly string[];
    fetchImpl?: typeof fetch;
    probe?: (url: string) => Promise<boolean>;
  } = {},
): Promise<AudioRoutingDecision> => {
  const pageOrigin = options.pageOrigin || getPageOrigin();
  const decision = resolveAudioRouting(rawUrl, pageOrigin, options.corsEnabledHosts ?? CORS_ENABLED_AUDIO_HOSTS);
  if (!decision.requiresProbe || !rawUrl) return decision;
  const probe = options.probe
    ?? ((url: string) => probeAudioCorsSupport(url, options.fetchImpl ?? (typeof fetch === 'function' ? fetch : null)));
  return withProbeResult(decision, await probe(String(rawUrl)));
};

/** Per-origin memo so switching tracks inside one album does not re-probe every time. */
export const createCorsProbeCache = (
  probe: (url: string) => Promise<boolean>,
): ((url: string, pageOrigin: string) => Promise<boolean>) => {
  const cache = new Map<string, Promise<boolean>>();
  return (url, pageOrigin) => {
    const parsed = parseAudioUrl(url, pageOrigin);
    const key = parsed && parsed.protocol !== 'blob:' && parsed.protocol !== 'data:' ? parsed.origin : url;
    const existing = cache.get(key);
    if (existing) return existing;
    const next = probe(url).catch(() => false);
    cache.set(key, next);
    return next;
  };
};
