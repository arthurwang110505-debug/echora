import { describe, expect, it } from 'vitest';
import { RateLimiter, SearchCache, buildSearchCacheKey } from './searchCache';

/**
 * The budget these exist to protect is 100 `search.list` calls per day, shared by every user of the
 * deployment, resetting at midnight Pacific. It is not a throttle - when it is gone, search is gone
 * until tomorrow. So the cache and the limiter are not optimisations; they are what makes the
 * feature usable at all.
 */

describe('buildSearchCacheKey', () => {
  it('normalises case and spacing so trivial variants share a cache entry', () => {
    expect(buildSearchCacheKey('  YOASOBI  夜に駆ける ')).toBe(buildSearchCacheKey('yoasobi 夜に駆ける'));
  });

  it('keeps genuinely different queries apart', () => {
    expect(buildSearchCacheKey('夜に駆ける')).not.toBe(buildSearchCacheKey('紅蓮華'));
  });
});

describe('SearchCache', () => {
  it('returns what it stored', () => {
    const cache = new SearchCache();
    cache.set('夜に駆ける', [{ id: 'a' }]);
    expect(cache.get('夜に駆ける')).toEqual([{ id: 'a' }]);
  });

  it('misses for an unknown key', () => {
    expect(new SearchCache().get('nothing')).toBeNull();
  });

  it('expires an entry after its TTL', () => {
    const cache = new SearchCache({ ttlMs: 1000 });
    cache.set('q', 'value', 0);
    expect(cache.get('q', 999)).toBe('value');
    expect(cache.get('q', 1000)).toBeNull();
  });

  it('drops an expired entry so it cannot be revived', () => {
    const cache = new SearchCache({ ttlMs: 1000 });
    cache.set('q', 'value', 0);
    cache.get('q', 2000);
    expect(cache.size).toBe(0);
  });

  it('evicts the least recently used entry, not the oldest inserted', () => {
    // The whole point of an LRU here: a query that keeps being repeated should not be evicted by a
    // stream of one-off queries.
    const cache = new SearchCache({ maxEntries: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // 'a' is now more recently used than 'b'
    cache.set('c', 3);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeNull();
    expect(cache.get('c')).toBe(3);
  });

  it('never grows past its cap', () => {
    const cache = new SearchCache({ maxEntries: 3 });
    for (let index = 0; index < 50; index += 1) cache.set(`q${index}`, index);
    expect(cache.size).toBe(3);
  });

  it('treats a re-set of the same key as one entry', () => {
    const cache = new SearchCache();
    cache.set('q', 1);
    cache.set('q', 2);
    expect(cache.size).toBe(1);
    expect(cache.get('q')).toBe(2);
  });
});

describe('RateLimiter', () => {
  it('allows up to the limit inside one window', () => {
    const limiter = new RateLimiter({ limit: 3, windowMs: 60_000 });
    expect(limiter.take('client', 0).allowed).toBe(true);
    expect(limiter.take('client', 1).allowed).toBe(true);
    expect(limiter.take('client', 2).allowed).toBe(true);
  });

  it('rejects past the limit and says how long to wait', () => {
    const limiter = new RateLimiter({ limit: 2, windowMs: 60_000 });
    limiter.take('client', 0);
    limiter.take('client', 1);
    const rejected = limiter.take('client', 30_000);

    expect(rejected.allowed).toBe(false);
    // 30 s left, reported in seconds.
    expect(rejected.retryAfterSeconds).toBe(30);
  });

  it('resets once the window is over', () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.take('client', 0).allowed).toBe(true);
    expect(limiter.take('client', 500).allowed).toBe(false);
    expect(limiter.take('client', 1000).allowed).toBe(true);
  });

  it('counts each client separately', () => {
    // One browser must not be able to spend a shared budget that belongs to everyone.
    const limiter = new RateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.take('client-a', 0).allowed).toBe(true);
    expect(limiter.take('client-a', 0).allowed).toBe(false);
    expect(limiter.take('client-b', 0).allowed).toBe(true);
  });

  it('reports at least one second so the UI never says "retry in 0 seconds"', () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 60_000 });
    limiter.take('client', 0);
    // 59,999 ms remaining rounds to 60 s; a sub-second remainder must not round to 0.
    expect(limiter.take('client', 59_999).retryAfterSeconds).toBe(1);
  });
});
