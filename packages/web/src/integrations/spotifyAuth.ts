import {
  SPOTIFY_VERIFIER_KEY as VERIFIER_KEY,
  useSpotifyCredentialStore,
} from '../store/spotifyCredentialStore';

const STORAGE_KEY = 'echora.spotify.session';

// Same indirection as the credential store: `window` does not exist when the unit tests import
// this module, and the auth code must not throw on import.
const storage = (kind: 'local' | 'session'): Storage | null => {
  if (typeof window !== 'undefined') {
    const fromWindow = kind === 'local' ? window.localStorage : window.sessionStorage;
    if (fromWindow) return fromWindow;
  }
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};

export interface SpotifySession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  /**
   * The Client ID that issued this session. Refresh tokens are app-bound, so the pair has to be
   * kept together: a listener who pastes a new Client ID has to authorize again, not retry a
   * refresh against the old app.
   */
  clientId: string;
}

// The Client ID is read at call time, not at import time: it can come from the Settings page.
const currentClientId = () => useSpotifyCredentialStore.getState().clientId;

// Spotify redirects back here after OAuth. Default to /app so a just-connected
// user lands in the app shell; deployments that still point the registered
// redirect at / are handled by the landing redirect inside finishSpotifyLogin.
const getRedirectUri = () =>
  (import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string | undefined) ||
  (typeof window !== 'undefined' ? `${window.location.origin}/app` : 'http://127.0.0.1:3000/app');
export const spotifyRedirectUri = getRedirectUri();

// Keep OAuth returns inside the app shell; the landing page is marketing-only.
const LANDING_PATHS = new Set(['/', '/welcome']);

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const randomString = (length: number) => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
};

const codeChallenge = async (verifier: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return toBase64Url(new Uint8Array(digest));
};

export const getStoredSpotifySession = (): SpotifySession | null => {
  try {
    const value = storage('local')?.getItem(STORAGE_KEY);
    if (!value) return null;
    const session = JSON.parse(value) as SpotifySession;
    // A session with no recorded app predates the Client ID handshake or belongs to another app:
    // either way its refresh token is useless here.
    if (!session.clientId || session.clientId !== currentClientId()) return null;
    return session;
  } catch {
    return null;
  }
};

const storeSession = (
  data: { access_token: string; refresh_token?: string; expires_in: number },
  clientId: string,
  previous?: SpotifySession,
): SpotifySession => {
  const session: SpotifySession = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || previous?.refreshToken,
    expiresAt: Date.now() + Math.max(data.expires_in - 60, 30) * 1000,
    clientId,
  };
  storage('local')?.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
};

export const beginSpotifyLogin = async () => {
  const clientId = currentClientId();
  if (!clientId) throw new Error('尚未設定 Spotify Client ID');
  const verifier = randomString(64);
  const state = randomString(24);
  useSpotifyCredentialStore.getState().beginOAuth(state, verifier);
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: spotifyRedirectUri,
    code_challenge_method: 'S256',
    code_challenge: await codeChallenge(verifier),
    state,
    scope: 'user-read-currently-playing user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative',
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
};

export const finishSpotifyLogin = async (): Promise<SpotifySession | null> => {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  if (error) throw new Error(`Spotify 授權未完成：${error}`);
  if (!code) return getStoredSpotifySession();

  const verifier = storage('session')?.getItem(VERIFIER_KEY) || null;
  // `state` is stored as "<clientId>:<state>": the prefix names the app the code has to be
  // exchanged with, even if the listener changed their Client ID while the consent page was open.
  const handshake = useSpotifyCredentialStore.getState().readPendingReturn();
  const separator = handshake.indexOf(':');
  const handshakeClientId = separator > 0 ? handshake.slice(0, separator) : '';
  const expectedState = separator > 0 ? handshake.slice(separator + 1) : '';
  if (!verifier || !expectedState || returnedState !== expectedState) throw new Error('Spotify 授權狀態驗證失敗');

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: handshakeClientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: spotifyRedirectUri,
      code_verifier: verifier,
    }),
  });
  if (!response.ok) throw new Error('Spotify token exchange failed');
  const session = storeSession(await response.json(), handshakeClientId);
  storage('session')?.removeItem(VERIFIER_KEY);
  window.history.replaceState({}, document.title, window.location.pathname);
  // If the registered redirect URI still points at the landing page, hand the
  // freshly connected user to the app shell instead of leaving them on /.
  if (LANDING_PATHS.has(window.location.pathname)) window.location.replace('/app');
  return session;
};

export const refreshSpotifySession = async (session: SpotifySession): Promise<SpotifySession | null> => {
  if (!session.refreshToken || !session.clientId) return null;
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: session.clientId,
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
    }),
  });
  if (!response.ok) return null;
  return storeSession(await response.json(), session.clientId, session);
};

export const clearSpotifySession = () => {
  storage('local')?.removeItem(STORAGE_KEY);
  // The lander's own Client ID survives a disconnect; only the session goes.
};
