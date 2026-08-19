const STORAGE_KEY = 'echora.youtube.session';
const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const EXPIRY_SKEW_MS = 30_000;

export interface YouTubeSession { accessToken: string; expiresAt: number; }

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const getRedirectUri = () => (import.meta.env.VITE_GOOGLE_REDIRECT_URI as string | undefined) || `${window.location.origin}/oauth/youtube/callback`;

export const isYouTubeSessionValid = (session: YouTubeSession | null | undefined, now = Date.now()) =>
  Boolean(session?.accessToken && Number.isFinite(session.expiresAt) && session.expiresAt > now + EXPIRY_SKEW_MS);

export const getStoredYouTubeSession = (): YouTubeSession | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const session = raw ? JSON.parse(raw) as YouTubeSession : null;
    if (isYouTubeSessionValid(session)) return session;
    localStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
};

export const beginYouTubeLogin = async () => {
  if (!clientId) throw new Error('缺少 VITE_GOOGLE_CLIENT_ID');
  const state = crypto.randomUUID();
  sessionStorage.setItem('echora.youtube.oauth.state', state);
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: getRedirectUri(), response_type: 'token', scope: `${SCOPE} openid`, state, include_granted_scopes: 'true' });
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};

export const finishYouTubeLogin = (): YouTubeSession | null => {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const oauthError = hash.get('error');
  if (oauthError) throw new Error(`YouTube 授權未完成：${oauthError}`);
  const accessToken = hash.get('access_token');
  if (!accessToken) return getStoredYouTubeSession();
  const expectedState = sessionStorage.getItem('echora.youtube.oauth.state');
  if (hash.get('state') !== expectedState) throw new Error('Google OAuth state 驗證失敗');
  const expiresIn = Number(hash.get('expires_in') || 3600);
  const session = { accessToken, expiresAt: Date.now() + Math.max(expiresIn - 60, 30) * 1000 };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  sessionStorage.removeItem('echora.youtube.oauth.state');
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
  return session;
};

export const clearYouTubeSession = () => localStorage.removeItem(STORAGE_KEY);
