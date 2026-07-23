import {
  defaultSpeechWindow,
  getSpeechRecognitionConstructor,
  type SpeechRecognitionLike,
  type SpeechWindowLike,
} from './speech-api';
import { mapSpeechError } from './errors';
import {
  SPEECH_DEFAULTS,
  type SpeechRecognitionEvent,
  type SpeechRecognitionListener,
  type SpeechRecognitionOptions,
  type SpeechRecognitionProvider,
  type SpeechRecognitionState,
} from './types';

/**
 * Wraps the browser's SpeechRecognition (or webkitSpeechRecognition).
 *
 * Responsibilities are deliberately narrow: start/stop a session, emit interim
 * and final transcripts, and report state/errors. It never touches the
 * conversation, transcript, or scoring.
 *
 * Permission note: the Web Speech API raises the microphone prompt itself when
 * start() is called, so we never call getUserMedia separately (that would show
 * a second, redundant permission surface). Because of that, start() is only
 * ever invoked from an explicit user action.
 */
export class BrowserSpeechRecognitionProvider implements SpeechRecognitionProvider {
  private readonly win: SpeechWindowLike | undefined;
  private readonly listeners = new Set<SpeechRecognitionListener>();
  private recognition: SpeechRecognitionLike | null = null;
  private state: SpeechRecognitionState;
  /** Finals already emitted this session — guards against repeated results. */
  private emittedFinals = 0;
  /** Set when the user cancels, so `aborted` is not shown as a failure. */
  private intentionalAbort = false;
  private maxDurationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(win: SpeechWindowLike | undefined = defaultSpeechWindow()) {
    this.win = win;
    this.state = this.isSupported() ? 'idle' : 'unsupported';
  }

  getName(): string {
    return 'Browser SpeechRecognition';
  }

  isSupported(): boolean {
    if (!this.win) return false;
    // Recognition requires a secure context (https or localhost).
    if (this.win.isSecureContext === false) return false;
    return getSpeechRecognitionConstructor(this.win) !== null;
  }

  getState(): SpeechRecognitionState {
    return this.state;
  }

  subscribe(listener: SpeechRecognitionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: SpeechRecognitionEvent): void {
    for (const l of this.listeners) l(event);
  }

  private setState(state: SpeechRecognitionState): void {
    this.state = state;
    this.emit({ type: 'state', state });
  }

  async start(options: SpeechRecognitionOptions = {}): Promise<void> {
    // Guard against double-starts / rapid clicks.
    if (this.state === 'listening' || this.state === 'requesting_permission') return;

    if (!this.win) {
      this.failUnsupported('unsupported');
      return;
    }
    if (this.win.isSecureContext === false) {
      this.failUnsupported('insecure-context');
      return;
    }
    const Ctor = getSpeechRecognitionConstructor(this.win);
    if (!Ctor) {
      this.failUnsupported('unsupported');
      return;
    }

    const opts = { ...SPEECH_DEFAULTS, ...options };
    this.emittedFinals = 0;
    this.intentionalAbort = false;

    const recognition = new Ctor();
    recognition.lang = opts.lang;
    recognition.continuous = opts.continuous;
    recognition.interimResults = opts.interimResults;
    recognition.maxAlternatives = 1;
    this.recognition = recognition;

    recognition.onstart = () => {
      this.setState('listening');
    };

    recognition.onresult = (event) => {
      const results = event.results;
      let interim = '';
      const finals: string[] = [];
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) finals.push(text);
        else interim += text;
      }
      // Only emit finals we have not emitted before: some browsers re-deliver
      // the whole results list on every event.
      if (finals.length > this.emittedFinals) {
        const fresh = finals.slice(this.emittedFinals).join(' ').trim();
        this.emittedFinals = finals.length;
        if (fresh) this.emit({ type: 'final', transcript: fresh });
      }
      this.emit({ type: 'interim', transcript: interim.trim() });
    };

    recognition.onerror = (event) => {
      const error = mapSpeechError(event.error, this.intentionalAbort);
      this.clearTimer();
      if (error.intentional) {
        // A deliberate cancel is not a failure.
        this.setState('stopped');
        return;
      }
      this.emit({ type: 'error', error });
      this.setState('error');
    };

    recognition.onend = () => {
      this.clearTimer();
      this.detach();
      // An error already moved us to 'error'; otherwise the session is done.
      if (this.state !== 'error') this.setState('stopped');
    };

    this.setState('requesting_permission');
    try {
      recognition.start();
    } catch {
      // e.g. InvalidStateError from an overlapping session.
      this.clearTimer();
      this.detach();
      this.emit({ type: 'error', error: mapSpeechError('unknown') });
      this.setState('error');
      return;
    }

    if (opts.maxDurationMs > 0) {
      this.maxDurationTimer = setTimeout(() => this.stop(), opts.maxDurationMs);
    }
  }

  stop(): void {
    this.clearTimer();
    if (!this.recognition) return;
    if (this.state === 'listening' || this.state === 'requesting_permission') {
      this.setState('processing');
    }
    try {
      this.recognition.stop();
    } catch {
      // Already stopped; onend cleanup still applies.
      this.detach();
      this.setState('stopped');
    }
  }

  abort(): void {
    this.clearTimer();
    if (!this.recognition) {
      // Nothing running: keep state sane without inventing an error.
      if (this.state === 'listening' || this.state === 'requesting_permission') {
        this.setState('stopped');
      }
      return;
    }
    this.intentionalAbort = true;
    try {
      this.recognition.abort();
    } catch {
      // ignore — we clean up below regardless
    }
    this.detach();
    this.setState('stopped');
  }

  private failUnsupported(code: 'unsupported' | 'insecure-context'): void {
    this.emit({ type: 'error', error: mapSpeechError(code) });
    this.setState('unsupported');
  }

  /** Drop handlers so stale events can never fire after cleanup. */
  private detach(): void {
    const r = this.recognition;
    if (!r) return;
    r.onstart = null;
    r.onend = null;
    r.onresult = null;
    r.onerror = null;
    this.recognition = null;
  }

  private clearTimer(): void {
    if (this.maxDurationTimer !== null) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }
  }
}
