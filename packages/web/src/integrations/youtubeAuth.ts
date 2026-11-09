// src/integrations/youtubeAuth.ts
//
// YouTube authorization, now on Google Identity Services rather than the implicit flow.
//
// What changed and why:
//
// The implicit flow (`response_type=token`) navigated the whole tab to Google and handed the access
// token back in the URL fragment. That meant a full app reload on every connect, the token sitting
// in browser history, the token written to localStorage where any XSS could read it, and a
// CSRF `state` check that had to be hand-rolled around a flow Google never designed for one.
//
// GIS opens a popup that never leaves the page and delivers the token to a callback. The token lives
// in memory here and nowhere else. The consequences are deliberate:
//
//   - A page reload signs the user out. That is the price of not persisting a bearer token, and it
//     is the trade the plan chose (W1/D1-C). The alternative - a refresh token held by a backend -
//     is a later, separate PR.
//   - `state` and `/oauth/youtube/callback` are gone. A popup has no redirect to correlate, so the
//     callback URL cannot be confused for one.
//   - `getStoredYouTubeSession` always resolves to null now; it is kept because the store's restore
//     path calls it and because a future backend session will fill the same shape.

import {
  loadGoogleIdentity,
  resolveConsentPrompt,
  type GoogleTokenResponse,
} from './googleIdentity';

/**
 * Read-only YouTube scope.
 *
 * This was widened to the full `.../auth/youtube` scope so the provider could create and edit
 * playlists (D2), and narrowed back because nothing ever used it: every call in the app is a GET
 * through `requestYouTubeJson`, and no playlist write was ever implemented. Asking for write
 * access to a user's account to read their library is a bad trade on its own terms, and it put the
 * consent screen at odds with the privacy policy - which is the single most common reason Google
 * rejects OAuth verification.
 *
 * If playlist writing is ever built, ask for the write scope *then*, with Google's incremental
 * authorization (`include_granted_scopes`), so the normal consent screen stays read-only.
 */
const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';

const EXPIRY_SKEW_MS = 30_000;

export interface YouTubeSession { accessToken: string; expiresAt: number; }

export interface YouTubeLoginOptions {
  /** Force the account chooser (a "switch account" click); the default is to show it anyway. */
  selectAccount?: boolean;
  /** Kept for call-site compatibility; a popup never navigates, so nothing is returned to. */
  returnTo?: string;
}

export interface YouTubeLoginResult {
  status: 'connected' | 'cancelled' | 'error';
  session?: YouTubeSession;
  message?: string;
}

/**
 * The OAuth client id, read on demand.
 *
 * Deliberately not a module-level constant: a test suite has to be able to point several cases at
 * different values, and a value captured at import time can only be changed by re-importing the
 * module. Vite still inlines the variable at build time, so this costs nothing in production.
 */
const readClientId = () => (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || '';

/**
 * The one live session.
 *
 * Module scope, not localStorage: this is the memory-only token store the move to GIS buys us.
 * Kept in a mutable holder so tests can reset it without re-importing the module.
 */
let currentSession: YouTubeSession | null = null;

export const getCurrentYouTubeSession = (): YouTubeSession | null => (
  isYouTubeSessionValid(currentSession) ? currentSession : null
);

/** Test seam, and the tail of `clearYouTubeSession`. */
export const __setYouTubeSessionForTests = (session: YouTubeSession | null) => {
  currentSession = session;
};

export const isYouTubeSessionValid = (session: YouTubeSession | null | undefined, now = Date.now()) =>
  Boolean(session?.accessToken && Number.isFinite(session.expiresAt) && session.expiresAt > now + EXPIRY_SKEW_MS);

/**
 * Always null.
 *
 * A GIS token is never persisted, so there is nothing to restore across a reload. This exists so the
 * store's restore path keeps one shape, and so a future backend session can be dropped in here
 * without every caller changing.
 */
export const getStoredYouTubeSession = (): YouTubeSession | null => getCurrentYouTubeSession();

/**
 * Turns a GIS token response into a session, or explains why it cannot.
 *
 * `expires_in` arrives as a string from the API; the 60 s deduction keeps a token from being applied
 * in the last second before Google starts rejecting it, and the floor keeps a nonsense `expires_in`
 * from producing an already-expired session.
 */
export const toYouTubeSession = (response: GoogleTokenResponse, now = Date.now()): YouTubeSession | null => {
  const accessToken = response.access_token;
  if (typeof accessToken !== 'string' || !accessToken) return null;
  const expiresIn = Number(response.expires_in ?? 3600);
  const safeSeconds = Number.isFinite(expiresIn) ? Math.max(expiresIn - 60, 30) : 3540;
  return { accessToken, expiresAt: now + safeSeconds * 1000 };
};

/**
 * Opens the Google popup and resolves with the outcome.
 *
 * Cancellation is a normal result, not an exception: the user closing the popup is the most common
 * non-success path, and the store needs to tell it apart from a real failure so it can stay silent
 * instead of showing an error for something the user chose.
 */
export const beginYouTubeLogin = async (options: YouTubeLoginOptions = {}): Promise<YouTubeLoginResult> => {
  const clientId = readClientId();
  if (!clientId) {
    return { status: 'error', message: '缺少 VITE_GOOGLE_CLIENT_ID' };
  }

  let api;
  try {
    api = await loadGoogleIdentity();
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Google 登入服務無法載入' };
  }

  return new Promise<YouTubeLoginResult>(resolve => {
    let settled = false;
    const settle = (result: YouTubeLoginResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let client;
    try {
      client = api.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        ux_mode: 'popup',
        callback: (response: GoogleTokenResponse) => {
          // A settled request must be inert. Without this, a late second callback overwrote the
          // token of an already-adopted session - a silent swap to a different account.
          if (settled) return;
          if (response.error) {
            settle({ status: 'error', message: `YouTube 授權未完成：${response.error}` });
            return;
          }
          const session = toYouTubeSession(response);
          if (!session) {
            settle({ status: 'error', message: 'Google 未回傳可用的存取權杖' });
            return;
          }
          currentSession = session;
          settle({ status: 'connected', session });
        },
        error_callback: (error) => {
          if (settled) return;
          // `popup_closed` is a cancel, not a failure. GIS reports both through this channel.
          const type = error?.type;
          if (type === 'popup_closed' || type === 'popup_closed_by_user') {
            settle({ status: 'cancelled' });
            return;
          }
          settle({ status: 'error', message: error?.message || 'Google 授權視窗無法開啟' });
        },
      });
    } catch (error) {
      settle({ status: 'error', message: error instanceof Error ? error.message : '無法建立 Google 登入用戶端' });
      return;
    }

    try {
      client.requestAccessToken({ prompt: resolveConsentPrompt({ selectAccount: options.selectAccount }) });
    } catch (error) {
      settle({ status: 'error', message: error instanceof Error ? error.message : '無法開啟 Google 授權視窗' });
    }
  });
};

/**
 * Revokes the token at Google, then drops it locally.
 *
 * The local clear must not depend on the network: a user pressing "disconnect" is entitled to a
 * disconnected app even if `oauth2.googleapis.com` is unreachable, so the remote call is attempted
 * and its failure is swallowed.
 */
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

/** Drops the in-memory session. There is no persistent copy to remove. */
export const clearYouTubeSession = () => {
  currentSession = null;
};
