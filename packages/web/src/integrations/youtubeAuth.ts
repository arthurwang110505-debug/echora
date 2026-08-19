const STORAGE_KEY = 'echora.youtube.session';
const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';

export interface YouTubeSession { accessToken: string; expiresAt: number; }

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const redirectUri = (import.meta.env.VITE_GOOGLE_REDIRECT_URI as string | undefined) || `${window.location.origin}/oauth/youtube/callback`;

export const getStoredYouTubeSession = (): YouTubeSession | null => {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) as YouTubeSession : null; } catch { return null; }
};

export const beginYouTubeLogin = async () => {
  if (!clientId) throw new Error('缺少 VITE_GOOGLE_CLIENT_ID');
  const state = crypto.randomUUID();
  sessionStorage.setItem('echora.youtube.oauth.state', state);
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'token', scope: `${SCOPE} openid`, state, include_granted_scopes: 'true' });
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};

export const finishYouTubeLogin = (): YouTubeSession | null => {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = hash.get('access_token');
  if (!accessToken) return getStoredYouTubeSession();
  const expectedState = sessionStorage.getItem('echora.youtube.oauth.state');
  if (hash.get('state') !== expectedState) throw new Error('Google OAuth state 驗證失敗');
  const session = { accessToken, expiresAt: Date.now() + Number(hash.get('expires_in') || 3600) * 1000 };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  sessionStorage.removeItem('echora.youtube.oauth.state');
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
  return session;
};

export const clearYouTubeSession = () => localStorage.removeItem(STORAGE_KEY);
