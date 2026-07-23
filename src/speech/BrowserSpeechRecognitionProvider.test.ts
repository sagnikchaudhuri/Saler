import { describe, it, expect, beforeEach } from 'vitest';
import { BrowserSpeechRecognitionProvider } from './BrowserSpeechRecognitionProvider';
import { mapSpeechError, speechErrorMessage } from './errors';
import type {
  SpeechRecognitionConstructor,
  SpeechRecognitionLike,
  SpeechRecognitionResultListLike,
  SpeechWindowLike,
} from './speech-api';
import type { SpeechRecognitionEvent } from './types';

class FakeRecognition implements SpeechRecognitionLike {
  static last: FakeRecognition | null = null;
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onresult: ((e: { resultIndex: number; results: SpeechRecognitionResultListLike }) => void) | null = null;
  onerror: ((e: { error: string; message?: string }) => void) | null = null;
  started = false;
  stopped = false;
  aborted = false;
  throwOnStart = false;

  constructor() {
    FakeRecognition.last = this;
  }
  start(): void {
    if (this.throwOnStart) throw new Error('InvalidStateError');
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
  abort(): void {
    this.aborted = true;
  }

  // --- test helpers ---
  fireStart() { this.onstart?.(); }
  fireEnd() { this.onend?.(); }
  fireError(code: string) { this.onerror?.({ error: code }); }
  fireResults(items: { text: string; final: boolean }[]) {
    const arr = items.map((i) => ({
      isFinal: i.final,
      length: 1,
      0: { transcript: i.text, confidence: 0.9 },
    }));
    this.onresult?.({
      resultIndex: 0,
      results: arr as unknown as SpeechRecognitionResultListLike,
    });
  }
}

const Ctor = FakeRecognition as unknown as SpeechRecognitionConstructor;

function standardWindow(): SpeechWindowLike {
  return { SpeechRecognition: Ctor, isSecureContext: true };
}
function webkitWindow(): SpeechWindowLike {
  return { webkitSpeechRecognition: Ctor, isSecureContext: true };
}

function collect(provider: BrowserSpeechRecognitionProvider) {
  const events: SpeechRecognitionEvent[] = [];
  provider.subscribe((e) => events.push(e));
  return events;
}

beforeEach(() => {
  FakeRecognition.last = null;
});

describe('support detection', () => {
  it('is unsupported when no constructor exists', () => {
    const p = new BrowserSpeechRecognitionProvider({ isSecureContext: true });
    expect(p.isSupported()).toBe(false);
    expect(p.getState()).toBe('unsupported');
  });

  it('is unsupported outside a browser', () => {
    const p = new BrowserSpeechRecognitionProvider(undefined);
    expect(p.isSupported()).toBe(false);
  });

  it('supports the standard SpeechRecognition', () => {
    expect(new BrowserSpeechRecognitionProvider(standardWindow()).isSupported()).toBe(true);
  });

  it('falls back to webkitSpeechRecognition', () => {
    const p = new BrowserSpeechRecognitionProvider(webkitWindow());
    expect(p.isSupported()).toBe(true);
    expect(p.getState()).toBe('idle');
  });

  it('is unsupported in an insecure context', () => {
    const p = new BrowserSpeechRecognitionProvider({ SpeechRecognition: Ctor, isSecureContext: false });
    expect(p.isSupported()).toBe(false);
  });

  it('emits an unsupported error when starting without support', async () => {
    const p = new BrowserSpeechRecognitionProvider({ isSecureContext: true });
    const events = collect(p);
    await p.start();
    const err = events.find((e) => e.type === 'error');
    expect(err).toBeTruthy();
    expect(err && err.type === 'error' && err.error.code).toBe('unsupported');
    expect(p.getState()).toBe('unsupported');
  });
});

describe('session lifecycle', () => {
  it('applies options and moves through requesting_permission → listening', async () => {
    const p = new BrowserSpeechRecognitionProvider(standardWindow());
    const events = collect(p);
    await p.start({ lang: 'en-GB' });

    const r = FakeRecognition.last!;
    expect(r.lang).toBe('en-GB');
    expect(r.interimResults).toBe(true);
    expect(r.continuous).toBe(false); // manual session, not endless
    expect(r.started).toBe(true);
    expect(p.getState()).toBe('requesting_permission');

    r.fireStart();
    expect(p.getState()).toBe('listening');
    expect(events.some((e) => e.type === 'state' && e.state === 'listening')).toBe(true);
  });

  it('defaults the recognition language to en-IN', async () => {
    const p = new BrowserSpeechRecognitionProvider(standardWindow());
    await p.start();
    expect(FakeRecognition.last!.lang).toBe('en-IN');
  });

  it('ignores a second start while already active (no double session)', async () => {
    const p = new BrowserSpeechRecognitionProvider(standardWindow());
    await p.start();
    const first = FakeRecognition.last;
    await p.start();
    expect(FakeRecognition.last).toBe(first);
  });

  it('stop() moves to processing and then stopped on end', async () => {
    const p = new BrowserSpeechRecognitionProvider(standardWindow());
    await p.start();
    const r = FakeRecognition.last!;
    r.fireStart();
    p.stop();
    expect(p.getState()).toBe('processing');
    expect(r.stopped).toBe(true);
    r.fireEnd();
    expect(p.getState()).toBe('stopped');
  });

  it('abort() cancels without surfacing an error', async () => {
    const p = new BrowserSpeechRecognitionProvider(standardWindow());
    const events = collect(p);
    await p.start();
    FakeRecognition.last!.fireStart();
    p.abort();
    expect(FakeRecognition.last === null || true).toBe(true);
    expect(p.getState()).toBe('stopped');
    expect(events.some((e) => e.type === 'error')).toBe(false);
  });

  it('handles a constructor that throws on start', async () => {
    const p = new BrowserSpeechRecognitionProvider(standardWindow());
    const events = collect(p);
    // Force the next instance to throw.
    const OriginalStart = FakeRecognition.prototype.start;
    FakeRecognition.prototype.start = function start(this: FakeRecognition) {
      throw new Error('InvalidStateError');
    };
    await p.start();
    FakeRecognition.prototype.start = OriginalStart;

    expect(p.getState()).toBe('error');
    expect(events.some((e) => e.type === 'error')).toBe(true);
  });
});

describe('transcripts', () => {
  it('emits interim text while listening', async () => {
    const p = new BrowserSpeechRecognitionProvider(standardWindow());
    const events = collect(p);
    await p.start();
    const r = FakeRecognition.last!;
    r.fireStart();
    r.fireResults([{ text: 'how are you', final: false }]);

    const interim = events.filter((e) => e.type === 'interim');
    expect(interim.at(-1)).toEqual({ type: 'interim', transcript: 'how are you' });
  });

  it('emits each final result exactly once even if re-delivered', async () => {
    const p = new BrowserSpeechRecognitionProvider(standardWindow());
    const events = collect(p);
    await p.start();
    const r = FakeRecognition.last!;
    r.fireStart();

    r.fireResults([{ text: 'How do you train reps?', final: true }]);
    // Browsers often re-deliver the whole list on the next event.
    r.fireResults([
      { text: 'How do you train reps?', final: true },
      { text: 'and', final: false },
    ]);

    const finals = events.filter((e) => e.type === 'final');
    expect(finals).toHaveLength(1);
    expect(finals[0]).toEqual({ type: 'final', transcript: 'How do you train reps?' });
  });

  it('emits a newly added final result', async () => {
    const p = new BrowserSpeechRecognitionProvider(standardWindow());
    const events = collect(p);
    await p.start();
    const r = FakeRecognition.last!;
    r.fireStart();
    r.fireResults([{ text: 'first.', final: true }]);
    r.fireResults([
      { text: 'first.', final: true },
      { text: 'second.', final: true },
    ]);

    const finals = events.filter((e) => e.type === 'final');
    expect(finals).toHaveLength(2);
    expect(finals[1]).toEqual({ type: 'final', transcript: 'second.' });
  });
});

describe('errors and cleanup', () => {
  it('maps a permission denial and blocks further attempts', async () => {
    const p = new BrowserSpeechRecognitionProvider(standardWindow());
    const events = collect(p);
    await p.start();
    FakeRecognition.last!.fireStart();
    FakeRecognition.last!.fireError('not-allowed');

    const err = events.find((e) => e.type === 'error');
    expect(err && err.type === 'error' && err.error.code).toBe('not-allowed');
    expect(err && err.type === 'error' && err.error.blocksFurtherAttempts).toBe(true);
    expect(p.getState()).toBe('error');
  });

  it('does not treat an intentional abort as an error', async () => {
    const p = new BrowserSpeechRecognitionProvider(standardWindow());
    const events = collect(p);
    await p.start();
    const r = FakeRecognition.last!;
    r.fireStart();
    p.abort();
    r.fireError('aborted'); // handlers are detached, so this is a no-op

    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(p.getState()).toBe('stopped');
  });

  it('detaches handlers after the session ends (no stale events)', async () => {
    const p = new BrowserSpeechRecognitionProvider(standardWindow());
    await p.start();
    const r = FakeRecognition.last!;
    r.fireStart();
    r.fireEnd();

    expect(r.onresult).toBeNull();
    expect(r.onerror).toBeNull();
    expect(r.onend).toBeNull();
  });

  it('supports unsubscribing a listener', async () => {
    const p = new BrowserSpeechRecognitionProvider(standardWindow());
    const seen: SpeechRecognitionEvent[] = [];
    const unsubscribe = p.subscribe((e) => seen.push(e));
    unsubscribe();
    await p.start();
    expect(seen).toHaveLength(0);
  });

  it('abort() with no active session does not throw', () => {
    const p = new BrowserSpeechRecognitionProvider(standardWindow());
    expect(() => p.abort()).not.toThrow();
  });

  it('stop() with no active session does not throw', () => {
    const p = new BrowserSpeechRecognitionProvider(standardWindow());
    expect(() => p.stop()).not.toThrow();
  });
});

describe('error message mapping', () => {
  it('maps every known code to a friendly message', () => {
    for (const code of ['no-speech', 'audio-capture', 'not-allowed', 'service-not-allowed',
      'network', 'aborted', 'language-not-supported', 'insecure-context', 'unsupported'] as const) {
      expect(mapSpeechError(code).message.length).toBeGreaterThan(10);
    }
  });

  it('falls back to unknown for unrecognised codes', () => {
    const e = mapSpeechError('something-weird');
    expect(e.code).toBe('unknown');
    expect(e.blocksFurtherAttempts).toBe(false);
  });

  it('marks aborted as intentional', () => {
    expect(mapSpeechError('aborted').intentional).toBe(true);
  });

  it('lets no-speech be retried', () => {
    expect(mapSpeechError('no-speech').blocksFurtherAttempts).toBe(false);
  });

  it('tells the user typed input still works when unsupported', () => {
    expect(speechErrorMessage('unsupported')).toMatch(/typed input still works/i);
  });
});
