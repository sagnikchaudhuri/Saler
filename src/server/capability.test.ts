import { describe, it, expect } from 'vitest';
import {
  signCapability,
  verifyCapability,
  CAPABILITY_SCOPE,
  CAPABILITY_TTL_MS,
} from './capability';

const SECRET = 'test-signing-secret-value';

describe('capability token', () => {
  it('verifies a freshly signed token', () => {
    const now = 1_000_000;
    const token = signCapability(SECRET, { now });
    expect(verifyCapability(SECRET, token, now)).toBe(true);
  });

  it('rejects a token signed with a different secret', () => {
    const now = 1_000_000;
    const token = signCapability(SECRET, { now });
    expect(verifyCapability('a-different-secret', token, now)).toBe(false);
  });

  it('rejects an expired token', () => {
    const now = 1_000_000;
    const token = signCapability(SECRET, { now, ttlMs: 1000 });
    expect(verifyCapability(SECRET, token, now + 2000)).toBe(false);
  });

  it('accepts within its lifetime and rejects after', () => {
    const now = 5_000_000;
    const token = signCapability(SECRET, { now });
    expect(verifyCapability(SECRET, token, now + CAPABILITY_TTL_MS - 1)).toBe(true);
    expect(verifyCapability(SECRET, token, now + CAPABILITY_TTL_MS + 1)).toBe(false);
  });

  it('is scoped: a token for another scope does not verify for AI', () => {
    const now = 1_000_000;
    const other = signCapability(SECRET, { now, scope: 'some-other-scope' });
    expect(verifyCapability(SECRET, other, now, CAPABILITY_SCOPE)).toBe(false);
  });

  it('rejects tampering with the expiry', () => {
    const now = 1_000_000;
    const token = signCapability(SECRET, { now, ttlMs: 1000 });
    const [, sig] = token.split('.');
    const forged = `${now + 10_000_000}.${sig}`; // push expiry far out, keep old sig
    expect(verifyCapability(SECRET, forged, now)).toBe(false);
  });

  it('treats malformed input as invalid without throwing', () => {
    const now = 1_000_000;
    for (const bad of ['', 'nodot', '.', 'x.y', '123.', `${now + 1000}.`, 'a'.repeat(600)]) {
      expect(verifyCapability(SECRET, bad, now)).toBe(false);
    }
    expect(verifyCapability(SECRET, null, now)).toBe(false);
    expect(verifyCapability(SECRET, 42, now)).toBe(false);
  });

  it('never embeds the secret in the token', () => {
    const token = signCapability(SECRET, { now: 1 });
    expect(token.includes(SECRET)).toBe(false);
  });
});
