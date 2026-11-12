// packages/web/src/lib/swUpdateGate.ts
//
// When a new service worker takes control, the page has to reload to run the new build - but only
// when reloading is free.
//
// `registerType: 'autoUpdate'` plus `skipWaiting` + `clientsClaim` means a deploy takes over every
// open tab immediately, and the `controllerchange` listener in main.tsx reloaded the page right
// then. Two things break when that happens mid-song:
//
//   * playback stops. A reload is a new audio element, a new YouTube iframe, a new everything.
//   * the YouTube session is lost. Its token is deliberately memory-only (see youtubeAuth.ts), so
//     the user has to go through the Google popup again.
//
// So the reload waits for a moment when nothing is playing. The update is not skipped - the new
// worker is already in control, and `shouldReloadNow` is checked again on every state change - it
// is only *deferred* until the player is idle.

export interface ReloadGateState {
  isPlaying: boolean;
  /** A seek or a track change in flight is just as bad a moment to yank the page away. */
  playbackState?: string;
}

/**
 * Whether reloading right now would interrupt something the user is listening to.
 *
 * Deliberately conservative: `loading` and `buffering` count as in-use because the user has pressed
 * play and is waiting, and reloading then looks like a bug rather than an update.
 */
export const isBusyPlaying = ({ isPlaying, playbackState }: ReloadGateState): boolean =>
  isPlaying || playbackState === 'loading' || playbackState === 'buffering';

/**
 * Registers the reload-on-update behaviour and returns a disposer.
 *
 * `onIdle` is called with the pending reload when the player becomes idle, and the caller decides
 * whether to apply it - keeping the decision out of the module makes this testable without a DOM.
 */
export const createUpdateGate = (options: {
  /** Current player state, read at the moment the decision is needed. */
  getState: () => ReloadGateState;
  /** Subscribes to player state changes; returns an unsubscribe. */
  subscribe: (listener: () => void) => () => void;
  /** Performs the reload. Injected so a test never navigates. */
  reload: () => void;
  /** A pause this long after playback stops, so a between-tracks gap does not count as idle. */
  settleMs?: number;
  now?: () => number;
  setTimeoutImpl?: (callback: () => void, ms: number) => number;
  clearTimeoutImpl?: (handle: number) => void;
}): { markPending: () => void; dispose: () => void } => {
  const settleMs = options.settleMs ?? 4_000;
  const now = options.now ?? (() => Date.now());
  const setTimer = options.setTimeoutImpl ?? ((callback, ms) => window.setTimeout(callback, ms));
  const clearTimer = options.clearTimeoutImpl ?? ((handle) => window.clearTimeout(handle));

  let pending = false;
  let settleTimer: number | null = null;
  let lastBusyAt = 0;

  const clearSettle = () => {
    if (settleTimer !== null) {
      clearTimer(settleTimer);
      settleTimer = null;
    }
  };

  const maybeReload = () => {
    if (!pending) return;
    if (isBusyPlaying(options.getState())) {
      // Remember when it was last busy, so the settle window is measured from the moment playback
      // actually stopped rather than from when the update arrived.
      lastBusyAt = now();
      clearSettle();
      return;
    }
    if (now() - lastBusyAt < settleMs) return;
    pending = false;
    clearSettle();
    options.reload();
  };

  const unsubscribe = options.subscribe(() => {
    if (!pending) return;
    if (isBusyPlaying(options.getState())) {
      lastBusyAt = now();
      clearSettle();
      return;
    }
    // Idle now: give the user a beat to start the next track before taking the page away.
    if (settleTimer === null) {
      settleTimer = setTimer(maybeReload, settleMs);
    }
  });

  return {
    markPending: () => {
      if (pending) return;
      pending = true;
      // Only a *busy* player starts the settle clock. An idle one reloads immediately, which is
      // the whole point: no reason to make an idle tab wait for an update it is not disturbing.
      if (isBusyPlaying(options.getState())) lastBusyAt = now();
      maybeReload();
    },
    dispose: () => {
      pending = false;
      clearSettle();
      unsubscribe();
    },
  };
};
