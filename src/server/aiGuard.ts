import type { RateLimiter } from './rateLimit';
import { verifyCapability } from './capability';

// ============================================================================
// Shared abuse guard for the AI routes. Runs BEFORE any model call so a route
// can never become an open, unmetered proxy. Framework-agnostic and pure so it
// is unit-tested directly and shared by the Vercel adapter and the Vite dev
// middleware — the two can never drift.
//
// Three layers, defence in depth:
//   1. Rate limit      per client id (best-effort; see note below).
//   2. Same-origin     reject clearly cross-origin browser requests.
//   3. Capability      require a valid server-signed token WHEN a signing
//                      secret is configured (dev-safe when it is not).
//
// SERVERLESS LIMITATION (documented, not hidden): the rate limiter is in-memory
// and per-instance. On a serverless platform each instance keeps its own
// counters, so this bounds a single hot instance, not the whole deployment. It
// is a runaway-loop guard, not a distributed quota, and is written to be
// swapped for a shared store (e.g. Redis) without touching call sites.
// ============================================================================

const GENERIC = 'The AI service is temporarily unavailable.';
const GENERIC_FORBIDDEN = 'Request not allowed.';

export interface GuardHeaders {
  host?: string;
  origin?: string;
  referer?: string;
  /** The x-saler-capability header, if any. */
  capability?: string;
  /** Best-effort client identity (first x-forwarded-for hop, or 'local'). */
  clientId?: string;
}

export interface GuardDeps {
  rateLimiter?: RateLimiter;
  /** When set, a valid capability token is required. When unset, dev-safe. */
  capabilitySecret?: string;
  now?: () => number;
}

export type GuardResult =
  | { ok: true }
  | { ok: false; status: number; code: 'AI_UNAVAILABLE' | 'INVALID_REQUEST'; message: string };

function host(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Same-origin policy.
 *
 *   Origin present   → its host must equal the request Host.
 *   Origin absent,
 *   Referer present  → the Referer's host must equal the request Host.
 *   Both absent      → ALLOWED. Same-origin server-side and test clients
 *                      legitimately omit both; treating that as malicious would
 *                      break them. Browsers always send at least one on a
 *                      cross-origin POST, so a genuinely cross-origin page is
 *                      still caught.
 *   Host absent      → cannot evaluate; allowed (do not block on missing Host).
 */
export function checkSameOrigin(
  origin: string | undefined,
  referer: string | undefined,
  hostHeader: string | undefined,
): boolean {
  const reqHost = hostHeader?.toLowerCase();
  if (!reqHost) return true;
  const o = host(origin);
  if (o !== null) return o === reqHost;
  const r = host(referer);
  if (r !== null) return r === reqHost;
  return true;
}

export function guardAiRequest(h: GuardHeaders, deps: GuardDeps): GuardResult {
  // 1. Rate limit — cheapest check first.
  if (deps.rateLimiter && !deps.rateLimiter.check(h.clientId || 'local')) {
    return { ok: false, status: 429, code: 'AI_UNAVAILABLE', message: GENERIC };
  }
  // 2. Same-origin.
  if (!checkSameOrigin(h.origin, h.referer, h.host)) {
    return { ok: false, status: 403, code: 'INVALID_REQUEST', message: GENERIC_FORBIDDEN };
  }
  // 3. Capability — only enforced when a signing secret is configured.
  if (deps.capabilitySecret) {
    const now = deps.now?.() ?? Date.now();
    if (!verifyCapability(deps.capabilitySecret, h.capability, now)) {
      return { ok: false, status: 401, code: 'AI_UNAVAILABLE', message: GENERIC };
    }
  }
  return { ok: true };
}
