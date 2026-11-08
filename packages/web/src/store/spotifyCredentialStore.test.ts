// src/store/spotifyCredentialStore.test.ts
//
// Spotify's dev mode caps one app at five authenticated listeners. The way through is one app per
// listener, which makes the Client ID a per-listener setting instead of a build-time constant. What
// needs pinning down is the precedence between the two sources, the shape check that keeps a pasted
// URL or secret out of an OAuth request, and the fact that the OAuth handshake remembers which app
// it is talking to.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV_CLIENT_ID = 'envclientid0123456789abcdef012345';

const memoryStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() { return store.size; },
  } satisfies Storage;
};

const DEFAULT_ENV = ENV_CLIENT_ID;

// `stubEnv` cannot unset a variable, so the two specs that need a different build-time value get
// their own module each, loaded after the stub is applied.
const loadStore = async (envClientId: string = DEFAULT_ENV) => {
  vi.resetModules();
  vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', envClientId);
  return import('./spotifyCredentialStore');
};

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: memoryStorage(), sessionStorage: memoryStorage() });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('spotify credential store', () => {
  it('falls back to the build-time Client ID when nothing is pasted', async () => {
    const { useSpotifyCredentialStore } = await loadStore();

    expect(useSpotifyCredentialStore.getState().clientId).toBe(ENV_CLIENT_ID);
    expect(useSpotifyCredentialStore.getState().isCustom).toBe(false);
  });

  it('lets a pasted Client ID override the deployment one', async () => {
    const { useSpotifyCredentialStore } = await loadStore();
    const mine = 'myownclientid0123456789abcdefgh';

    expect(useSpotifyCredentialStore.getState().setClientId(mine)).toEqual({ ok: true });
    expect(useSpotifyCredentialStore.getState().clientId).toBe(mine);
    expect(useSpotifyCredentialStore.getState().isCustom).toBe(true);
    expect(window.localStorage.getItem('echora.spotify.client-id')).toBe(mine);
  });

  it('reads the pasted Client ID back on the next load', async () => {
    window.localStorage.setItem('echora.spotify.client-id', 'persistedclientid0123456789abc');
    const { useSpotifyCredentialStore } = await loadStore();

    expect(useSpotifyCredentialStore.getState().clientId).toBe('persistedclientid0123456789abc');
    expect(useSpotifyCredentialStore.getState().isCustom).toBe(true);
  });

  it.each([
    ['a dashboard URL', 'https://developer.spotify.com/dashboard/app/1234'],
    ['a client secret', 'secret 0123456789abcdef0123456789abcdef'],
    ['whitespace only', '   '],
    ['a truncated value', 'abc123'],
  ])('rejects %s', async (_label, value) => {
    const { useSpotifyCredentialStore } = await loadStore();
    const before = useSpotifyCredentialStore.getState().clientId;

    expect(useSpotifyCredentialStore.getState().setClientId(value)).toEqual({ ok: false, reason: 'format' });
    expect(useSpotifyCredentialStore.getState().clientId).toBe(before);
    expect(window.localStorage.getItem('echora.spotify.client-id')).toBeNull();
  });

  it('trims surrounding whitespace from a pasted value', async () => {
    const { useSpotifyCredentialStore } = await loadStore();

    expect(useSpotifyCredentialStore.getState().setClientId('  myownclientid0123456789abcdefgh\n')).toEqual({ ok: true });
    expect(useSpotifyCredentialStore.getState().clientId).toBe('myownclientid0123456789abcdefgh');
  });

  it('clearing a pasted Client ID returns to the deployment one, not to nothing', async () => {
    const { useSpotifyCredentialStore } = await loadStore();
    useSpotifyCredentialStore.getState().setClientId('myownclientid0123456789abcdefgh');

    useSpotifyCredentialStore.getState().clearClientId();

    expect(useSpotifyCredentialStore.getState().clientId).toBe(ENV_CLIENT_ID);
    expect(useSpotifyCredentialStore.getState().isCustom).toBe(false);
    expect(window.localStorage.getItem('echora.spotify.client-id')).toBeNull();
  });

  it('stays empty when neither a pasted nor a build-time Client ID exists', async () => {
    const { useSpotifyCredentialStore } = await loadStore('');

    expect(useSpotifyCredentialStore.getState().clientId).toBe('');
    expect(useSpotifyCredentialStore.getState().isCustom).toBe(false);
  });

  it('remembers which app issued the OAuth code', async () => {
    const { useSpotifyCredentialStore } = await loadStore();
    useSpotifyCredentialStore.getState().setClientId('myownclientid0123456789abcdefgh');

    useSpotifyCredentialStore.getState().beginOAuth('state-value', 'verifier-value');

    expect(window.sessionStorage.getItem('echora.spotify.pkce.state')).toBe('myownclientid0123456789abcdefgh:state-value');
    expect(window.sessionStorage.getItem('echora.spotify.pkce.verifier')).toBe('verifier-value');
  });

  it('reports the app that issued the code even if the Client ID changed meanwhile', async () => {
    const { useSpotifyCredentialStore } = await loadStore();
    useSpotifyCredentialStore.getState().setClientId('myownclientid0123456789abcdefgh');
    useSpotifyCredentialStore.getState().beginOAuth('state-value', 'verifier-value');
    useSpotifyCredentialStore.getState().setClientId('adifferentclientid0123456789abcd');

    // `pendingReturn` is read from sessionStorage at module load; simulate the reload that follows
    // a consent round trip.
    const reloaded = await loadStore();

    expect(reloaded.useSpotifyCredentialStore.getState().readPendingReturn()).toBe('myownclientid0123456789abcdefgh:state-value');
    // The verifier is stored beside it; together the two identify the flow to resume.
    expect(window.sessionStorage.getItem('echora.spotify.pkce.verifier')).toBe('verifier-value');
  });
});
