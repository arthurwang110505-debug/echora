const STORAGE_KEY = 'echora.spotify.session';
const VERIFIER_KEY = 'echora.spotify.pkce.verifier';
const STATE_KEY = 'echora.spotify.pkce.state';

export interface SpotifySession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

export const spotifyClientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
export const spotifyRedirectUri = (import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string | undefined) || 'http://127.0.0.1:3000/';

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
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) as SpotifySession : null;
  } catch {
    return null;
  }
};

const storeSession = (data: { access_token: string; refresh_token?: string; expires_in: number }, previous?: SpotifySession): SpotifySession => {
  const session: SpotifySession = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || previous?.refreshToken,
    expiresAt: Date.now() + Math.max(data.expires_in - 60, 30) * 1000,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
};

export const beginSpotifyLogin = async () => {
  if (!spotifyClientId) throw new Error('缺少 VITE_SPOTIFY_CLIENT_ID');
  const verifier = randomString(64);
  const state = randomString(24);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  const params = new URLSearchParams({
    client_id: spotifyClientId,
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

  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const expectedState = sessionStorage.getItem(STATE_KEY);
  if (!verifier || !expectedState || returnedState !== expectedState) throw new Error('Spotify 授權狀態驗證失敗');

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: spotifyClientId || '',
      grant_type: 'authorization_code',
      code,
      redirect_uri: spotifyRedirectUri,
      code_verifier: verifier,
    }),
  });
  if (!response.ok) throw new Error('Spotify token exchange failed');
  const session = storeSession(await response.json());
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  window.history.replaceState({}, document.title, window.location.pathname);
  return session;
};

export const refreshSpotifySession = async (session: SpotifySession): Promise<SpotifySession | null> => {
  if (!session.refreshToken || !spotifyClientId) return null;
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: spotifyClientId, grant_type: 'refresh_token', refresh_token: session.refreshToken }),
  });
  if (!response.ok) return null;
  return storeSession(await response.json(), session);
};

export const clearSpotifySession = () => localStorage.removeItem(STORAGE_KEY);
