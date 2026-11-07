// src/integrations/googleIdentity.ts
//
// A single loader for Google Identity Services (`https://accounts.google.com/gsi/client`).
//
// The implicit flow this replaces worked by navigating the whole tab to Google and reading the
// token back out of the redirect fragment. That costs a full app reload on every connect, puts the
// access token in the URL (and therefore in history), and writes it to localStorage where any XSS
// can read it. Google is also retiring `response_type=token`: apps still using it are being
// rejected with `Error 400: invalid_request` under the secure-response-handling policy.
//
// The token model replaces it with a popup that never leaves the page and hands the token to a
// callback in memory. This module owns three things that are easy to get subtly wrong:
//
//   1. The script is loaded once for the whole app. Two components calling this must share one
//      promise, not append two `<script>` tags.
//   2. A failed load is not cached. If the network drops on first load, the next connect attempt
//      has to try again instead of reusing a rejected promise forever.
//   3. The client is created per request, not per page. `requestAccessToken({ prompt })` is how the
//      account chooser is controlled, and that has to be decidable at the moment the user clicks.

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const GIS_LOAD_TIMEOUT_MS = 12_000;

/** The subset of GIS this app uses. Declared structurally so tests need no real script. */
export interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number | string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
  error_uri?: string;
}

export interface GoogleTokenClient {
  requestAccessToken(overrides?: { prompt?: string; login_hint?: string }): void;
}

export interface GoogleTokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: GoogleTokenResponse) => void;
  error_callback?: (error: { type?: string; message?: string }) => void;
  /** Suppresses the popup's own "this app wants access" interstitial where supported. */
  ux_mode?: 'popup' | 'redirect';
  login_hint?: string;
}

export interface GoogleIdentityApi {
  initTokenClient(config: GoogleTokenClientConfig): GoogleTokenClient;
  revoke(token: string, done?: (response: { successful?: boolean; error?: string }) => void): void;
}

type GisWindow = Window & {
  google?: { accounts?: { oauth2?: GoogleIdentityApi } };
};

/** Reads the API off `window` when the script has already run. */
export const getGoogleIdentityApi = (scope: typeof globalThis = globalThis): GoogleIdentityApi | null => {
  const host = scope as unknown as GisWindow;
  return host.google?.accounts?.oauth2 ?? null;
};

let loadPromise: Promise<GoogleIdentityApi> | null = null;

/**
 * Loads `gsi/client` once and resolves with the API object.
 *
 * Concurrent callers share one promise. A rejection clears it, so a transient failure does not
 * poison every later attempt - which matters because this runs behind a user-initiated button, and
 * the user's next click is the natural retry.
 */
export const loadGoogleIdentity = (options: {
  doc?: Document;
  timeoutMs?: number;
} = {}): Promise<GoogleIdentityApi> => {
  const existing = getGoogleIdentityApi();
  if (existing) return Promise.resolve(existing);
  if (loadPromise) return loadPromise;

  const { doc = document, timeoutMs = GIS_LOAD_TIMEOUT_MS } = options;

  loadPromise = new Promise<GoogleIdentityApi>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      fn();
    };

    const succeed = () => {
      const api = getGoogleIdentityApi();
      if (api) finish(() => resolve(api));
      else finish(() => {
        loadPromise = null;
        reject(new Error('Google Identity Services 載入後仍未提供 oauth2 API'));
      });
    };

    const fail = (message: string) => finish(() => {
      // Never cache a failure: the next click must be able to try again.
      loadPromise = null;
      reject(new Error(message));
    });

    timer = setTimeout(() => fail('Google Identity Services 載入逾時，請檢查網路後再試'), timeoutMs);

    const scripts = doc.querySelectorAll?.(`script[src="${GIS_SCRIPT_URL}"]`);
    const existingScript = scripts && scripts.length > 0 ? scripts[0] as HTMLScriptElement : null;

    if (existingScript) {
      // A script tag is already in flight or has already run but not yet exposed the API.
      existingScript.addEventListener('load', succeed, { once: true });
      existingScript.addEventListener('error', () => fail('Google Identity Services 載入失敗'), { once: true });
      return;
    }

    const script = doc.createElement('script');
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', succeed, { once: true });
    script.addEventListener('error', () => fail('Google Identity Services 載入失敗'), { once: true });
    doc.head.appendChild(script);
  });

  return loadPromise;
};

/** Test seam: forget the cached promise so a suite can exercise the load path repeatedly. */
export const __resetGoogleIdentityLoaderForTests = () => {
  loadPromise = null;
};

/** `prompt` values Google accepts. */
export type GoogleConsentPrompt = '' | 'consent' | 'select_account' | 'none';

/**
 * Chooses the consent prompt for a connect attempt.
 *
 * Google skips the account chooser when the browser already holds a session with a prior grant,
 * silently re-issuing a token for whichever account it picks. That is fine for a silent
 * re-authorisation the user did not ask to re-choose, and wrong for "switch account", which exists
 * precisely because the user wants to pick a different one.
 *
 * `select_account` is the default on a first connect: the user should see which account is being
 * connected, since the whole feature is "play *your* playlists".
 */
export const resolveConsentPrompt = (options: { selectAccount?: boolean; silent?: boolean } = {}): GoogleConsentPrompt => {
  if (options.silent) return '';
  return options.selectAccount === false ? '' : 'select_account';
};
