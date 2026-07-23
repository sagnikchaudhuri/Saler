// Best-effort in-memory rate limiting.
//
// Serverless instances are ephemeral, so this is a cheap guard against runaway
// loops from a single client rather than a security control. Documented as
// such deliberately — it is not a substitute for real infrastructure limits.

export interface RateLimiter {
  /** Returns true when the request is allowed. */
  check(key: string): boolean;
}

export function createRateLimiter(
  options: { limit?: number; windowMs?: number; now?: () => number } = {},
): RateLimiter {
  const limit = options.limit ?? 20;
  const windowMs = options.windowMs ?? 60_000;
  const now = options.now ?? Date.now;
  const hits = new Map<string, number[]>();

  return {
    check(key: string): boolean {
      const t = now();
      const cutoff = t - windowMs;
      const recent = (hits.get(key) ?? []).filter((ts) => ts > cutoff);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.set(key, recent);
      return true;
    },
  };
}
