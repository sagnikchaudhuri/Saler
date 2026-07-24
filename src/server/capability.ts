import { createHmac, timingSafeEqual } from 'node:crypto';

// ============================================================================
// Lightweight, server-signed capability token for the AI routes.
//
// This is NOT a user login. It is a short-lived, opaque proof that a request
// came through a same-origin page load of THIS app rather than a raw script
// hitting the endpoint. The client fetches one from a same-origin route; the
// AI routes require it (only when a signing secret is configured — see
// aiGuard). The signing secret never leaves the server and is never a VITE_
// value, so the token cannot be forged by anything in the browser bundle.
//
// SERVER-ONLY: imports node:crypto and must never be pulled into client code.
// ============================================================================

/** Token lifetime. Long enough for a full roleplay, short enough to matter. */
export const CAPABILITY_TTL_MS = 15 * 60_000;

/** Scope bound into the signature so a token is useless outside the AI routes. */
export const CAPABILITY_SCOPE = 'saler-ai';

function mac(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export interface SignOptions {
  now?: number;
  ttlMs?: number;
  scope?: string;
}

/**
 * Issue a capability token of the form `${expiry}.${hmac}` where the HMAC
 * covers the scope and expiry. Opaque to the client; only the server can mint
 * or verify it.
 */
export function signCapability(secret: string, opts: SignOptions = {}): string {
  const now = opts.now ?? Date.now();
  const ttl = opts.ttlMs ?? CAPABILITY_TTL_MS;
  const scope = opts.scope ?? CAPABILITY_SCOPE;
  const expiry = now + ttl;
  return `${expiry}.${mac(secret, `${scope}:${expiry}`)}`;
}

/**
 * Verify a token: correct shape, unexpired, and a signature that matches for
 * the given scope. Constant-time signature comparison. Any malformed input is
 * simply invalid — never throws.
 */
export function verifyCapability(
  secret: string,
  token: unknown,
  now: number = Date.now(),
  scope: string = CAPABILITY_SCOPE,
): boolean {
  if (typeof token !== 'string' || token.length === 0 || token.length > 512) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const expiryStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || expiry < now) return false;
  return safeEqualHex(sig, mac(secret, `${scope}:${expiry}`));
}
