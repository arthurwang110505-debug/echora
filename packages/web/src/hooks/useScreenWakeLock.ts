// packages/web/src/hooks/useScreenWakeLock.ts
//
// Keeps the screen awake while the stage is playing.
//
// This is the feature's own premise: Echora exists to be watched while listening, which on a phone
// or an iPad means the screen is left alone for three minutes at a time. Without a wake lock the
// display dims after ~30 s and locks after a minute, and the "immersive lyric stage" is over.
//
// Three things make this less trivial than calling `navigator.wakeLock.request('screen')`:
//
//   1. The lock is released by the browser whenever the page is hidden - switching tabs, locking the
//      phone, opening the share sheet. It has to be re-requested on `visibilitychange`, and the API
//      gives no event for "it came back", only a promise that resolves to a new sentinel.
//   2. The request fails with a `NotAllowedError` for reasons the app cannot see: low battery, the
//      OS refusing while in the background, or a browser that has opted out. Failure has to be a
//      quiet no-op, not an error state - the app works fine without it.
//   3. Concurrent requests multiply sentinels. Only one may be held, and the old one must be
//      released first, or the screen keeps a lock nobody can release.
//
// The hook holds no React state for the sentinel: it is a piece of imperative browser state, and
// putting it in state would re-render the player on every tab switch.

import { useEffect, useRef } from 'react';

type WakeLockSentinel = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: 'release', listener: () => void) => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> };
};

export interface ScreenWakeLockOptions {
  /** Hold the lock only while this is true (playing, and on the stage). */
  enabled: boolean;
  /** Injectable for tests; defaults to the real API when the browser has one. */
  requestWakeLock?: () => Promise<WakeLockSentinel>;
}

/** Whether the browser can keep the screen on at all. */
export const supportsWakeLock = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return typeof (navigator as WakeLockNavigator).wakeLock?.request === 'function';
};

export const useScreenWakeLock = ({ enabled, requestWakeLock }: ScreenWakeLockOptions): void => {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const request = requestWakeLock ?? (() => {
      const api = (navigator as WakeLockNavigator).wakeLock;
      if (!api) return Promise.reject(new Error('wake lock unsupported'));
      return api.request('screen');
    });

    let disposed = false;

    const release = () => {
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => undefined);
    };

    const acquire = async () => {
      if (disposed || !enabledRef.current) return;
      // Never hold two: two sentinels mean two locks, and releasing the one we remember leaves the
      // other keeping the screen on for a tab that has stopped playing.
      if (sentinelRef.current && !sentinelRef.current.released) return;
      if (document.visibilityState !== 'visible') return;
      try {
        const sentinel = await request();
        if (disposed || !enabledRef.current) {
          // The page moved on while the promise was in flight. Releasing here is the only way to
          // avoid a lock that outlives the reason it was taken.
          if (!sentinel.released) void sentinel.release().catch(() => undefined);
          return;
        }
        sentinelRef.current = sentinel;
        // The browser can drop the lock on its own; clear the reference so the next visibility
        // change re-acquires rather than believing it still holds one.
        sentinel.addEventListener?.('release', () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null;
        });
      } catch {
        // Refused: low battery, a backgrounded tab, an unsupported context. Not an error the user
        // can act on, and the app is fully usable without it.
        sentinelRef.current = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void acquire();
      } else {
        // The browser already released it; drop our reference so we do not try to release it twice.
        sentinelRef.current = null;
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    void acquire();

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      release();
    };
  }, [enabled, requestWakeLock]);
};
