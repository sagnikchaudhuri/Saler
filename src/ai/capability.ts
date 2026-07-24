// ============================================================================
// Client-side AI capability token.
//
// Fetches a short-lived, server-signed token from a same-origin route and
// caches it until shortly before it expires. The token is opaque and contains
// no secret; it is attached to AI requests (see aiFetch) as a lightweight proof
// that the call came from a real page load of this app.
//
// When the server has no signing secret configured it returns `{ token: null }`
// and everything still works (Demo Mode and local dev need zero setup) — the
// AI routes simply do not require a capability in that mode.
// ============================================================================

const CAPABILITY_ENDPOINT = '/api/ai-capability';
/** Refetch this long before expiry so a token never expires mid-request. */
const REFRESH_MARGIN_MS = 30_000;

interface Cached {
  token: string | null;
  /** Epoch ms after which we should refetch. 0 = refetch immediately. */
  goodUntil: number;
}

let cache: Cached | null = null;
let inflight: Promise<string | null> | null = null;

/** Parse the `${expiry}.${sig}` token to learn when to refresh. */
function expiryOf(token: string): number {
  const dot = token.indexOf('.');
  const n = dot > 0 ? Number(token.slice(0, dot)) : NaN;
  return Number.isFinite(n) ? n : 0;
}

async function fetchToken(fetchImpl: typeof fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(CAPABILITY_ENDPOINT, { method: 'GET' });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const token = (body as { token?: unknown })?.token;
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    // No route / network error → behave as "no capability" (dev-safe).
    return null;
  }
}

/**
 * Current capability token, or null when the server issues none. Cached and
 * de-duplicated: concurrent callers share one in-flight request, and a valid
 * token is reused until just before it expires.
 */
export function getCapability(fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const now = Date.now();
  if (cache && now < cache.goodUntil) return Promise.resolve(cache.token);
  if (inflight) return inflight;

  inflight = fetchToken(fetchImpl)
    .then((token) => {
      const goodUntil =
        token === null ? now + 60_000 : Math.max(now, expiryOf(token) - REFRESH_MARGIN_MS);
      cache = { token, goodUntil };
      return token;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Test helper: forget any cached token. */
export function resetCapabilityCache(): void {
  cache = null;
  inflight = null;
}
