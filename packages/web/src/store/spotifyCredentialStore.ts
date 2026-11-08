import { create } from 'zustand';

// src/store/spotifyCredentialStore.ts
//
// Which Spotify app Echora authenticates against. Spotify dev-mode caps an app at five
// authenticated listeners, so a single shared deployment app cannot serve a crowd: the way through
// is the one Lyricify uses - every listener registers their own app in the Spotify Developer
// Dashboard and pastes its Client ID here. One app per person means five slots per person, and the
// listener is always the first of them.
//
// Precedence: the pasted ID wins, otherwise the build-time `VITE_SPOTIFY_CLIENT_ID`. That keeps
// self-hosted single-user deployments working with no setup, while a deployment that hands out a
// shared app still lets an individual override it.

export const SPOTIFY_CLIENT_ID_KEY = 'echora.spotify.client-id';

// The auth module and the store must agree on where the handshake lives, and neither can assume
// `window` exists (unit tests run in a bare node environment).
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

// A Hex Client ID is 32 characters; the check only has to reject pasted URLs, secrets and
// whitespace, so it stays permissive enough to survive a future format change.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,64}$/;

const envClientId = (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined)?.trim() || '';

export const readSpotifyClientId = (): string => {
  const stored = storage('local')?.getItem(SPOTIFY_CLIENT_ID_KEY)?.trim() || '';
  return stored || envClientId;
};

const writeSpotifyClientId = (clientId: string) => {
  try {
    if (clientId) storage('local')?.setItem(SPOTIFY_CLIENT_ID_KEY, clientId);
    else storage('local')?.removeItem(SPOTIFY_CLIENT_ID_KEY);
  } catch {
    // Persistence is optional; the in-memory value still drives this session.
  }
};

export const SPOTIFY_VERIFIER_KEY = 'echora.spotify.pkce.verifier';
const STATE_KEY = 'echora.spotify.pkce.state';

type SpotifyCredentialState = {
  /** The Client ID the next authorize request will use; empty means Spotify is not available. */
  clientId: string;
  /** Whether `clientId` came from the listener rather than from the build. */
  isCustom: boolean;
  /**
   * The `<clientId>:<state>` handshake started by `beginSpotifyLogin`. Read lazily from
   * sessionStorage: the store is created at import time, which is before any flow has started.
   * A session is bound to the app that issued it, so a stored session whose app no longer matches
   * is discarded instead of failing refresh forever.
   */
  readPendingReturn: () => string;
  setClientId: (raw: string) => { ok: true } | { ok: false; reason: 'format' };
  clearClientId: () => void;
  beginOAuth: (state: string, verifier: string) => void;
};

// Stored verbatim as "<clientId>:<state>"; the callback splits it and needs both halves.
const readPendingReturn = (): string => {
  try {
    return storage('session')?.getItem(STATE_KEY) || '';
  } catch {
    return '';
  }
};

export const useSpotifyCredentialStore = create<SpotifyCredentialState>((set, get) => {
  const initialClientId = readSpotifyClientId();
  return {
    clientId: initialClientId,
    isCustom: Boolean(initialClientId) && initialClientId !== envClientId,
    readPendingReturn,

    setClientId: (raw) => {
      const clientId = raw.trim();
      if (!TOKEN_SHAPE.test(clientId)) return { ok: false, reason: 'format' };
      writeSpotifyClientId(clientId);
      set({ clientId, isCustom: clientId !== envClientId });
      return { ok: true };
    },

    clearClientId: () => {
      writeSpotifyClientId('');
      set({ clientId: envClientId, isCustom: false });
    },

    // The verifier travels with its client ID so the callback knows who to exchange the code with
    // even if the listener edits their Client ID in another tab mid-flow.
    beginOAuth: (state, verifier) => {
      try {
        storage('session')?.setItem(STATE_KEY, `${get().clientId}:${state}`);
        storage('session')?.setItem(SPOTIFY_VERIFIER_KEY, verifier);
      } catch {
        // Without sessionStorage the handshake cannot be verified; beginSpotifyLogin fails loudly.
      }
    },
  };
});
