const STORAGE_KEY = 'echora.youtube.session';
const OAUTH_STATE_KEY = 'echora.youtube.oauth.state';
const RETURN_TO_KEY = 'echora.youtube.oauth.return-to';
const SWITCH_ACCOUNT_KEY = 'echora.youtube.oauth.switch-account';
const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const EXPIRY_SKEW_MS = 30_000;

export interface YouTubeSession { accessToken: string; expiresAt: number; }

export interface YouTubeLoginOptions {
  selectAccount?: boolean;
  returnTo?: string;
}

export interface YouTubeAuthorizationUrlOptions {
  clientId: string;
  redirectUri: string;
  state: string;
  selectAccount?: boolean;
}

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const getRedirectUri = () => (import.meta.env.VITE_GOOGLE_REDIRECT_URI as string | undefined) || `${window.location.origin}/oauth/youtube/callback`;

const normalizeReturnPath = (value?: string) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://echora.local';
  try {
    const url = new URL(value || '/', origin);
    if (url.origin !== origin || url.pathname === '/oauth/youtube/callback') return '/';
    return `${url.pathname}${url.search}${url.hash}` || '/';
  } catch {
    return '/';
  }
};

const getCurrentReturnPath = () => {
  if (typeof window === 'undefined') return '/';
  return normalizeReturnPath(`${window.location.pathname}${window.location.search}${window.location.hash}`);
};

export const getYouTubeLoginReturnPath = () => {
  if (typeof window === 'undefined') return '/';
  return normalizeReturnPath(window.sessionStorage.getItem(RETURN_TO_KEY) || '/');
};

export const buildYouTubeCallbackPath = (returnTo: string, status: 'connected' | 'error') => {
  const url = new URL(normalizeReturnPath(returnTo), 'https://echora.local');
  url.searchParams.set('youtube', status);
  return `${url.pathname}${url.search}${url.hash}`;
};

export const clearYouTubeLoginIntent = () => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(OAUTH_STATE_KEY);
  window.sessionStorage.removeItem(RETURN_TO_KEY);
  window.sessionStorage.removeItem(SWITCH_ACCOUNT_KEY);
};

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

export const buildYouTubeAuthorizationUrl = ({ clientId: authorizationClientId, redirectUri, state, selectAccount = false }: YouTubeAuthorizationUrlOptions) => {
  const params = new URLSearchParams({
    client_id: authorizationClientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: `${SCOPE} openid`,
    state,
    include_granted_scopes: 'true',
  });
  if (selectAccount) params.set('prompt', 'select_account');
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
};

export const beginYouTubeLogin = async (options: YouTubeLoginOptions = {}) => {
  if (!clientId) throw new Error('缺少 VITE_GOOGLE_CLIENT_ID');
  const state = crypto.randomUUID();
  const returnTo = normalizeReturnPath(options.returnTo || getCurrentReturnPath());
  window.sessionStorage.setItem(OAUTH_STATE_KEY, state);
  window.sessionStorage.setItem(RETURN_TO_KEY, returnTo);
  if (options.selectAccount) window.sessionStorage.setItem(SWITCH_ACCOUNT_KEY, '1');
  else window.sessionStorage.removeItem(SWITCH_ACCOUNT_KEY);

  window.location.assign(buildYouTubeAuthorizationUrl({
    clientId,
    redirectUri: getRedirectUri(),
    state,
    selectAccount: options.selectAccount,
  }));
};

export const finishYouTubeLogin = (): YouTubeSession | null => {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const oauthError = hash.get('error');
  if (oauthError) {
    clearYouTubeLoginIntent();
    throw new Error(`YouTube 授權未完成：${oauthError}`);
  }
  const accessToken = hash.get('access_token');
  if (!accessToken) {
    clearYouTubeLoginIntent();
    return getStoredYouTubeSession();
  }
  const expectedState = window.sessionStorage.getItem(OAUTH_STATE_KEY);
  if (!expectedState || hash.get('state') !== expectedState) {
    clearYouTubeLoginIntent();
    throw new Error('Google OAuth state 驗證失敗');
  }
  const expiresIn = Number(hash.get('expires_in') || 3600);
  const session = { accessToken, expiresAt: Date.now() + Math.max(expiresIn - 60, 30) * 1000 };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  clearYouTubeLoginIntent();
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
  return session;
};

export const revokeYouTubeAccessToken = async (accessToken: string | null | undefined) => {
  if (!accessToken || typeof fetch !== 'function') return;
  try {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: accessToken }),
    });
  } catch {
    // Local sign-out must still succeed if the remote revoke endpoint is unavailable.
  }
};

export const clearYouTubeSession = () => {
  localStorage.removeItem(STORAGE_KEY);
  clearYouTubeLoginIntent();
};
