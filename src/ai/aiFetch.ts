import { getCapability } from './capability';

// ============================================================================
// fetch wrapper for same-origin AI routes. Attaches the capability token (when
// the server issues one) as `x-saler-capability`. Requests stay same-origin, so
// the browser also sends Origin/Referer automatically — the two together are
// what the server's aiGuard checks. The signing secret is never in the client;
// this only forwards an opaque token the server minted.
// ============================================================================

export async function aiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getCapability();
  const headers = new Headers(init.headers);
  if (token) headers.set('x-saler-capability', token);
  return fetch(input, { ...init, headers });
}
