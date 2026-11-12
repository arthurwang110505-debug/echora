// packages/web/src/lib/swUpdateGate.test.ts
//
// The rule: a deploy must never take the page away from someone who is listening. The reload is
// deferred, not skipped - it happens at the first idle moment after playback stops.
import { describe, expect, it, vi } from 'vitest';
import { createUpdateGate, isBusyPlaying } from './swUpdateGate';

/** A controllable player: `set` drives the subscription, `reload` records the effect. */
const harness = (initial = { isPlaying: false, playbackState: 'paused' }, settleMs = 4_000) => {
  let state = initial;
  const listeners = new Set<() => void>();
  const reload = vi.fn();
  let clock = 1_000_000;
  let timers: Array<{ at: number; callback: () => void; id: number }> = [];
  let nextId = 1;

  const gate = createUpdateGate({
    getState: () => state,
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reload,
    settleMs,
    now: () => clock,
    setTimeoutImpl: (callback, ms) => {
      const id = nextId++;
      timers.push({ at: clock + ms, callback, id });
      return id;
    },
    clearTimeoutImpl: (handle) => {
      timers = timers.filter(timer => timer.id !== handle);
    },
  });

  return {
    gate,
    reload,
    set: (next: typeof initial) => {
      state = next;
      listeners.forEach(listener => listener());
    },
    advance: (ms: number) => {
      clock += ms;
      // Fire due timers in order, as the event loop would.
      const due = timers.filter(timer => timer.at <= clock).sort((a, b) => a.at - b.at);
      timers = timers.filter(timer => timer.at > clock);
      due.forEach(timer => timer.callback());
    },
    pendingTimers: () => timers.length,
  };
};

describe('isBusyPlaying', () => {
  it('counts playing, loading and buffering as busy', () => {
    expect(isBusyPlaying({ isPlaying: true, playbackState: 'playing' })).toBe(true);
    expect(isBusyPlaying({ isPlaying: false, playbackState: 'loading' })).toBe(true);
    expect(isBusyPlaying({ isPlaying: false, playbackState: 'buffering' })).toBe(true);
  });

  it('treats paused and ended as idle', () => {
    expect(isBusyPlaying({ isPlaying: false, playbackState: 'paused' })).toBe(false);
    expect(isBusyPlaying({ isPlaying: false, playbackState: 'ended' })).toBe(false);
  });
});

describe('createUpdateGate', () => {
  it('reloads at once when nothing is playing', () => {
    const h = harness();
    h.gate.markPending();
    expect(h.reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload in the middle of a song', () => {
    const h = harness({ isPlaying: true, playbackState: 'playing' });
    h.gate.markPending();
    expect(h.reload).not.toHaveBeenCalled();
  });

  it('reloads once playback stops and the settle window passes', () => {
    const h = harness({ isPlaying: true, playbackState: 'playing' });
    h.gate.markPending();

    h.set({ isPlaying: false, playbackState: 'paused' });
    expect(h.reload).not.toHaveBeenCalled();

    h.advance(4_000);
    expect(h.reload).toHaveBeenCalledTimes(1);
  });

  it('waits again if the user starts the next track during the settle window', () => {
    const h = harness({ isPlaying: true, playbackState: 'playing' });
    h.gate.markPending();
    h.set({ isPlaying: false, playbackState: 'paused' });
    h.advance(2_000);

    // Pressed play on the next track: the pending reload must not fire underneath it.
    h.set({ isPlaying: true, playbackState: 'playing' });
    h.advance(10_000);
    expect(h.reload).not.toHaveBeenCalled();

    // And it is still pending, not dropped.
    h.set({ isPlaying: false, playbackState: 'paused' });
    h.advance(4_000);
    expect(h.reload).toHaveBeenCalledTimes(1);
  });

  it('reloads only once even if several updates land', () => {
    const h = harness({ isPlaying: true, playbackState: 'playing' });
    h.gate.markPending();
    h.gate.markPending();
    h.set({ isPlaying: false, playbackState: 'paused' });
    h.advance(4_000);
    expect(h.reload).toHaveBeenCalledTimes(1);
  });

  it('stops watching after dispose', () => {
    const h = harness({ isPlaying: true, playbackState: 'playing' });
    h.gate.markPending();
    h.gate.dispose();
    h.set({ isPlaying: false, playbackState: 'paused' });
    h.advance(10_000);
    expect(h.reload).not.toHaveBeenCalled();
    expect(h.pendingTimers()).toBe(0);
  });
});
