// packages/web/src/api/limits.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DailyCeiling, RateLimiter, clientKey } from '@api/_lib/limits';

afterEach(() => { vi.useRealTimers(); });

describe('RateLimiter', () => {
  it('allows up to the limit, then refuses', () => {
    const limiter = new RateLimiter(2, 60_000);
    expect(limiter.take('a').allowed).toBe(true);
    expect(limiter.take('a').allowed).toBe(true);
    expect(limiter.take('a').allowed).toBe(false);
  });

  it('keeps one client from spending another one\'s allowance', () => {
    const limiter = new RateLimiter(1, 60_000);
    expect(limiter.take('a').allowed).toBe(true);
    expect(limiter.take('b').allowed).toBe(true);
  });

  it('reports how long to wait', () => {
    const limiter = new RateLimiter(1, 60_000);
    limiter.take('a', 1_000_000);
    const { retryAfterSeconds } = limiter.take('a', 1_030_000);
    expect(retryAfterSeconds).toBe(30);
  });

  it('forgets the window once it has passed', () => {
    const limiter = new RateLimiter(1, 60_000);
    limiter.take('a', 1_000_000);
    expect(limiter.take('a', 1_061_000).allowed).toBe(true);
  });
});

describe('DailyCeiling', () => {
  it('stops allowing once the day is spent, however reasonable each request looked', () => {
    const ceiling = new DailyCeiling(3);
    const at = new Date('2026-11-09T10:00:00Z');
    expect([ceiling.take(at), ceiling.take(at), ceiling.take(at)]).toEqual([true, true, true]);
    expect(ceiling.take(at)).toBe(false);
  });

  it('starts over on the next UTC day', () => {
    const ceiling = new DailyCeiling(1);
    expect(ceiling.take(new Date('2026-11-09T23:59:00Z'))).toBe(true);
    expect(ceiling.take(new Date('2026-11-09T23:59:30Z'))).toBe(false);
    expect(ceiling.take(new Date('2026-11-10T00:00:30Z'))).toBe(true);
  });

  it('reports what is left', () => {
    const ceiling = new DailyCeiling(2);
    const at = new Date('2026-11-09T10:00:00Z');
    expect(ceiling.remaining(at)).toBe(2);
    ceiling.take(at);
    expect(ceiling.remaining(at)).toBe(1);
  });
});

describe('clientKey', () => {
  it('takes the first address of a forwarded chain', () => {
    expect(clientKey({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }, 'unknown')).toBe('1.2.3.4');
  });

  it('falls back when there is no header', () => {
    expect(clientKey({}, 'unknown')).toBe('unknown');
  });
});
