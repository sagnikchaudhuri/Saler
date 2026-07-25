import { describe, it, expect, vi } from 'vitest';
import { handleSpeakRequest, MAX_SPEAK_TEXT_LENGTH } from './speak.js';
import { createRateLimiter } from './rateLimit.js';

const SECRET = 'sk_test_do_not_leak_me_1234567890';

function audioResponse(bytes = 8): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'content-type': 'audio/mpeg' },
  });
}

function post(body: unknown, contentType = 'application/json') {
  return { method: 'POST', rawBody: JSON.stringify(body), contentType };
}

function deps(fetchImpl: typeof fetch, over: Partial<Parameters<typeof handleSpeakRequest>[1]> = {}) {
  return { apiKey: SECRET, voiceId: 'voice_abc', fetchImpl, ...over };
}

describe('POST /api/speak — request validation', () => {
  const noFetch = vi.fn() as unknown as typeof fetch;

  it('rejects non-POST methods', async () => {
    const r = await handleSpeakRequest({ method: 'GET' }, deps(noFetch));
    expect(r.status).toBe(405);
    expect(r.body?.error.code).toBe('METHOD_NOT_ALLOWED');
    expect(noFetch).not.toHaveBeenCalled();
  });

  it('rejects a non-JSON content type', async () => {
    const r = await handleSpeakRequest(
      { method: 'POST', rawBody: 'text', contentType: 'text/plain' },
      deps(noFetch),
    );
    expect(r.status).toBe(415);
  });

  it('rejects malformed JSON', async () => {
    const r = await handleSpeakRequest(
      { method: 'POST', rawBody: '{not json', contentType: 'application/json' },
      deps(noFetch),
    );
    expect(r.status).toBe(400);
    expect(r.body?.error.code).toBe('INVALID_REQUEST');
  });

  it('rejects a missing or non-string text field', async () => {
    expect((await handleSpeakRequest(post({}), deps(noFetch))).status).toBe(400);
    expect((await handleSpeakRequest(post({ text: 42 }), deps(noFetch))).status).toBe(400);
  });

  it('rejects empty or whitespace-only text', async () => {
    expect((await handleSpeakRequest(post({ text: '' }), deps(noFetch))).status).toBe(400);
    expect((await handleSpeakRequest(post({ text: '    ' }), deps(noFetch))).status).toBe(400);
  });

  it('rejects oversized text', async () => {
    const long = 'a'.repeat(MAX_SPEAK_TEXT_LENGTH + 1);
    const r = await handleSpeakRequest(post({ text: long }), deps(noFetch));
    expect(r.status).toBe(413);
    expect(noFetch).not.toHaveBeenCalled();
  });

  it('trims text before sending upstream', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(audioResponse()) as unknown as typeof fetch;
    await handleSpeakRequest(post({ text: '  Hello there.  ' }), deps(fetchImpl));
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(JSON.parse(init.body as string).text).toBe('Hello there.');
  });
});

describe('POST /api/speak — configuration', () => {
  const noFetch = vi.fn() as unknown as typeof fetch;

  it('returns a generic configuration error when the key is missing', async () => {
    const r = await handleSpeakRequest(post({ text: 'hi' }), deps(noFetch, { apiKey: undefined }));
    expect(r.status).toBe(503);
    expect(r.body?.error.code).toBe('VOICE_NOT_CONFIGURED');
    expect(noFetch).not.toHaveBeenCalled();
  });

  it('returns the SAME generic error when the voice ID is missing', async () => {
    const r = await handleSpeakRequest(post({ text: 'hi' }), deps(noFetch, { voiceId: '' }));
    expect(r.status).toBe(503);
    expect(r.body?.error.code).toBe('VOICE_NOT_CONFIGURED');
    // Must not disclose WHICH value is absent.
    expect(r.body?.error.message).not.toMatch(/key|voice id/i);
  });

  it('uses the server voice ID and ignores any client-supplied one', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(audioResponse()) as unknown as typeof fetch;
    await handleSpeakRequest(
      post({ text: 'hi', voiceId: 'attacker_voice' }),
      deps(fetchImpl, { voiceId: 'server_voice' }),
    );
    const url = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('server_voice');
    expect(url).not.toContain('attacker_voice');
  });
});

describe('POST /api/speak — upstream handling', () => {
  it('returns audio on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(audioResponse(16)) as unknown as typeof fetch;
    const r = await handleSpeakRequest(post({ text: 'Hello.' }), deps(fetchImpl));
    expect(r.status).toBe(200);
    expect(r.contentType).toBe('audio/mpeg');
    expect(r.audio?.byteLength).toBe(16);
  });

  it('sends the key in the xi-api-key header only', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(audioResponse()) as unknown as typeof fetch;
    await handleSpeakRequest(post({ text: 'hi' }), deps(fetchImpl));
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe(SECRET);
    expect(url).not.toContain(SECRET);
    expect(init.body).not.toContain(SECRET);
  });

  it('maps a 401 to a generic error without leaking the key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('{"detail":"invalid api key"}', { status: 401 }),
    ) as unknown as typeof fetch;
    const r = await handleSpeakRequest(post({ text: 'hi' }), deps(fetchImpl));
    expect(r.status).toBe(502);
    expect(r.body?.error.code).toBe('VOICE_UNAVAILABLE');
    expect(JSON.stringify(r.body)).not.toContain(SECRET);
    // Upstream body is never forwarded.
    expect(JSON.stringify(r.body)).not.toMatch(/invalid api key/i);
  });

  it('maps a 402 out-of-credits response to the quota path', async () => {
    // Observed for real: ElevenLabs returns 402 when the account has no credits.
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('payment required', { status: 402 }),
    ) as unknown as typeof fetch;
    const r = await handleSpeakRequest(post({ text: 'hi' }), deps(fetchImpl));
    expect(r.status).toBe(429);
    expect(r.body?.error.code).toBe('VOICE_UNAVAILABLE');
  });

  it('reports the upstream status to the server-side diagnostic only', async () => {
    const seen: number[] = [];
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('x', { status: 402 }),
    ) as unknown as typeof fetch;
    await handleSpeakRequest(post({ text: 'hi' }), deps(fetchImpl, { onUpstreamStatus: (s) => seen.push(s) }));
    expect(seen).toEqual([402]);
  });

  it('maps a 429 quota response to 429', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('quota exceeded', { status: 429 }),
    ) as unknown as typeof fetch;
    const r = await handleSpeakRequest(post({ text: 'hi' }), deps(fetchImpl));
    expect(r.status).toBe(429);
    expect(r.body?.error.code).toBe('VOICE_UNAVAILABLE');
  });

  it('rejects a non-audio upstream response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }),
    ) as unknown as typeof fetch;
    const r = await handleSpeakRequest(post({ text: 'hi' }), deps(fetchImpl));
    expect(r.status).toBe(502);
  });

  it('rejects an empty audio body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(new Uint8Array(0), { status: 200, headers: { 'content-type': 'audio/mpeg' } }),
    ) as unknown as typeof fetch;
    expect((await handleSpeakRequest(post({ text: 'hi' }), deps(fetchImpl))).status).toBe(502);
  });

  it('maps a network failure to a safe error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    const r = await handleSpeakRequest(post({ text: 'hi' }), deps(fetchImpl));
    expect(r.status).toBe(504);
    expect(JSON.stringify(r.body)).not.toMatch(/ECONNREFUSED/);
  });

  it('times out a slow upstream', async () => {
    const fetchImpl = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ) as unknown as typeof fetch;
    const r = await handleSpeakRequest(post({ text: 'hi' }), deps(fetchImpl, { timeoutMs: 10 }));
    expect(r.status).toBe(504);
  });

  it('never includes the key in ANY error body', async () => {
    const cases = [
      new Response('x', { status: 401 }),
      new Response('x', { status: 429 }),
      new Response('x', { status: 500 }),
    ];
    for (const res of cases) {
      const fetchImpl = vi.fn().mockResolvedValue(res) as unknown as typeof fetch;
      const r = await handleSpeakRequest(post({ text: 'hi' }), deps(fetchImpl));
      expect(JSON.stringify(r.body ?? {})).not.toContain(SECRET);
    }
  });
});

describe('rate limiter', () => {
  it('allows up to the limit then blocks', () => {
    const t = 0;
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: () => t });
    expect(limiter.check('a')).toBe(true);
    expect(limiter.check('a')).toBe(true);
    expect(limiter.check('a')).toBe(true);
    expect(limiter.check('a')).toBe(false);
  });

  it('recovers after the window passes', () => {
    let t = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => t });
    expect(limiter.check('a')).toBe(true);
    expect(limiter.check('a')).toBe(false);
    t = 2000;
    expect(limiter.check('a')).toBe(true);
  });

  it('tracks callers independently', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    expect(limiter.check('a')).toBe(true);
    expect(limiter.check('b')).toBe(true);
  });
});
