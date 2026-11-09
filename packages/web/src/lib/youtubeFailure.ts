// packages/web/src/lib/youtubeFailure.ts
//
// Turning a YouTube failure into something a screen can render.
//
// The old store composed user-facing sentences itself, in Traditional Chinese, inline. That had
// three costs, all of which showed up in practice:
//
//   1. **No translation.** The English build showed Chinese error text. Every other string in the
//      app went through i18n; these could not, because they were assembled in a zustand action.
//   2. **No layout control.** The 403 copy ran past a hundred characters, which is unreadable on a
//      phone - exactly where it is most likely to be seen. A string cannot be shortened by the
//      component that knows how much room it has.
//   3. **Behaviour coupled to copy.** Whether a session was deleted used to depend on matching a
//      sentence of this text. That was fixed separately, but it was a symptom of the same design.
//
// So a failure is now a *value*: a small code plus optional detail, translated at render time. The
// code is the part other code branches on; the sentence is the part a human reads, and they are no
// longer the same thing.

export type YouTubeFailureCode =
  /** No access token: the user must connect before anything can happen. */
  | 'not_connected'
  /** The token was revoked or expired. Only a fresh sign-in fixes it. */
  | 'auth_expired'
  /** Google rejected the call for a reason about the project, not the account. */
  | 'api_disabled'
  /** The daily Data API quota is spent; it resets at midnight Pacific. */
  | 'quota_exceeded'
  /** A managed Workspace account cannot use the Data API. */
  | 'account_forbidden'
  /** A 403 that matches none of the specific reasons above. */
  | 'access_denied'
  /** Today's search allowance is spent - the proxy's own limiter, not Google's quota. */
  | 'search_limited'
  /** The request never reached Google, or Google answered 5xx. */
  | 'upstream_unavailable'
  /** The player itself refused the video. */
  | 'player_error'
  /** The video ID was missing or not playable. */
  | 'no_playable_video'
  /** The song has no title to search with. */
  | 'missing_query'
  /** Signed in, but the account has no playlists YouTube will return. */
  | 'empty_library'
  /** Configuration is missing rather than the request failing. */
  | 'misconfigured'
  /** Anything not classified above. */
  | 'unknown';

export interface YouTubeFailure {
  code: YouTubeFailureCode;
  /**
   * Extra context for the message, never a full sentence.
   *
   * Kept small and untranslated on purpose: a status number, a reason string from Google, a count.
   * Short enough to append to a translated message without breaking the line.
   */
  detail?: string;
}

/** Messages the user can act on, and which action. Used to pick the button, not the words. */
export type YouTubeFailureAction = 'connect' | 'retry' | 'open_console' | 'none';

/**
 * The action a screen should offer for a failure.
 *
 * Separate from the message so that copy can change without changing what the UI does, and so two
 * screens showing the same failure offer the same next step.
 */
export const resolveFailureAction = (code: YouTubeFailureCode): YouTubeFailureAction => {
  switch (code) {
    case 'not_connected':
    case 'auth_expired':
      return 'connect';
    case 'upstream_unavailable':
    case 'player_error':
    case 'unknown':
      return 'retry';
    case 'api_disabled':
    case 'quota_exceeded':
    case 'account_forbidden':
      return 'open_console';
    case 'no_playable_video':
    case 'missing_query':
    case 'misconfigured':
    case 'access_denied':
    case 'search_limited':
    case 'empty_library':
      return 'none';
  }
};

/** i18n key for a failure code. Total by construction, so no screen has to invent a fallback. */
export const failureMessageKey = (code: YouTubeFailureCode): string => `youtubeFailure.${code}`;

/**
 * Attaches a hint key for failures whose message is a dead end on its own.
 *
 * `api_disabled` says the API is not enabled; the hint says which console page. Only codes whose
 * remedy is not obvious get one.
 */
export const failureHintKey = (code: YouTubeFailureCode): string | null => {
  switch (code) {
    case 'api_disabled':
      return 'youtubeFailure.hintApiDisabled';
    case 'quota_exceeded':
      return 'youtubeFailure.hintQuota';
    case 'account_forbidden':
      return 'youtubeFailure.hintForbidden';
    case 'search_limited':
      return 'youtubeFailure.hintSearchLimited';
    case 'empty_library':
      return 'youtubeFailure.hintEmptyLibrary';
    default:
      return null;
  }
};
