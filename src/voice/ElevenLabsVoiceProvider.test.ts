import { describe, it, expect, vi } from 'vitest';
import { ElevenLabsVoiceProvider, type AudioElementLike } from './ElevenLabsVoiceProvider';
import { FallbackVoiceProvider } from './FallbackVoiceProvider';
import { BrowserSpeechSynthesisProvider } from './BrowserSpeechSynthesisProvider';
import { SilentVoiceProvider } from './SilentVoiceProvider';
import { VoiceProviderError } from './errors';
import type { VoiceState } from './types';

class FakeAudio implements AudioElementLike {
  static last: FakeAudio | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  paused = false;
  playRejects: Error | null = null;
  constructor(public src: string) {
    FakeAudio.last = this;
  }
  async play(): Promise<void> {
    if (this.playRejects) throw this.playRejects;
  }
  pause(): void {
    this.paused = true;
  }
}

function audioResponse(): Response {
  return new Response(new Uint8Array([1, 2, 3, 4]), {
    status: 200,
    headers: { 'content-type': 'audio/mpeg' },
  });
}

/** speak() awaits fetch → blob → play, so wait for the real state rather than
 *  guessing a number of microtask ticks. */
async function waitForState(
  provider: ElevenLabsVoiceProvider,
  target: VoiceState,
  tries = 50,
): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (provider.getState() === target) return;
    await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error(`provider never reached "${target}" (state: ${provider.getState()})`);
}

function setup(
  fetchImpl: typeof fetch,
  over: { playRejects?: Error } = {},
) {
  const revoked: string[] = [];
  const created: string[] = [];
  const provider = new ElevenLabsVoiceProvider({
    fetchImpl,
    createObjectURL: () => {
      const url = `blob:mock-${created.length}`;
      created.push(url);
      return url;
    },
    revokeObjectURL: (u) => revoked.push(u),
    createAudio: (src) => {
      const a = new FakeAudio(src);
      if (over.playRejects) a.playRejects = over.playRejects;
      return a;
    },
  });
  return { provider, revoked, created };
}

describe('ElevenLabsVoiceProvider — success path', () => {
  it('posts text to the local secure route only', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(audioResponse()) as unknown as typeof fetch;
    const { provider } = setup(fetchImpl);

    const promise = provider.speak('Hello.');
    await waitForState(provider, 'speaking');
    FakeAudio.last!.onended?.();
    await promise;

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/speak');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ text: 'Hello.' });
    // The client must never handle a credential.
    expect(JSON.stringify(init)).not.toMatch(/xi-api-key|sk_/i);
  });

  it('moves through preparing → speaking → stopped', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(audioResponse()) as unknown as typeof fetch;
    const { provider } = setup(fetchImpl);
    const states: VoiceState[] = [];
    provider.subscribe((s) => states.push(s));

    const promise = provider.speak('hi');
    expect(provider.getState()).toBe('preparing');
    await waitForState(provider, 'speaking');
    FakeAudio.last!.onended?.();
    await promise;

    expect(states).toContain('preparing');
    expect(states).toContain('speaking');
    expect(provider.getState()).toBe('stopped');
  });

  it('revokes the object URL after playback', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(audioResponse()) as unknown as typeof fetch;
    const { provider, revoked, created } = setup(fetchImpl);

    const promise = provider.speak('hi');
    await waitForState(provider, 'speaking');
    FakeAudio.last!.onended?.();
    await promise;

    expect(created).toHaveLength(1);
    expect(revoked).toEqual(created);
  });
});

describe('ElevenLabsVoiceProvider — failures drive fallback', () => {
  it('maps 503 to a configuration error and disables itself', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('{}', { status: 503 }),
    ) as unknown as typeof fetch;
    const { provider } = setup(fetchImpl);

    await expect(provider.speak('hi')).rejects.toMatchObject({ reason: 'configuration' });
    // Never call a route that cannot work — protects credits and latency.
    expect(provider.isAvailable()).toBe(false);
  });

  it('maps 401 to an auth error and disables itself', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('{}', { status: 401 }),
    ) as unknown as typeof fetch;
    const { provider } = setup(fetchImpl);
    await expect(provider.speak('hi')).rejects.toMatchObject({ reason: 'auth' });
    expect(provider.isAvailable()).toBe(false);
  });

  it('maps 429 to quota but stays available for later turns', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('{}', { status: 429 }),
    ) as unknown as typeof fetch;
    const { provider } = setup(fetchImpl);
    await expect(provider.speak('hi')).rejects.toMatchObject({ reason: 'quota' });
    expect(provider.isAvailable()).toBe(true);
  });

  it('rejects a non-audio response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('{"error":1}', { status: 200, headers: { 'content-type': 'application/json' } }),
    ) as unknown as typeof fetch;
    const { provider } = setup(fetchImpl);
    await expect(provider.speak('hi')).rejects.toMatchObject({ reason: 'invalid-response' });
  });

  it('rejects an empty audio body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(new Uint8Array(0), { status: 200, headers: { 'content-type': 'audio/mpeg' } }),
    ) as unknown as typeof fetch;
    const { provider } = setup(fetchImpl);
    await expect(provider.speak('hi')).rejects.toMatchObject({ reason: 'invalid-response' });
  });

  it('maps a network failure', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const { provider } = setup(fetchImpl);
    await expect(provider.speak('hi')).rejects.toMatchObject({ reason: 'network' });
  });

  it('reports a blocked autoplay distinctly and cleans up', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(audioResponse()) as unknown as typeof fetch;
    const { provider, revoked } = setup(fetchImpl, {
      playRejects: new Error('NotAllowedError'),
    });
    await expect(provider.speak('hi')).rejects.toMatchObject({ reason: 'autoplay-blocked' });
    expect(revoked).toHaveLength(1); // no leaked object URL
  });
});

describe('ElevenLabsVoiceProvider — cancellation', () => {
  it('aborts an in-flight request when stopped', async () => {
    let abortSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn().mockImplementation(
      (_u: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          abortSignal = init.signal ?? undefined;
          init.signal?.addEventListener('abort', () => rej(new Error('aborted')));
        }),
    ) as unknown as typeof fetch;

    const { provider } = setup(fetchImpl);
    const promise = provider.speak('hi');
    await Promise.resolve();
    provider.stop();

    await expect(promise).rejects.toMatchObject({ reason: 'cancelled' });
    expect(abortSignal?.aborted).toBe(true);
    expect(provider.getState()).toBe('stopped');
  });

  it('stops during playback, revokes the URL, and settles the promise', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(audioResponse()) as unknown as typeof fetch;
    const { provider, revoked } = setup(fetchImpl);

    const promise = provider.speak('hi');
    await waitForState(provider, 'speaking');

    provider.stop();
    await promise; // must not hang

    expect(revoked).toHaveLength(1);
    expect(FakeAudio.last!.paused).toBe(true);
    expect(provider.getState()).toBe('stopped');
  });
});

describe('production chain integration', () => {
  it('falls back to browser voice when ElevenLabs fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('{}', { status: 429 }),
    ) as unknown as typeof fetch;
    const { provider: eleven } = setup(fetchImpl);

    // Fake synthesis so the browser step can succeed.
    const spoken: string[] = [];
    const browser = new BrowserSpeechSynthesisProvider({
      speechSynthesis: {
        speak: (u) => { spoken.push(u.text); queueMicrotask(() => u.onend?.()); },
        cancel: () => {},
        getVoices: () => [{ name: 'EN', lang: 'en-IN' }],
      },
      SpeechSynthesisUtterance: class {
        lang = ''; rate = 1; pitch = 1; volume = 1; voice = null;
        onend: (() => void) | null = null;
        onerror: ((e: { error?: string }) => void) | null = null;
        constructor(public text: string) {}
      },
    });

    const chain = new FallbackVoiceProvider([eleven, browser, new SilentVoiceProvider()]);
    await chain.speak('Short line.');

    expect(spoken).toEqual(['Short line.']);
    expect(chain.getName()).toBe('Browser Voice');
    expect(chain.getFallbackReason()?.reason).toBe('quota');
  });

  it('falls all the way to Silent Mode when both fail', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const { provider: eleven } = setup(fetchImpl);
    const browser = new BrowserSpeechSynthesisProvider({}); // unavailable
    const silent = new SilentVoiceProvider();

    const chain = new FallbackVoiceProvider([eleven, browser, silent]);
    await chain.speak('hi');

    expect(chain.getName()).toBe('Silent Mode');
    expect(silent.spokenCount).toBe(1);
  });

  it('makes exactly one ElevenLabs attempt per utterance', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('{}', { status: 500 }),
    ) as unknown as typeof fetch;
    const { provider: eleven } = setup(fetchImpl);
    const chain = new FallbackVoiceProvider([eleven, new SilentVoiceProvider()]);

    await chain.speak('hi');
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it('skips ElevenLabs entirely after it disables itself', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('{}', { status: 503 }),
    ) as unknown as typeof fetch;
    const { provider: eleven } = setup(fetchImpl);
    const chain = new FallbackVoiceProvider([eleven, new SilentVoiceProvider()]);

    await chain.speak('one');
    await chain.speak('two');
    // Only the first utterance hit the network.
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});

describe('error typing', () => {
  it('uses VoiceProviderError so the chain can classify failures', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('x')) as unknown as typeof fetch;
    const { provider } = setup(fetchImpl);
    await expect(provider.speak('hi')).rejects.toBeInstanceOf(VoiceProviderError);
  });
});
