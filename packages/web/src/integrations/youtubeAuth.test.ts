import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildYouTubeAuthorizationUrl, buildYouTubeCallbackPath, finishYouTubeLogin, isYouTubeSessionValid } from './youtubeAuth';

describe('isYouTubeSessionValid', () => {
  const now = 1_750_000_000_000;

  it('accepts a token that remains valid beyond the safety window', () => {
    expect(isYouTubeSessionValid({ accessToken: 'token', expiresAt: now + 90_000 }, now)).toBe(true);
  });

  it('rejects expired and near-expiry sessions before the UI can show a false connection state', () => {
    expect(isYouTubeSessionValid({ accessToken: 'token', expiresAt: now - 1 }, now)).toBe(false);
    expect(isYouTubeSessionValid({ accessToken: 'token', expiresAt: now + 20_000 }, now)).toBe(false);
    expect(isYouTubeSessionValid(null, now)).toBe(false);
  });
});

describe('YouTube OAuth authorization URL', () => {
  const baseOptions = {
    clientId: 'client-id',
    redirectUri: 'https://echora.local/oauth/youtube/callback',
    state: 'oauth-state',
  };

  it('keeps the normal login flow free of account-selection prompting', () => {
    const url = new URL(buildYouTubeAuthorizationUrl(baseOptions));
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(baseOptions.redirectUri);
    expect(url.searchParams.get('state')).toBe('oauth-state');
    expect(url.searchParams.get('prompt')).toBeNull();
  });

  it('asks Google to show the account chooser during an account switch', () => {
    const url = new URL(buildYouTubeAuthorizationUrl({ ...baseOptions, selectAccount: true }));
    expect(url.searchParams.get('prompt')).toBe('select_account');
    expect(url.searchParams.get('state')).toBe('oauth-state');
    expect(url.searchParams.get('redirect_uri')).toBe(baseOptions.redirectUri);
  });
});

describe('YouTube OAuth callback cleanup', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow) Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
    else delete (globalThis as { window?: Window }).window;
  });

  const installOAuthWindow = (hash: string) => {
    const sessionValues = new Map<string, string>();
    const localValues = new Map<string, string>();
    const sessionStorage = {
      getItem: (key: string) => sessionValues.get(key) ?? null,
      setItem: (key: string, value: string) => { sessionValues.set(key, value); },
      removeItem: (key: string) => { sessionValues.delete(key); },
    } as Storage;
    const localStorage = {
      getItem: (key: string) => localValues.get(key) ?? null,
      setItem: (key: string, value: string) => { localValues.set(key, value); },
      removeItem: (key: string) => { localValues.delete(key); },
    } as Storage;
    const history = { replaceState: vi.fn() } as unknown as History;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { hash }, sessionStorage, localStorage, history },
    });
    return { sessionValues, localValues };
  };

  it('clears OAuth intent after the user cancels at Google', () => {
    const { sessionValues } = installOAuthWindow('#error=access_denied');
    sessionValues.set('echora.youtube.oauth.state', 'oauth-state');
    sessionValues.set('echora.youtube.oauth.return-to', '/player?demo=1');
    sessionValues.set('echora.youtube.oauth.switch-account', '1');

    expect(() => finishYouTubeLogin()).toThrow('YouTube 授權未完成');
    expect(sessionValues.size).toBe(0);
  });

  it('rejects a mismatched state and clears intent without storing the token', () => {
    const { sessionValues, localValues } = installOAuthWindow('#access_token=untrusted-token&state=wrong-state');
    sessionValues.set('echora.youtube.oauth.state', 'expected-state');
    sessionValues.set('echora.youtube.oauth.return-to', '/player?demo=1');
    sessionValues.set('echora.youtube.oauth.switch-account', '1');

    expect(() => finishYouTubeLogin()).toThrow('Google OAuth state 驗證失敗');
    expect(sessionValues.size).toBe(0);
    expect(localValues.size).toBe(0);
  });
});

describe('YouTube OAuth return path', () => {
  it('keeps the source route, query, and hash when the callback completes', () => {
    expect(buildYouTubeCallbackPath('/player?demo=1#stage', 'connected')).toBe('/player?demo=1&youtube=connected#stage');
  });

  it('rejects external and callback destinations instead of creating an open redirect', () => {
    // Fallbacks land in the app shell, never on the landing page.
    expect(buildYouTubeCallbackPath('https://example.com/account', 'error')).toBe('/app?youtube=error');
    expect(buildYouTubeCallbackPath('/oauth/youtube/callback', 'error')).toBe('/app?youtube=error');
  });
});
