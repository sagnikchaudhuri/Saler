import { describe, it, expect, vi } from 'vitest';
import { guardAiRequest, checkSameOrigin } from './aiGuard';
import { createAiRoute, createCapabilityRoute, type NodeRequestLike, type NodeResponseLike } from './nodeAdapter';
import { createRateLimiter } from './rateLimit';
import { signCapability } from './capability';
import { handleAiCapability, type AiRequestLike, type JsonResult } from './ai';
import type { LlmConfig } from './llm';

const SECRET = 'guard-secret';

// --- unit: same-origin policy ----------------------------------------------

describe('checkSameOrigin', () => {
  it('accepts a matching Origin', () => {
    expect(checkSameOrigin('https://saler.app', undefined, 'saler.app')).toBe(true);
  });
  it('rejects a mismatched Origin', () => {
    expect(checkSameOrigin('https://evil.example', undefined, 'saler.app')).toBe(false);
  });
  it('falls back to Referer when Origin is absent', () => {
    expect(checkSameOrigin(undefined, 'https://saler.app/report', 'saler.app')).toBe(true);
    expect(checkSameOrigin(undefined, 'https://evil.example/x', 'saler.app')).toBe(false);
  });
  it('allows when neither Origin nor Referer is present (server/test clients)', () => {
    expect(checkSameOrigin(undefined, undefined, 'saler.app')).toBe(true);
  });
  it('handles localhost dev', () => {
    expect(checkSameOrigin('http://localhost:5173', undefined, 'localhost:5173')).toBe(true);
    expect(checkSameOrigin('http://localhost:3000', undefined, 'localhost:5173')).toBe(false);
  });
});

// --- unit: the guard --------------------------------------------------------

describe('guardAiRequest', () => {
  const sameOrigin = { host: 'saler.app', origin: 'https://saler.app' };

  it('allows a same-origin request with no capability required', () => {
    expect(guardAiRequest(sameOrigin, {}).ok).toBe(true);
  });

  it('rate-limits by client id', () => {
    const rateLimiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
    const deps = { rateLimiter };
    expect(guardAiRequest({ ...sameOrigin, clientId: 'a' }, deps).ok).toBe(true);
    expect(guardAiRequest({ ...sameOrigin, clientId: 'a' }, deps).ok).toBe(true);
    const third = guardAiRequest({ ...sameOrigin, clientId: 'a' }, deps);
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.status).toBe(429);
    // A different client is unaffected — the limit is per client id.
    expect(guardAiRequest({ ...sameOrigin, clientId: 'b' }, deps).ok).toBe(true);
  });

  it('rejects a clearly cross-origin browser request', () => {
    const r = guardAiRequest({ host: 'saler.app', origin: 'https://evil.example' }, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it('requires a valid capability when a secret is configured', () => {
    const now = 1_000_000;
    const deps = { capabilitySecret: SECRET, now: () => now };
    const missing = guardAiRequest(sameOrigin, deps);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.status).toBe(401);

    const good = signCapability(SECRET, { now });
    expect(guardAiRequest({ ...sameOrigin, capability: good }, deps).ok).toBe(true);
  });

  it('rejects an expired capability', () => {
    const now = 1_000_000;
    const token = signCapability(SECRET, { now, ttlMs: 1000 });
    const r = guardAiRequest(
      { ...sameOrigin, capability: token },
      { capabilitySecret: SECRET, now: () => now + 5000 },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it('never leaks the signing secret in an error', () => {
    const r = guardAiRequest(sameOrigin, { capabilitySecret: SECRET, now: () => 1 });
    expect(JSON.stringify(r).includes(SECRET)).toBe(false);
  });
});

// --- integration: the route adapters ---------------------------------------

function mockReq(headers: Record<string, string> = {}, body = '{}'): NodeRequestLike {
  return {
    method: 'POST',
    headers,
    on(event: string, cb: (arg?: unknown) => void) {
      if (event === 'data') cb(new TextEncoder().encode(body));
      if (event === 'end') cb();
    },
  } as unknown as NodeRequestLike;
}

function mockRes() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    bodyText: '',
    setHeader(k: string, v: string) { this.headers[k] = v; },
    end(s?: string) { if (typeof s === 'string') this.bodyText = s; },
  };
  return res as unknown as NodeResponseLike & { statusCode: number; bodyText: string };
}

const cfg = (): LlmConfig => ({ apiKey: 'sk-should-never-appear', fetchImpl: (async () => new Response('{}')) as unknown as typeof fetch });

describe('createAiRoute security integration', () => {
  it('short-circuits a cross-origin request without calling the core', async () => {
    const core = vi.fn(async (): Promise<JsonResult> => ({ status: 200, body: { ok: true } }));
    const route = createAiRoute(core as unknown as (r: AiRequestLike, c: LlmConfig) => Promise<JsonResult>, cfg, () => ({}));
    const res = mockRes();
    await route(mockReq({ host: 'saler.app', origin: 'https://evil.example' }), res);
    expect(res.statusCode).toBe(403);
    expect(core).not.toHaveBeenCalled();
    expect(res.bodyText.includes('sk-should-never-appear')).toBe(false);
  });

  it('rate-limits every AI route through the shared limiter', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const security = () => ({ rateLimiter: limiter });
    const core = vi.fn(async (): Promise<JsonResult> => ({ status: 200, body: { ok: true } }));
    const route = createAiRoute(core as unknown as (r: AiRequestLike, c: LlmConfig) => Promise<JsonResult>, cfg, security);
    const h = { host: 'saler.app', origin: 'https://saler.app', 'x-forwarded-for': '9.9.9.9' };
    const first = mockRes();
    await route(mockReq(h), first);
    expect(first.statusCode).toBe(200);
    const second = mockRes();
    await route(mockReq(h), second);
    expect(second.statusCode).toBe(429);
  });

  it('rejects a missing capability when a secret is configured', async () => {
    const security = () => ({ capabilitySecret: SECRET });
    const core = vi.fn(async (): Promise<JsonResult> => ({ status: 200, body: { ok: true } }));
    const route = createAiRoute(core as unknown as (r: AiRequestLike, c: LlmConfig) => Promise<JsonResult>, cfg, security);
    const res = mockRes();
    await route(mockReq({ host: 'saler.app', origin: 'https://saler.app' }), res);
    expect(res.statusCode).toBe(401);
    expect(core).not.toHaveBeenCalled();
  });

  it('allows a request carrying a valid capability', async () => {
    const now = 2_000_000;
    const security = () => ({ capabilitySecret: SECRET, now: () => now });
    const core = vi.fn(async (): Promise<JsonResult> => ({ status: 200, body: { ok: true } }));
    const route = createAiRoute(core as unknown as (r: AiRequestLike, c: LlmConfig) => Promise<JsonResult>, cfg, security);
    const res = mockRes();
    await route(
      mockReq({ host: 'saler.app', origin: 'https://saler.app', 'x-saler-capability': signCapability(SECRET, { now }) }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(core).toHaveBeenCalledOnce();
  });

  it('runs the core with no security config (Demo/dev-safe)', async () => {
    const core = vi.fn(async (): Promise<JsonResult> => ({ status: 200, body: { ok: true } }));
    const route = createAiRoute(core as unknown as (r: AiRequestLike, c: LlmConfig) => Promise<JsonResult>, cfg);
    const res = mockRes();
    await route(mockReq(), res);
    expect(res.statusCode).toBe(200);
    expect(core).toHaveBeenCalledOnce();
  });
});

describe('capability route', () => {
  it('does not require a capability to issue one, and returns null without a secret', async () => {
    const route = createCapabilityRoute(() => handleAiCapability(undefined), () => ({ capabilitySecret: SECRET }));
    const res = mockRes();
    await route(mockReq({ host: 'saler.app', origin: 'https://saler.app' }), res);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.bodyText)).toEqual({ token: null });
  });

  it('issues a verifiable token when a secret is configured, and still enforces same-origin', async () => {
    const now = 3_000_000;
    const route = createCapabilityRoute(() => handleAiCapability(SECRET, now), () => ({ capabilitySecret: SECRET }));
    const ok = mockRes();
    await route(mockReq({ host: 'saler.app', origin: 'https://saler.app' }), ok);
    expect(ok.statusCode).toBe(200);
    const { token } = JSON.parse(ok.bodyText);
    expect(typeof token).toBe('string');
    expect(token.includes(SECRET)).toBe(false);

    const crossOrigin = mockRes();
    await route(mockReq({ host: 'saler.app', origin: 'https://evil.example' }), crossOrigin);
    expect(crossOrigin.statusCode).toBe(403);
  });
});
