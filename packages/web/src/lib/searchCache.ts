// packages/web/src/lib/searchCache.ts
//
// The server-side cache in front of the YouTube search quota.
//
// `search.list` has a hard budget: 100 calls per day, in its own bucket, resets at midnight PT. That
// number is not a soft limit - when it is gone, search simply stops working until the next day. And
// on this app it is spent fastest by the least useful requests: the same song searched twice, a
// query typed one character at a time, a retry after a reload.
//
// Two mechanisms, and they solve different problems:
//
//   - An LRU + TTL **cache** makes a repeated identical query free. This is what turns a 100/day
//     budget into something that survives normal use: a household with a handful of songs searches
//     the same titles repeatedly.
//   - A per-client **rate limit** bounds how fast distinct queries can burn the shared budget, so
//     one client cannot consume the day's allowance in a minute and leave everyone else with none.
//
// Both are in-memory, so they reset when the serverless instance does. That is a deliberate
// limitation, not an oversight: a shared store (Redis, KV) costs money and a new dependency for a
// feature whose entire problem is "the free tier is small", and a cold start losing its cache only
// means one extra upstream call.

/** How long an identical query may be served from cache. */
export const SEARCH_CACHE_TTL_MS = 60_000;
/** How many distinct queries one instance remembers. */
export const SEARCH_CACHE_MAX_ENTRIES = 100;
/** Distinct queries one client may make per window. */
export const SEARCH_RATE_LIMIT = 20;
export const SEARCH_RATE_WINDOW_MS = 60_000;

interface CacheEntry { expiresAt: number; value: unknown; }

/**
 * A Map used as an LRU.
 *
 * `Map` preserves insertion order, so re-inserting on read moves an entry to the "most recently
 * used" end and the first key is always the eviction candidate. That is the whole implementation
 * and it is why no dependency is needed.
 */
export class SearchCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(options: { ttlMs?: number; maxEntries?: number } = {}) {
    this.ttlMs = options.ttlMs ?? SEARCH_CACHE_TTL_MS;
    this.maxEntries = options.maxEntries ?? SEARCH_CACHE_MAX_ENTRIES;
  }

  get(key: string, now = Date.now()): unknown | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return null;
    }
    // Re-insert to mark it as most recently used.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: unknown, now = Date.now()) {
    this.entries.delete(key);
    this.entries.set(key, { expiresAt: now + this.ttlMs, value });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  get size() { return this.entries.size; }
  clear() { this.entries.clear(); }
}

interface RateState { count: number; resetAt: number; }

/**
 * A fixed-window counter per client.
 *
 * Fixed windows allow a burst across the boundary (20 at 59 s and 20 at 61 s). Accepted: the purpose
 * is to stop one client draining a 100-call day, and an exact limit would need a sliding log for a
 * risk that does not justify it.
 */
export class RateLimiter {
  private readonly state = new Map<string, RateState>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(options: { limit?: number; windowMs?: number } = {}) {
    this.limit = options.limit ?? SEARCH_RATE_LIMIT;
    this.windowMs = options.windowMs ?? SEARCH_RATE_WINDOW_MS;
  }

  /** Records one request and reports whether it is allowed. */
  take(clientKey: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    const existing = this.state.get(clientKey);
    if (!existing || existing.resetAt <= now) {
      this.state.set(clientKey, { count: 1, resetAt: now + this.windowMs });
      this.sweep(now);
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (existing.count >= this.limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
    }
    existing.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** Drops expired client records so the map does not grow without bound. */
  private sweep(now: number) {
    if (this.state.size < 500) return;
    for (const [key, value] of this.state) {
      if (value.resetAt <= now) this.state.delete(key);
    }
  }
}

/** The normalised cache key for a query: case and spacing should not each cost a call. */
export const buildSearchCacheKey = (query: string): string => query.trim().toLowerCase().replace(/\s+/g, ' ');
