// A typed request layer for the YouTube Data API.
//
// The provider used to call `fetch` directly, which meant a failed request was
// indistinguishable from any other failed promise: no timeout, no way to tell
// "the token expired" from "Google is briefly down" from "this project never
// enabled the API", and no retry for the one class of failure (5xx, 429) where
// a retry is both safe and likely to work. Everything downstream then had to
// pattern-match on the error message, so `playerStore` decided whether to log
// the user out by calling `.includes('授權已失效')` on a copy string.
//
// `YouTubeApiError` carries the facts the UI actually needs: the status, the
// machine-readable reason Google returns in `error.errors[0].reason`, and
// whether trying again could plausibly help.

/** Google's machine-readable failure reasons, as used by the Data API. */
export type YouTubeErrorReason = string;

export interface YouTubeApiErrorInit {
  status: number;
  reason?: YouTubeErrorReason | null;
  /** The URL that failed, for diagnostics. Never surfaced to the user verbatim. */
  url?: string;
  /** Set when the request never produced a response (abort, DNS, offline). */
  cause?: unknown;
}

/**
 * Whether this failure class is worth retrying.
 *
 * Only transport failures and explicit "the server is busy" statuses qualify.
 * A 401 or 403 is a durable answer about this token/project/account: retrying
 * it burns quota and delays the message the user needs to see.
 */
export const isRetryableYouTubeFailure = (status: number): boolean => (
  status === 429 || status === 408 || (status >= 500 && status <= 599)
);

export class YouTubeApiError extends Error {
  readonly status: number;
  readonly reason: YouTubeErrorReason | null;
  readonly url?: string;
  readonly retryable: boolean;

  constructor(message: string, init: YouTubeApiErrorInit) {
    super(message);
    this.name = 'YouTubeApiError';
    this.status = init.status;
    this.reason = init.reason ?? null;
    this.url = init.url;
    this.retryable = isRetryableYouTubeFailure(init.status);
  }

  /**
   * The authorization is gone and only a fresh sign-in fixes it.
   *
   * `invalid_grant` shows up on token exchanges; the Data API itself answers a
   * dead token with a bare 401, which is why the status carries the decision.
   */
  get isAuthFailure(): boolean {
    return this.status === 401 || this.reason === 'invalid_grant';
  }

  /**
   * The request was understood and refused for a reason the user can act on
   * (API not enabled, quota exhausted, Workspace account restriction).
   *
   * These must never clear the stored session: the token is fine, the project
   * or the account is what needs attention.
   */
  get isConfigurationFailure(): boolean {
    return this.status === 403;
  }
}

export const isYouTubeApiError = (error: unknown): error is YouTubeApiError => (
  error instanceof YouTubeApiError
);

const REASON_PATTERN = /^YouTube API failed: (\d{3})(?: \(([^)]*)\))?$/;

/**
 * Rebuilds the structured facts from the historical message format
 * (`YouTube API failed: 403 (accessNotConfigured)`).
 *
 * That format is part of the current surface: existing tests assert on it and
 * `playerStore` parses it. Anything that only has a message string can recover
 * status and reason through this, so the move to typed errors does not have to
 * happen in a single commit.
 */
export const parseYouTubeApiErrorMessage = (message: string): { status: number; reason: string | null } | null => {
  const match = REASON_PATTERN.exec(message.trim());
  if (!match) return null;
  const status = Number(match[1]);
  if (!Number.isFinite(status)) return null;
  return { status, reason: match[2] || null };
};

// --- request execution ------------------------------------------------------

export interface YouTubeRequestOptions {
  /** Bearer token. Omit for key-only requests. */
  accessToken?: string | null;
  /** Overrides the default timeout; mainly for tests and long playlist syncs. */
  timeoutMs?: number;
  /** Maximum retries after the first attempt. Default 1. */
  maxRetries?: number;
  /** Base backoff in ms; doubles per attempt. Default 400. */
  backoffMs?: number;
  /** Caller-owned cancellation (unmount, superseded request). */
  signal?: AbortSignal;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  /** Injected for tests; avoids real waiting. */
  sleepImpl?: (ms: number) => Promise<void>;
}

export const YOUTUBE_REQUEST_TIMEOUT_MS = 8000;

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const readReason = async (response: Response): Promise<string | null> => {
  try {
    const payload = await response.json() as {
      error?: { errors?: Array<{ reason?: string }>; status?: string };
    };
    const reason = payload.error?.errors?.[0]?.reason;
    if (typeof reason === 'string' && reason) return reason;
    const status = payload.error?.status;
    return typeof status === 'string' && status ? status : null;
  } catch {
    // A non-JSON body (proxy error page, empty 5xx) carries no reason.
    return null;
  }
};

const buildFailureMessage = (status: number, reason: string | null) => (
  `YouTube API failed: ${status}${reason ? ` (${reason})` : ''}`
);

/**
 * Performs one YouTube Data API request and returns the parsed JSON body.
 *
 * Retries at most `maxRetries` times, and only for failures where the request
 * never reached the application logic or where Google explicitly said to come
 * back later. An abort originating from the caller's own signal is rethrown
 * untouched so callers can distinguish "I cancelled this" from "this timed
 * out"; only our own timeout becomes a `YouTubeApiError`.
 */
export async function requestYouTubeJson<T>(url: string, options: YouTubeRequestOptions = {}): Promise<T> {
  const {
    accessToken,
    timeoutMs = YOUTUBE_REQUEST_TIMEOUT_MS,
    maxRetries = 1,
    backoffMs = 400,
    signal,
    fetchImpl = typeof fetch === 'function' ? fetch : undefined,
    sleepImpl = defaultSleep,
  } = options;

  if (!fetchImpl) throw new Error('fetch is not available in this environment');

  let attempt = 0;

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onCallerAbort = () => controller.abort();
    signal?.addEventListener('abort', onCallerAbort);

    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      if (!response.ok) {
        const reason = await readReason(response);
        throw new YouTubeApiError(buildFailureMessage(response.status, reason), {
          status: response.status,
          reason,
          url,
        });
      }

      return await response.json() as T;
    } catch (error) {
      // The caller cancelled: not ours to retry, and not ours to relabel.
      if (signal?.aborted) throw error;

      if (error instanceof YouTubeApiError) {
        if (!error.retryable || attempt >= maxRetries) throw error;
      } else if (error instanceof Error && error.name === 'AbortError') {
        // Our own timeout. Transport-shaped, so it is retryable.
        if (attempt >= maxRetries) {
          throw new YouTubeApiError(`YouTube API request timed out after ${timeoutMs}ms`, {
            status: 0,
            reason: 'timeout',
            url,
          });
        }
      } else if (attempt >= maxRetries) {
        // DNS failure, offline, CORS rejection: transport-shaped, retryable.
        throw new YouTubeApiError(
          `YouTube API request failed: ${error instanceof Error ? error.message : String(error)}`,
          { status: 0, reason: 'network', url, cause: error },
        );
      }

      attempt += 1;
      await sleepImpl(backoffMs * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onCallerAbort);
    }
  }

  // The loop always returns or throws; this keeps TypeScript satisfied.
  throw new Error('YouTube API request failed');
}
