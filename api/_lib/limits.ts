// api/_lib/limits.ts
//
// Rate limiting for the API routes, in one place.
//
// ## What this is and is not
//
// The buckets are in memory, per serverless instance. That is a real limitation the review called
// out and it is not fixable here: Vercel runs as many instances as it likes, a cold start begins
// with empty buckets, and two concurrent instances each think the caller has used zero requests. So
// this bounds *bursts from one client hitting one instance*, which is worth having, and it does not
// bound anything a determined caller does.
//
// What actually protects the budget is the daily ceiling below: a number that is small enough that
// burning it costs the attacker more effort than it costs us money, and that resets on a clock
// rather than on an instance lifecycle. It is still per-instance, so the real ceiling is
// `instances × ceiling` - which is why the ceiling is set low.
//
// The defensible setup is Vercel Firewall's rate limit in front of all of this. That is a dashboard
// change, not a code change; `docs/api-rate-limits.md` records what to set.

/** A fixed-window counter: `max` events per `windowMs`, keyed by client. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowMs: number;

  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }

  /** Records an attempt. `retryAfterSeconds` is meaningful only when it is refused. */
  take(key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    const recent = (this.hits.get(key) || []).filter(at => now - at < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      const oldest = recent[0] ?? now;
      const retryAfterSeconds = Math.max(1, Math.ceil((this.windowMs - (now - oldest)) / 1000));
      return { allowed: false, retryAfterSeconds };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** Test seam: instance state is process-wide. */
  reset(): void {
    this.hits.clear();
  }
}

/**
 * A daily ceiling on how many upstream generations this instance will ever perform.
 *
 * Separate from `RateLimiter` because it answers a different question. The rate limiter says "this
 * caller is asking too fast"; this says "this deployment has spent its allowance for today", which
 * must hold even when the traffic looks perfectly reasonable - many callers, each well within their
 * per-client limit, is exactly the shape of the attack that empties a paid balance.
 *
 * The window is a UTC day. It resets on wall-clock time, not on process lifetime, *within* an
 * instance; a new instance starts a fresh ceiling, which is the accepted cost of keeping this
 * dependency-free. Set the number low: it multiplies by the number of live instances.
 */
export class DailyCeiling {
  private day = '';
  private used = 0;
  private readonly max: number;

  constructor(max: number) {
    this.max = max;
  }

  private static today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** `true` when there is budget left; consumes one unit when it returns true. */
  take(now = new Date()): boolean {
    const today = now.toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.used = 0;
    }
    if (this.used >= this.max) return false;
    this.used += 1;
    return true;
  }

  /** How many remain, for the health surface and for tests. */
  remaining(now = new Date()): number {
    if (now.toISOString().slice(0, 10) !== this.day) return this.max;
    return Math.max(0, this.max - this.used);
  }

  reset(): void {
    this.day = DailyCeiling.today();
    this.used = 0;
  }
}

/** Best-effort client identity. Spoofable by design - it stops a browser, not an adversary. */
export const clientKey = (headers: Record<string, string | string[] | undefined>, fallback: string): string => {
  const forwarded = headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = (raw || '').split(',')[0]?.trim();
  return first || fallback;
};
