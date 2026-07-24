import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCapability, resetCapabilityCache } from './capability';
import { aiFetch } from './aiFetch';

beforeEach(() => resetCapabilityCache());

describe('client capability', () => {
  it('returns the token the server issued', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: '9999999999999.deadbeef', expiresInMs: 1000 }), {
        status: 200,
      }),
    ) as unknown as typeof fetch;
    expect(await getCapability(fetchImpl)).toBe('9999999999999.deadbeef');
  });

  it('returns null when the server issues none (dev-safe)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: null }), { status: 200 }),
    ) as unknown as typeof fetch;
    expect(await getCapability(fetchImpl)).toBeNull();
  });

  it('treats a network error as no capability rather than throwing', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    expect(await getCapability(fetchImpl)).toBeNull();
  });

  it('caches: concurrent callers share one request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: '9999999999999.abc' }), { status: 200 }),
    ) as unknown as typeof fetch;
    const [a, b] = await Promise.all([getCapability(fetchImpl), getCapability(fetchImpl)]);
    expect(a).toBe(b);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('aiFetch', () => {
  it('attaches the capability header when a token exists', async () => {
    // Seed the cache with a token via the capability endpoint.
    const capFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: '9999999999999.sig' }), { status: 200 }),
    ) as unknown as typeof fetch;
    await getCapability(capFetch);

    const seen: Headers[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        seen.push(new Headers(init.headers));
        return new Response('{}', { status: 200 });
      }),
    );
    await aiFetch('/api/conversation', { method: 'POST' });
    expect(seen[0].get('x-saler-capability')).toBe('9999999999999.sig');
    vi.unstubAllGlobals();
  });

  it('sends no capability header when the server issues none', async () => {
    const capFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: null }), { status: 200 }),
    ) as unknown as typeof fetch;
    await getCapability(capFetch);

    const seen: Headers[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        seen.push(new Headers(init.headers));
        return new Response('{}', { status: 200 });
      }),
    );
    await aiFetch('/api/conversation', { method: 'POST' });
    expect(seen[0].has('x-saler-capability')).toBe(false);
    vi.unstubAllGlobals();
  });
});
