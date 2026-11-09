// src/integrations/spotifyAuth.test.ts
//
// The Client ID moved from a build-time constant to a per-listener setting, which changes what a
// session means: a refresh token only works against the app that issued it. These specs pin down
// that a session is bound to its app (a pasted Client ID therefore requires a fresh consent), that
// the code is exchanged with the app that started the flow, and that neither the secret nor the
// access token ends up anywhere unexpected.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const APP_A = 'appaclientid0123456789abcdefghij';
const APP_B = 'appbclientid0123456789abcdefghij';

type Harness = {
  auth: typeof import('./spotifyAuth');
  credential: typeof import('../store/spotifyCredentialStore');
  fetchMock: ReturnType<typeof vi.fn>;
  href: string;
};

const load = async (options: { href?: string; envClientId?: string } = {}): Promise<Harness> => {
  vi.resetModules();
  vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', options.envClientId ?? '');
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('crypto', {
    getRandomValues: (bytes: Uint8Array) => bytes.fill(7),
    subtle: { digest: async () => new Uint8Array(32).fill(3) },
  });
  const location = {
    href: options.href ?? 'https://echora.test/app',
    origin: 'https://echora.test',
    pathname: new URL(options.href ?? 'https://echora.test/app').pathname,
    assign: vi.fn(),
    replace: vi.fn(),
  };
  // The module reads the bare `localStorage` / `sessionStorage` globals, not `window.localStorage`.
  const localStorageStub = memoryStorage();
  const sessionStorageStub = memoryStorage();
  vi.stubGlobal('localStorage', localStorageStub);
  vi.stubGlobal('sessionStorage', sessionStorageStub);
  vi.stubGlobal('window', {
    localStorage: localStorageStub,
    sessionStorage: sessionStorageStub,
    location,
    history: { replaceState: vi.fn() },
  });
  vi.stubGlobal('btoa', (value: string) => Buffer.from(value, 'binary').toString('base64'));
  vi.stubGlobal('document', { title: 'Echora' });

  const credential = await import('../store/spotifyCredentialStore');
  const auth = await import('./spotifyAuth');
  return { auth, credential, fetchMock, href: location.href };
};

const tokenResponse = (overrides: Record<string, unknown> = {}) => ({
  ok: true,
  json: async () => ({ access_token: 'access-token', refresh_token: 'refresh-token', expires_in: 3600, ...overrides }),
});

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('spotify auth and the listener-supplied Client ID', () => {
  it('authorizes against the pasted Client ID', async () => {
    const { auth, credential } = await load();
    credential.useSpotifyCredentialStore.getState().setClientId(APP_A);

    await auth.beginSpotifyLogin();

    const assign = (window.location.assign as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(new URL(assign).searchParams.get('client_id')).toBe(APP_A);
    expect(new URL(assign).searchParams.get('redirect_uri')).toBe('https://echora.test/app');
    expect(new URL(assign).searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('refuses to start a login with no Client ID at all', async () => {
    const { auth } = await load();

    await expect(auth.beginSpotifyLogin()).rejects.toThrow('尚未設定 Spotify Client ID');
  });

  it('discards a stored session that belongs to a different app', async () => {
    const { auth, credential } = await load();
    credential.useSpotifyCredentialStore.getState().setClientId(APP_A);
    window.localStorage.setItem('echora.spotify.session', JSON.stringify({
      accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: Date.now() + 60_000, clientId: APP_A,
    }));

    expect(auth.getStoredSpotifySession()?.clientId).toBe(APP_A);

    // Pasting a different app has to force a fresh consent: the old refresh token is app-bound.
    credential.useSpotifyCredentialStore.getState().setClientId(APP_B);
    expect(auth.getStoredSpotifySession()).toBeNull();
  });

  it('discards a session written before the Client ID was recorded', async () => {
    const { auth, credential } = await load();
    credential.useSpotifyCredentialStore.getState().setClientId(APP_A);
    window.localStorage.setItem('echora.spotify.session', JSON.stringify({
      accessToken: 'legacy-access', refreshToken: 'legacy-refresh', expiresAt: Date.now() + 60_000,
    }));

    expect(auth.getStoredSpotifySession()).toBeNull();
  });

  it('exchanges the code with the app that started the flow', async () => {
    const { auth, credential, fetchMock } = await load({
      href: 'https://echora.test/app?code=the-code&state=returned-state',
    });
    credential.useSpotifyCredentialStore.getState().setClientId(APP_A);
    credential.useSpotifyCredentialStore.getState().beginOAuth('returned-state', 'the-verifier');
    // The listener edited their Client ID in another tab while the consent page was open.
    credential.useSpotifyCredentialStore.getState().setClientId(APP_B);
    fetchMock.mockResolvedValue(tokenResponse());

    const session = await auth.finishSpotifyLogin();

    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.get('client_id')).toBe(APP_A);
    expect(body.get('code_verifier')).toBe('the-verifier');
    expect(session?.clientId).toBe(APP_A);
  });

  it('rejects a callback whose state does not match, and never calls the token endpoint', async () => {
    const { auth, credential, fetchMock } = await load({
      href: 'https://echora.test/app?code=the-code&state=someone-elses-state',
    });
    credential.useSpotifyCredentialStore.getState().setClientId(APP_A);
    credential.useSpotifyCredentialStore.getState().beginOAuth('the-real-state', 'the-verifier');

    await expect(auth.finishSpotifyLogin()).rejects.toThrow('Spotify 授權狀態驗證失敗');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes with the session own app, not the currently selected one', async () => {
    const { auth, credential, fetchMock } = await load();
    credential.useSpotifyCredentialStore.getState().setClientId(APP_A);
    fetchMock.mockResolvedValue(tokenResponse({ refresh_token: undefined }));

    const refreshed = await auth.refreshSpotifySession({
      accessToken: 'access-token', refreshToken: 'refresh-token', expiresAt: Date.now() - 1000, clientId: APP_A,
    });

    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.get('client_id')).toBe(APP_A);
    expect(body.get('grant_type')).toBe('refresh_token');
    // Spotify only returns a refresh token on rotation; the old one has to survive otherwise.
    expect(refreshed?.refreshToken).toBe('refresh-token');
    expect(refreshed?.clientId).toBe(APP_A);
  });

  it('never sends a client secret', async () => {
    const { auth, credential, fetchMock } = await load({
      href: 'https://echora.test/app?code=the-code&state=returned-state',
    });
    credential.useSpotifyCredentialStore.getState().setClientId(APP_A);
    credential.useSpotifyCredentialStore.getState().beginOAuth('returned-state', 'the-verifier');
    fetchMock.mockResolvedValue(tokenResponse());

    await auth.finishSpotifyLogin();

    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.has('client_secret')).toBe(false);
    expect([...body.keys()]).toEqual(expect.arrayContaining(['client_id', 'grant_type', 'code', 'redirect_uri', 'code_verifier']));
  });

  it('keeps the listener Client ID when the session is cleared', async () => {
    const { auth, credential } = await load();
    credential.useSpotifyCredentialStore.getState().setClientId(APP_A);
    window.localStorage.setItem('echora.spotify.session', JSON.stringify({
      accessToken: 'access-token', refreshToken: 'refresh-token', expiresAt: Date.now() + 60_000, clientId: APP_A,
    }));

    auth.clearSpotifySession();

    expect(window.localStorage.getItem('echora.spotify.session')).toBeNull();
    expect(credential.useSpotifyCredentialStore.getState().clientId).toBe(APP_A);
  });
});
