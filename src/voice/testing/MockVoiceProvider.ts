import { VoiceProviderError } from '../errors';
import type {
  VoiceProvider,
  VoiceSpeakOptions,
  VoiceState,
  VoiceStateListener,
} from '../types';

/**
 * TEST-ONLY provider. Deliberately lives under `voice/testing/` and is never
 * imported by `provider.ts`, so it can never be selected in the production
 * fallback chain.
 */
export class MockVoiceProvider implements VoiceProvider {
  private readonly listeners = new Set<VoiceStateListener>();
  private state: VoiceState = 'idle';
  private resolveCurrent: (() => void) | null = null;
  private rejectCurrent: ((err: unknown) => void) | null = null;

  spokenTexts: string[] = [];
  stopCalls = 0;

  constructor(
    private options: {
      available?: boolean;
      name?: string;
      /** Fail every utterance with this reason (drives fallback tests). */
      failWith?: VoiceProviderError;
      /** Resolve immediately instead of waiting for finish(). */
      autoComplete?: boolean;
    } = {},
  ) {}

  getName(): string {
    return this.options.name ?? 'Mock Voice';
  }

  isAvailable(): boolean {
    return this.options.available ?? true;
  }

  getState(): VoiceState {
    return this.state;
  }

  subscribe(listener: VoiceStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(state: VoiceState): void {
    this.state = state;
    for (const l of this.listeners) l(state);
  }

  async speak(text: string, _options?: VoiceSpeakOptions): Promise<void> {
    if (!this.isAvailable()) {
      throw new VoiceProviderError('Mock unavailable.', 'unavailable');
    }
    this.spokenTexts.push(text);
    if (this.options.failWith) {
      this.setState('error');
      throw this.options.failWith;
    }
    this.setState('speaking');
    if (this.options.autoComplete) {
      this.setState('stopped');
      return;
    }
    await new Promise<void>((resolve, reject) => {
      this.resolveCurrent = resolve;
      this.rejectCurrent = reject;
    });
  }

  stop(): void {
    this.stopCalls += 1;
    if (this.resolveCurrent) {
      const resolve = this.resolveCurrent;
      this.resolveCurrent = null;
      this.rejectCurrent = null;
      this.setState('stopped');
      resolve();
      return;
    }
    if (this.state === 'speaking' || this.state === 'preparing') this.setState('stopped');
  }

  // --- test controls ---
  finish(): void {
    const resolve = this.resolveCurrent;
    this.resolveCurrent = null;
    this.rejectCurrent = null;
    this.setState('stopped');
    resolve?.();
  }

  fail(error: VoiceProviderError): void {
    const reject = this.rejectCurrent;
    this.resolveCurrent = null;
    this.rejectCurrent = null;
    this.setState('error');
    reject?.(error);
  }

  setAvailable(available: boolean): void {
    this.options = { ...this.options, available };
  }
}
