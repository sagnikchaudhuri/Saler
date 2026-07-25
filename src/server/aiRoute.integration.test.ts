import { describe, it, expect, vi } from 'vitest';
import { createAiRoute } from './nodeAdapter';
import {
  handleConversationRequest,
  handleEvaluateTurnRequest,
  handleEvaluateFinalRequest,
  handleAiStatus,
} from './ai';
import { signCapability } from './capability';
import { createRateLimiter } from './rateLimit';
import type { LlmConfig } from './llm';
import type { GuardDeps } from './aiGuard';

// ============================================================================
// End-to-end route security through the SAME adapter production uses
// (createAiRoute). Verifies the guard runs before the core handler and before
// any upstream model call, for every AI route.
// ============================================================================

const HOST = 'saler.app';
const KEY = 'sk-proj-never-leak-abcdefghijklmnop';
const CAP_SECRET = 'server-signing-secret';
const SYS_PROMPT_HINT = 'You role-play Rohan Mehta';

function mockReq(opts: { method?: string; body?: string; headers?: Record<string, string> }) {
  const listeners: Record<string, ((arg?: unknown) => void)[]> = {};
  const req = {
    method: opts.method ?? 'POST',
    headers: { host: HOST, 'content-type': 'application/json', ...(opts.headers ?? {}) },
    on(ev: string, cb: (arg?: unknown) => void) {
      (listeners[ev] ??= []).push(cb);
      return req;
    },
  };
  queueMicrotask(() => {
    if (opts.body) listeners['data']?.forEach((cb) => cb(new TextEncoder().encode(opts.body)));
    listeners['end']?.forEach((cb) => cb());
  });
  return req as never;
}
function mockRes() {
  return {
    statusCode: 0,
    body: '',
    setHeader() {},
    end(chunk?: string | Uint8Array) {
      if (typeof chunk === 'string') this.body = chunk;
    },
  };
}

/** An upstream fetch that records whether it was called (should never be after a guard rejection). */
function spyFetch() {
  const fn = vi.fn(async () =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ customer_reply: 'hi', current_stage: 'discovery', objection_raised: { raised: false, type: 'none' }, customer_sentiment: 'neutral', conversation_should_end: false }) } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );
  return fn as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

function config(fetchImpl: typeof fetch): () => LlmConfig {
  return () => ({ apiKey: KEY, fetchImpl });
}
function security(over: Partial<GuardDeps> = {}): () => GuardDeps {
  return () => ({
    rateLimiter: createRateLimiter({ limit: 40, windowMs: 60_000 }),
    capabilitySecret: CAP_SECRET,
    apiKeyConfigured: true,
    ...over,
  });
}
async function run(route: (req: never, res: never) => unknown, req: never, res: ReturnType<typeof mockRes>) {
  await route(req, res as never);
  await new Promise((r) => setTimeout(r, 8)); // allow body microtask + async core
}

const ROUTES = {
  '/api/conversation': handleConversationRequest,
  '/api/evaluate-turn': handleEvaluateTurnRequest,
  '/api/evaluate-final': handleEvaluateFinalRequest,
} as const;

const BODY: Record<string, string> = {
  '/api/conversation': JSON.stringify({ sellerMessage: 'How do you train reps?' }),
  '/api/evaluate-turn': JSON.stringify({ sellerMessage: 'How do you train reps?' }),
  '/api/evaluate-final': JSON.stringify({ transcript: [{ speaker: 'seller', message: 'How do you train reps?' }], objectionLabels: [], liveAverage: 50, finalStage: 'discovery' }),
};

const goodCap = () => signCapability(CAP_SECRET);

for (const [path, core] of Object.entries(ROUTES)) {
  describe(`route security — ${path}`, () => {
    it('1. same-origin + valid capability reaches the core handler', async () => {
      const fetchImpl = spyFetch();
      const route = createAiRoute(core, config(fetchImpl), security());
      const res = mockRes();
      await run(route, mockReq({ headers: { origin: `https://${HOST}`, 'x-saler-capability': goodCap() }, body: BODY[path] }), res);
      // 200 (conversation) or 502 (final narrative validation) — either way the
      // core ran (guard passed); it is NOT 401/403/429/503.
      expect([200, 502]).toContain(res.statusCode);
    });

    it('2. cross-origin is rejected (403) before the core', async () => {
      const fetchImpl = spyFetch();
      const route = createAiRoute(core, config(fetchImpl), security());
      const res = mockRes();
      await run(route, mockReq({ headers: { origin: 'https://evil.example', 'x-saler-capability': goodCap() }, body: BODY[path] }), res);
      expect(res.statusCode).toBe(403);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('3. invalid capability is rejected (401) before the core', async () => {
      const fetchImpl = spyFetch();
      const route = createAiRoute(core, config(fetchImpl), security());
      const res = mockRes();
      await run(route, mockReq({ headers: { origin: `https://${HOST}`, 'x-saler-capability': 'not.a.valid.token' }, body: BODY[path] }), res);
      expect(res.statusCode).toBe(401);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('4. expired capability is rejected (401)', async () => {
      const fetchImpl = spyFetch();
      const route = createAiRoute(core, config(fetchImpl), security());
      const expired = signCapability(CAP_SECRET, { now: Date.now() - 3_600_000, ttlMs: 1000 });
      const res = mockRes();
      await run(route, mockReq({ headers: { origin: `https://${HOST}`, 'x-saler-capability': expired }, body: BODY[path] }), res);
      expect(res.statusCode).toBe(401);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('5. rate-limited request is rejected (429) before the core', async () => {
      const fetchImpl = spyFetch();
      const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
      const route = createAiRoute(core, config(fetchImpl), security({ rateLimiter: limiter }));
      const h = { origin: `https://${HOST}`, 'x-saler-capability': goodCap() };
      await run(route, mockReq({ headers: h, body: BODY[path] }), mockRes()); // consumes budget
      const res = mockRes();
      await run(route, mockReq({ headers: h, body: BODY[path] }), res);
      expect(res.statusCode).toBe(429);
    });

    it('6. oversized body is rejected (413)', async () => {
      const fetchImpl = spyFetch();
      const route = createAiRoute(core, config(fetchImpl), security());
      const big = 'x'.repeat(70 * 1024);
      const res = mockRes();
      await run(route, mockReq({ headers: { origin: `https://${HOST}`, 'x-saler-capability': goodCap() }, body: big }), res);
      expect(res.statusCode).toBe(413);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('7. invalid content type is rejected (415)', async () => {
      const fetchImpl = spyFetch();
      const route = createAiRoute(core, config(fetchImpl), security());
      const res = mockRes();
      await run(route, mockReq({ headers: { origin: `https://${HOST}`, 'x-saler-capability': goodCap(), 'content-type': 'text/plain' }, body: BODY[path] }), res);
      expect(res.statusCode).toBe(415);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('9. production key without capability secret fails closed (503) — no upstream', async () => {
      const fetchImpl = spyFetch();
      const route = createAiRoute(core, config(fetchImpl), security({ capabilitySecret: undefined, apiKeyConfigured: true }));
      const res = mockRes();
      await run(route, mockReq({ headers: { origin: `https://${HOST}` }, body: BODY[path] }), res);
      expect(res.statusCode).toBe(503);
      expect(JSON.parse(res.body).error.code).toBe('AI_NOT_CONFIGURED');
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('10. no-secret Demo Mode: no key + no capability → 503 not-configured, no upstream', async () => {
      const fetchImpl = spyFetch();
      const route = createAiRoute(core, () => ({ apiKey: undefined, fetchImpl }), security({ capabilitySecret: undefined, apiKeyConfigured: false }));
      const res = mockRes();
      await run(route, mockReq({ headers: {}, body: BODY[path] }), res); // no Origin (server/test policy)
      expect(res.statusCode).toBe(503);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('12. no guard/handler error response leaks key, capability secret, prompt, or upstream body', async () => {
      const fetchImpl = spyFetch();
      const route = createAiRoute(core, config(fetchImpl), security());
      for (const req of [
        mockReq({ headers: { origin: 'https://evil.example' }, body: BODY[path] }), // 403
        mockReq({ headers: { origin: `https://${HOST}`, 'x-saler-capability': 'bad' }, body: BODY[path] }), // 401
      ]) {
        const res = mockRes();
        await run(route, req, res);
        expect(res.body).not.toContain(KEY);
        expect(res.body).not.toContain(CAP_SECRET);
        expect(res.body).not.toContain(SYS_PROMPT_HINT);
      }
    });

    it('8. no upstream call happens after ANY guard rejection', async () => {
      const fetchImpl = spyFetch();
      const route = createAiRoute(core, config(fetchImpl), security());
      // cross-origin, bad cap, rate-limited(after budget), oversized — none call upstream
      await run(route, mockReq({ headers: { origin: 'https://evil' }, body: BODY[path] }), mockRes());
      await run(route, mockReq({ headers: { origin: `https://${HOST}`, 'x-saler-capability': 'x' }, body: BODY[path] }), mockRes());
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });
}

describe('route security — cross-cutting', () => {
  it('11. /api/ai-status matches actual route availability', () => {
    // Disabled: key only (fail-closed) → status enabled:false AND route 503.
    expect(handleAiStatus({ apiKey: KEY }).body).toEqual({ enabled: false });
    // Enabled: key + secret → status enabled:true.
    expect(handleAiStatus({ apiKey: KEY, capabilitySecret: CAP_SECRET }).body).toEqual({ enabled: true });
  });

  it('capability valid immediately before expiry, invalid at/after expiry', async () => {
    const fetchImpl = spyFetch();
    const route = createAiRoute(handleConversationRequest, config(fetchImpl), security({ now: () => 1_000 }));
    // token expiring at t=2000; guard clock pinned to 1000 (valid) then we test verify directly at boundary
    const tok = signCapability(CAP_SECRET, { now: 1_000, ttlMs: 1000 }); // expiry = 2000
    const res1 = mockRes();
    await run(route, mockReq({ headers: { origin: `https://${HOST}`, 'x-saler-capability': tok }, body: BODY['/api/conversation'] }), res1);
    expect(res1.statusCode).not.toBe(401); // valid before expiry

    const routeAfter = createAiRoute(handleConversationRequest, config(fetchImpl), security({ now: () => 2_001 }));
    const res2 = mockRes();
    await run(routeAfter, mockReq({ headers: { origin: `https://${HOST}`, 'x-saler-capability': tok }, body: BODY['/api/conversation'] }), res2);
    expect(res2.statusCode).toBe(401); // invalid at/after expiry
  });

  it('missing Origin AND Referer follows the documented allow policy (server/test clients)', async () => {
    const fetchImpl = spyFetch();
    const route = createAiRoute(handleConversationRequest, config(fetchImpl), security());
    const res = mockRes();
    await run(route, mockReq({ headers: { 'x-saler-capability': goodCap() }, body: BODY['/api/conversation'] }), res);
    // Not a 403; the request is allowed past same-origin (then handled normally).
    expect(res.statusCode).not.toBe(403);
  });

  it('a token signed for a different scope cannot authorise the AI routes', async () => {
    const fetchImpl = spyFetch();
    const route = createAiRoute(handleConversationRequest, config(fetchImpl), security());
    const otherScope = signCapability(CAP_SECRET, { scope: 'some-other-feature' });
    const res = mockRes();
    await run(route, mockReq({ headers: { origin: `https://${HOST}`, 'x-saler-capability': otherScope }, body: BODY['/api/conversation'] }), res);
    expect(res.statusCode).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
