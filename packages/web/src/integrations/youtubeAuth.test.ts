// src/integrations/youtubeAuth.test.ts
//
// The token model has almost no state machine left to test - which is the point. What still needs
// pinning down is the part that used to live in a redirect: how a popup's three outcomes
// (connected / cancelled / error) are told apart, and that the token never leaks into storage.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoogleIdentityApi, GoogleTokenClient, GoogleTokenClientConfig } from './googleIdentity';

const loadGoogleIdentity = vi.fn<[], Promise<GoogleIdentityApi>>();

vi.mock('./googleIdentity', async () => {
  const actual = await vi.importActual<typeof import('./googleIdentity')>('./googleIdentity');
  return { ...actual, loadGoogleIdentity: () => loadGoogleIdentity() };
});

const modulePromise = import('./youtubeAuth');

const importAuth = async () => {
  const mod = await modulePromise;
  mod.__setYouTubeSessionForTests(null);
  return mod;
};

/** A GIS token client whose `requestAccessToken` is driven by the test. */
const createFakeApi = () => {
  const state: {
    config?: GoogleTokenClientConfig;
    overrides?: { prompt?: string };
  } = {};
  const client: GoogleTokenClient = {
    requestAccessToken: (overrides) => {
      state.overrides = overrides;
    },
  };
  const api: GoogleIdentityApi = {
    initTokenClient: (config) => {
      state.config = config;
      return client;
    },
    revoke: vi.fn(),
  };
  return { api, state };
};

const setClientId = (value: string) => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', value);
};

beforeEach(() => {
  loadGoogleIdentity.mockReset();
  setClientId('test-client-id.apps.googleusercontent.com');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  const mod = await importAuth();
  mod.__setYouTubeSessionForTests(null);
});

describe('readClientId / missing configuration', () => {
  it('reports a missing client id instead of opening a popup', async () => {
    setClientId('');
    const { beginYouTubeLogin } = await importAuth();
    const result = await beginYouTubeLogin();
    expect(result).toEqual({ status: 'error', message: '缺少 VITE_GOOGLE_CLIENT_ID' });
    expect(loadGoogleIdentity).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only client id as missing', async () => {
    setClientId('   ');
    const { beginYouTubeLogin } = await importAuth();
    const result = await beginYouTubeLogin();
    expect(result.status).toBe('error');
    expect(loadGoogleIdentity).not.toHaveBeenCalled();
  });
});

describe('beginYouTubeLogin - success', () => {
  it('requests a popup token client with the read-write YouTube scope', async () => {
    const { api, state } = createFakeApi();
    loadGoogleIdentity.mockResolvedValue(api);
    const { beginYouTubeLogin } = await importAuth();

    void beginYouTubeLogin();
    await vi.waitFor(() => expect(state.config).toBeDefined());

    expect(state.config?.client_id).toBe('test-client-id.apps.googleusercontent.com');
    expect(state.config?.scope).toBe('https://www.googleapis.com/auth/youtube');
    // A popup must never navigate: that is the whole reason the callback route could be deleted.
    expect(state.config?.ux_mode).toBe('popup');
  });

  it('resolves connected with a session and keeps it in memory', async () => {
    const { api, state } = createFakeApi();
    loadGoogleIdentity.mockResolvedValue(api);
    const { beginYouTubeLogin, getCurrentYouTubeSession } = await importAuth();

    const pending = beginYouTubeLogin();
    await vi.waitFor(() => expect(state.config).toBeDefined());
    state.config?.callback({ access_token: 'token-1', expires_in: 3600 });

    const result = await pending;
    expect(result.status).toBe('connected');
    expect(result.session?.accessToken).toBe('token-1');
    expect(getCurrentYouTubeSession()?.accessToken).toBe('token-1');
  });

  it('asks for the account chooser by default, and can be told not to', async () => {
    const { api, state } = createFakeApi();
    loadGoogleIdentity.mockResolvedValue(api);
    const { beginYouTubeLogin } = await importAuth();

    void beginYouTubeLogin();
    await vi.waitFor(() => expect(state.overrides).toBeDefined());
    expect(state.overrides?.prompt).toBe('select_account');

    void beginYouTubeLogin({ selectAccount: false });
    await vi.waitFor(() => expect(state.overrides?.prompt).toBe(''));
  });

  it('ignores a second response once the first has settled', async () => {
    const { api, state } = createFakeApi();
    loadGoogleIdentity.mockResolvedValue(api);
    const { beginYouTubeLogin, getCurrentYouTubeSession } = await importAuth();

    const pending = beginYouTubeLogin();
    await vi.waitFor(() => expect(state.config).toBeDefined());
    state.config?.callback({ access_token: 'first', expires_in: 3600 });
    state.config?.callback({ access_token: 'second', expires_in: 3600 });

    const result = await pending;
    expect(result.session?.accessToken).toBe('first');
    expect(getCurrentYouTubeSession()?.accessToken).toBe('first');
  });
});

describe('beginYouTubeLogin - cancellation', () => {
  it.each(['popup_closed', 'popup_closed_by_user'])('maps %s to a silent cancel', async (type) => {
    const { api, state } = createFakeApi();
    loadGoogleIdentity.mockResolvedValue(api);
    const { beginYouTubeLogin, getCurrentYouTubeSession } = await importAuth();

    const pending = beginYouTubeLogin();
    await vi.waitFor(() => expect(state.config).toBeDefined());
    state.config?.error_callback?.({ type });

    const result = await pending;
    expect(result.status).toBe('cancelled');
    expect(result.message).toBeUndefined();
    // Nothing was granted, so nothing may be stored.
    expect(getCurrentYouTubeSession()).toBeNull();
  });

  it('keeps any earlier session when the user cancels a re-connect', async () => {
    const { api, state } = createFakeApi();
    loadGoogleIdentity.mockResolvedValue(api);
    const auth = await importAuth();
    auth.__setYouTubeSessionForTests({ accessToken: 'old', expiresAt: Date.now() + 3_600_000 });

    const pending = auth.beginYouTubeLogin();
    await vi.waitFor(() => expect(state.config).toBeDefined());
    state.config?.error_callback?.({ type: 'popup_closed' });

    expect((await pending).status).toBe('cancelled');
    expect(auth.getCurrentYouTubeSession()?.accessToken).toBe('old');
  });
});

describe('beginYouTubeLogin - failures', () => {
  it('surfaces a popup that could not open as an error, not a cancel', async () => {
    const { api, state } = createFakeApi();
    loadGoogleIdentity.mockResolvedValue(api);
    const { beginYouTubeLogin } = await importAuth();

    const pending = beginYouTubeLogin();
    await vi.waitFor(() => expect(state.config).toBeDefined());
    state.config?.error_callback?.({ type: 'unknown', message: '瀏覽器封鎖了彈出視窗' });

    const result = await pending;
    expect(result.status).toBe('error');
    expect(result.message).toBe('瀏覽器封鎖了彈出視窗');
  });

  it('turns an error inside the token response into an error result', async () => {
    const { api, state } = createFakeApi();
    loadGoogleIdentity.mockResolvedValue(api);
    const { beginYouTubeLogin, getCurrentYouTubeSession } = await importAuth();

    const pending = beginYouTubeLogin();
    await vi.waitFor(() => expect(state.config).toBeDefined());
    state.config?.callback({ error: 'access_denied' });

    const result = await pending;
    expect(result.status).toBe('error');
    expect(result.message).toContain('access_denied');
    expect(getCurrentYouTubeSession()).toBeNull();
  });

  it('reports a response with no access token as an error', async () => {
    const { api, state } = createFakeApi();
    loadGoogleIdentity.mockResolvedValue(api);
    const { beginYouTubeLogin } = await importAuth();

    const pending = beginYouTubeLogin();
    await vi.waitFor(() => expect(state.config).toBeDefined());
    state.config?.callback({ expires_in: 3600 });

    const result = await pending;
    expect(result.status).toBe('error');
    expect(result.message).toBe('Google 未回傳可用的存取權杖');
  });

  it('reports a loader failure without throwing', async () => {
    loadGoogleIdentity.mockRejectedValue(new Error('Google Identity Services 載入逾時'));
    const { beginYouTubeLogin } = await importAuth();

    const result = await beginYouTubeLogin();
    expect(result).toEqual({ status: 'error', message: 'Google Identity Services 載入逾時' });
  });

  it('reports a throw from initTokenClient without throwing', async () => {
    loadGoogleIdentity.mockResolvedValue({
      initTokenClient: () => {
        throw new Error('初始化失敗');
      },
      revoke: vi.fn(),
    } as unknown as GoogleIdentityApi);
    const { beginYouTubeLogin } = await importAuth();

    const result = await beginYouTubeLogin();
    expect(result).toEqual({ status: 'error', message: '初始化失敗' });
  });
});

describe('session validity', () => {
  it('rejects a session inside the expiry skew', async () => {
    const { isYouTubeSessionValid } = await importAuth();
    const now = 1_000_000;
    expect(isYouTubeSessionValid({ accessToken: 't', expiresAt: now + 30_000 }, now)).toBe(false);
    expect(isYouTubeSessionValid({ accessToken: 't', expiresAt: now + 31_000 }, now)).toBe(true);
    expect(isYouTubeSessionValid(null, now)).toBe(false);
    expect(isYouTubeSessionValid({ accessToken: '', expiresAt: now + 99_000 }, now)).toBe(false);
  });

  it('turns a token response into a session with the 60 s safety margin', async () => {
    const { toYouTubeSession } = await importAuth();
    const now = 5_000_000;
    expect(toYouTubeSession({ access_token: 't', expires_in: 3600 }, now)).toEqual({
      accessToken: 't',
      expiresAt: now + 3540 * 1000,
    });
  });

  it('accepts expires_in as a string, which is what the API sends', async () => {
    const { toYouTubeSession } = await importAuth();
    expect(toYouTubeSession({ access_token: 't', expires_in: '1800' }, 0)?.expiresAt).toBe(1740 * 1000);
  });

  it('never produces an already-expired session from a nonsense expires_in', async () => {
    const { toYouTubeSession } = await importAuth();
    expect(toYouTubeSession({ access_token: 't', expires_in: 5 }, 0)?.expiresAt).toBe(30 * 1000);
    expect(toYouTubeSession({ access_token: 't', expires_in: NaN }, 0)?.expiresAt).toBe(3540 * 1000);
  });
});

describe('no persistence', () => {
  it('writes nothing to storage on connect', async () => {
    // The suite runs in the node environment, so `Storage` does not exist. Both storage objects are
    // stubbed here rather than assumed absent: the point is that nothing is called, and a test that
    // cannot see the call could not tell.
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem, getItem: vi.fn(), removeItem: vi.fn() });
    vi.stubGlobal('sessionStorage', { setItem, getItem: vi.fn(), removeItem: vi.fn() });
    const { api, state } = createFakeApi();
    loadGoogleIdentity.mockResolvedValue(api);
    const { beginYouTubeLogin } = await importAuth();

    const pending = beginYouTubeLogin();
    await vi.waitFor(() => expect(state.config).toBeDefined());
    state.config?.callback({ access_token: 'token-1', expires_in: 3600 });
    await pending;

    expect(setItem).not.toHaveBeenCalled();
  });

  it('restores nothing after a reload, because nothing was stored', async () => {
    const { getStoredYouTubeSession } = await importAuth();
    expect(getStoredYouTubeSession()).toBeNull();
  });
});

describe('clearYouTubeSession', () => {
  it('leaves no session behind', async () => {
    const { getCurrentYouTubeSession, getStoredYouTubeSession, clearYouTubeSession, __setYouTubeSessionForTests } = await importAuth();
    __setYouTubeSessionForTests({ accessToken: 'token-1', expiresAt: Date.now() + 3_600_000 });
    expect(getStoredYouTubeSession()).not.toBeNull();

    clearYouTubeSession();
    expect(getCurrentYouTubeSession()).toBeNull();
    expect(getStoredYouTubeSession()).toBeNull();
  });
});

describe('revokeYouTubeAccessToken', () => {
  it('swallows a network failure instead of rejecting', async () => {
    // The local sign-out is the store's job; this function's only promise is that a dead network
    // never turns "disconnect" into an error the user sees.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { revokeYouTubeAccessToken } = await importAuth();

    await expect(revokeYouTubeAccessToken('token-1')).resolves.toBeUndefined();
  });

  it('posts the token to Google\'s revoke endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const { revokeYouTubeAccessToken } = await importAuth();

    await revokeYouTubeAccessToken('token-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/revoke');
    expect(init.method).toBe('POST');
    expect(String(init.body)).toContain('token-1');
  });

  it('does not call the endpoint for a missing token', async () => {
    const { revokeYouTubeAccessToken } = await importAuth();

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await revokeYouTubeAccessToken(null);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
