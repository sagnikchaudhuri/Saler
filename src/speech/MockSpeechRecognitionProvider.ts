import { mapSpeechError } from './errors';
import type {
  SpeechRecognitionEvent,
  SpeechRecognitionListener,
  SpeechRecognitionOptions,
  SpeechRecognitionProvider,
  SpeechRecognitionState,
} from './types';

/**
 * Deterministic in-memory provider for tests and for exercising the UI without
 * a real microphone. Tests drive it with emitInterim/emitFinal/emitError/finish.
 */
export class MockSpeechRecognitionProvider implements SpeechRecognitionProvider {
  private readonly listeners = new Set<SpeechRecognitionListener>();
  private state: SpeechRecognitionState;
  private supported: boolean;
  /** Options captured from the last start() call, for assertions. */
  lastOptions: SpeechRecognitionOptions | undefined;
  startCalls = 0;
  stopCalls = 0;
  abortCalls = 0;

  constructor(opts: { supported?: boolean } = {}) {
    this.supported = opts.supported ?? true;
    this.state = this.supported ? 'idle' : 'unsupported';
  }

  getName(): string {
    return 'Mock speech recognition';
  }

  isSupported(): boolean {
    return this.supported;
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

  async start(options?: SpeechRecognitionOptions): Promise<void> {
    if (!this.supported) {
      this.emit({ type: 'error', error: mapSpeechError('unsupported') });
      this.setState('unsupported');
      return;
    }
    // Mirror the real provider's double-start guard.
    if (this.state === 'listening' || this.state === 'requesting_permission') return;
    this.startCalls += 1;
    this.lastOptions = options;
    this.setState('requesting_permission');
    this.setState('listening');
  }

  stop(): void {
    this.stopCalls += 1;
    if (this.state !== 'listening' && this.state !== 'requesting_permission') return;
    this.setState('processing');
    this.setState('stopped');
  }

  abort(): void {
    this.abortCalls += 1;
    if (this.state === 'listening' || this.state === 'requesting_permission') {
      this.setState('stopped');
    }
  }

  // --- test controls --------------------------------------------------------

  emitInterim(transcript: string): void {
    this.emit({ type: 'interim', transcript });
  }

  emitFinal(transcript: string): void {
    this.emit({ type: 'final', transcript });
  }

  /** Emit a raw browser error code (e.g. "not-allowed", "no-speech"). */
  emitError(raw: string): void {
    const error = mapSpeechError(raw);
    if (error.intentional) {
      this.setState('stopped');
      return;
    }
    this.emit({ type: 'error', error });
    this.setState('error');
  }

  /** Simulate the browser ending the session on its own (e.g. after silence). */
  finish(): void {
    this.setState('stopped');
  }

  setSupported(supported: boolean): void {
    this.supported = supported;
    this.state = supported ? 'idle' : 'unsupported';
  }
}
