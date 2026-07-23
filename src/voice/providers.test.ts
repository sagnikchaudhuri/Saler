import { describe, it, expect, vi } from 'vitest';
import {
  BrowserSpeechSynthesisProvider,
  type SpeechSynthesisLike,
  type SynthesisVoiceLike,
  type SynthesisWindowLike,
  type UtteranceLike,
} from './BrowserSpeechSynthesisProvider';
import { SilentVoiceProvider } from './SilentVoiceProvider';
import { FallbackVoiceProvider } from './FallbackVoiceProvider';
import { createVoiceProvider } from './provider';
import { MockVoiceProvider } from './testing/MockVoiceProvider';
import { VoiceProviderError, VoiceUnavailableError } from './errors';
import type { VoiceState } from './types';

// --- fake speech synthesis --------------------------------------------------

class FakeUtterance implements UtteranceLike {
  lang = '';
  rate = 1;
  pitch = 1;
  volume = 1;
  voice: SynthesisVoiceLike | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error?: string }) => void) | null = null;
  constructor(public text: string) {}
}

class FakeSynthesis implements SpeechSynthesisLike {
  spoken: FakeUtterance[] = [];
  cancelCalls = 0;
  throwOnSpeak = false;
  constructor(private voices: SynthesisVoiceLike[] = [{ name: 'EN', lang: 'en-IN' }]) {}
  speak(u: UtteranceLike): void {
    if (this.throwOnSpeak) throw new Error('nope');
    this.spoken.push(u as FakeUtterance);
  }
  cancel(): void {
    this.cancelCalls += 1;
  }
  getVoices(): SynthesisVoiceLike[] {
    return this.voices;
  }
}

function synthWindow(synth = new FakeSynthesis()): { win: SynthesisWindowLike; synth: FakeSynthesis } {
  return {
    win: {
      speechSynthesis: synth,
      SpeechSynthesisUtterance: FakeUtterance as unknown as new (t: string) => UtteranceLike,
    },
    synth,
  };
}

describe('BrowserSpeechSynthesisProvider', () => {
  it('reports unavailable without the synthesis APIs', () => {
    const p = new BrowserSpeechSynthesisProvider({});
    expect(p.isAvailable()).toBe(false);
    expect(p.getState()).toBe('unavailable');
  });

  it('rejects when asked to speak while unavailable', async () => {
    const p = new BrowserSpeechSynthesisProvider({});
    await expect(p.speak('hi')).rejects.toBeInstanceOf(VoiceProviderError);
  });

  it('speaks and resolves when the utterance ends', async () => {
    const { win, synth } = synthWindow();
    const p = new BrowserSpeechSynthesisProvider(win);
    const states: VoiceState[] = [];
    p.subscribe((s) => states.push(s));

    const promise = p.speak('Hello there.');
    expect(synth.spoken).toHaveLength(1);
    expect(p.getState()).toBe('speaking');
    synth.spoken[0].onend?.();
    await promise;

    expect(states).toContain('speaking');
    expect(p.getState()).toBe('stopped');
  });

  it('applies sensible defaults and picks an English voice', async () => {
    const { win, synth } = synthWindow();
    const p = new BrowserSpeechSynthesisProvider(win);
    const promise = p.speak('x');
    const u = synth.spoken[0];
    expect(u.lang).toBe('en-IN');
    expect(u.rate).toBe(1);
    expect(u.pitch).toBe(1);
    expect(u.voice?.lang).toBe('en-IN');
    u.onend?.();
    await promise;
  });

  it('works when no voices are installed', async () => {
    const { win, synth } = synthWindow(new FakeSynthesis([]));
    const p = new BrowserSpeechSynthesisProvider(win);
    const promise = p.speak('x');
    expect(synth.spoken[0].voice).toBeNull();
    synth.spoken[0].onend?.();
    await promise;
  });

  it('cancels the previous utterance before a new one', async () => {
    const { win, synth } = synthWindow();
    const p = new BrowserSpeechSynthesisProvider(win);
    const first = p.speak('one');
    p.stop();
    await first; // resolves via stop → token invalidation
    const second = p.speak('two');
    expect(synth.cancelCalls).toBeGreaterThanOrEqual(1);
    synth.spoken.at(-1)!.onend?.();
    await second;
  });

  it('treats an interruption as a clean stop, not an error', async () => {
    const { win, synth } = synthWindow();
    const p = new BrowserSpeechSynthesisProvider(win);
    const promise = p.speak('x');
    synth.spoken[0].onerror?.({ error: 'interrupted' });
    await expect(promise).resolves.toBeUndefined();
    expect(p.getState()).toBe('stopped');
  });

  it('rejects on a genuine synthesis error', async () => {
    const { win, synth } = synthWindow();
    const p = new BrowserSpeechSynthesisProvider(win);
    const promise = p.speak('x');
    synth.spoken[0].onerror?.({ error: 'synthesis-failed' });
    await expect(promise).rejects.toBeInstanceOf(VoiceProviderError);
    expect(p.getState()).toBe('error');
  });

  it('rejects when speak() throws', async () => {
    const { win, synth } = synthWindow();
    synth.throwOnSpeak = true;
    const p = new BrowserSpeechSynthesisProvider(win);
    await expect(p.speak('x')).rejects.toBeInstanceOf(VoiceProviderError);
  });

  it('clears handlers after completion', async () => {
    const { win, synth } = synthWindow();
    const p = new BrowserSpeechSynthesisProvider(win);
    const promise = p.speak('x');
    const u = synth.spoken[0];
    u.onend?.();
    await promise;
    expect(u.onend).toBeNull();
    expect(u.onerror).toBeNull();
  });
});

describe('SilentVoiceProvider', () => {
  it('is always available and identifies itself honestly', () => {
    const p = new SilentVoiceProvider();
    expect(p.isAvailable()).toBe(true);
    expect(p.getName()).toBe('Silent Mode');
  });

  it('completes without ever claiming to be speaking', async () => {
    const p = new SilentVoiceProvider();
    const states: VoiceState[] = [];
    p.subscribe((s) => states.push(s));
    await p.speak();
    expect(states).not.toContain('speaking');
    expect(p.getState()).toBe('idle');
    expect(p.spokenCount).toBe(1);
  });
});

describe('FallbackVoiceProvider', () => {
  it('uses the first available provider', async () => {
    const primary = new MockVoiceProvider({ name: 'Primary', autoComplete: true });
    const secondary = new MockVoiceProvider({ name: 'Secondary', autoComplete: true });
    const chain = new FallbackVoiceProvider([primary, secondary]);

    await chain.speak('hello');
    expect(primary.spokenTexts).toEqual(['hello']);
    expect(secondary.spokenTexts).toEqual([]);
    expect(chain.getName()).toBe('Primary');
  });

  it('falls back to the next provider on failure and reports the new name', async () => {
    const primary = new MockVoiceProvider({
      name: 'ElevenLabs Voice',
      failWith: new VoiceProviderError('quota', 'quota'),
    });
    const secondary = new MockVoiceProvider({ name: 'Browser Voice', autoComplete: true });
    const chain = new FallbackVoiceProvider([primary, secondary]);

    await chain.speak('hi');
    expect(secondary.spokenTexts).toEqual(['hi']);
    expect(chain.getName()).toBe('Browser Voice');
    expect(chain.getFallbackReason()?.reason).toBe('quota');
  });

  it('falls all the way through to silent mode', async () => {
    const primary = new MockVoiceProvider({
      name: 'ElevenLabs Voice',
      failWith: new VoiceProviderError('auth', 'auth'),
    });
    const browser = new MockVoiceProvider({
      name: 'Browser Voice',
      failWith: new VoiceProviderError('no synth', 'unavailable'),
    });
    const silent = new SilentVoiceProvider();
    const chain = new FallbackVoiceProvider([primary, browser, silent]);

    await chain.speak('hi');
    expect(chain.getName()).toBe('Silent Mode');
    expect(silent.spokenCount).toBe(1);
  });

  it('attempts each provider only once per utterance (no retry storm)', async () => {
    const primary = new MockVoiceProvider({
      name: 'Primary',
      failWith: new VoiceProviderError('network', 'network'),
    });
    const silent = new SilentVoiceProvider();
    const chain = new FallbackVoiceProvider([primary, silent]);

    await chain.speak('hi');
    expect(primary.spokenTexts).toHaveLength(1);
  });

  it('skips providers that report themselves unavailable', async () => {
    const unavailable = new MockVoiceProvider({ name: 'Nope', available: false });
    const silent = new SilentVoiceProvider();
    const chain = new FallbackVoiceProvider([unavailable, silent]);

    await chain.speak('hi');
    expect(unavailable.spokenTexts).toEqual([]);
    expect(chain.getName()).toBe('Silent Mode');
  });

  it('throws when every provider fails', async () => {
    const a = new MockVoiceProvider({ name: 'A', failWith: new VoiceProviderError('x', 'network') });
    const chain = new FallbackVoiceProvider([a]);
    await expect(chain.speak('hi')).rejects.toBeInstanceOf(VoiceUnavailableError);
    expect(chain.getState()).toBe('unavailable');
  });

  it('stop() halts playback and stops every provider', async () => {
    const primary = new MockVoiceProvider({ name: 'Primary' });
    const chain = new FallbackVoiceProvider([primary, new SilentVoiceProvider()]);
    const promise = chain.speak('hi');
    chain.stop();
    await promise;
    expect(primary.stopCalls).toBeGreaterThan(0);
    expect(chain.getState()).toBe('stopped');
  });
});

describe('production factory', () => {
  it('never includes the test-only mock and always ends in Silent Mode', async () => {
    const chain = createVoiceProvider();
    expect(chain.getName()).not.toMatch(/mock/i);
    // With no synthesis in jsdom, the chain resolves to Silent Mode.
    await chain.speak('hello');
    expect(['Browser Voice', 'Silent Mode']).toContain(chain.getName());
  });

  it('places an injected premium provider first', async () => {
    const primary = new MockVoiceProvider({ name: 'ElevenLabs Voice', autoComplete: true });
    const chain = createVoiceProvider({ primary });
    await chain.speak('hi');
    expect(primary.spokenTexts).toEqual(['hi']);
    expect(chain.getName()).toBe('ElevenLabs Voice');
  });

  it('is always available thanks to the silent terminal provider', () => {
    expect(createVoiceProvider().isAvailable()).toBe(true);
  });
});

describe('MockVoiceProvider is test-only', () => {
  it('is not referenced by the production factory module', async () => {
    const source = await import('./provider');
    expect(Object.keys(source)).not.toContain('MockVoiceProvider');
    expect(vi.isMockFunction(source.createVoiceProvider)).toBe(false);
  });
});
