import { VoiceProviderError, VoiceUnavailableError } from './errors';
import type {
  VoiceProvider,
  VoiceSpeakOptions,
  VoiceState,
  VoiceStateListener,
} from './types';

/**
 * Tries providers in order until one delivers audio.
 *
 * Exactly ONE attempt per provider per utterance — no retry storms. The name
 * of the provider that actually spoke is exposed so the UI can be honest about
 * which voice the user heard (never claiming ElevenLabs when it fell back).
 */
export class FallbackVoiceProvider implements VoiceProvider {
  private readonly listeners = new Set<VoiceStateListener>();
  private state: VoiceState = 'idle';
  private active: VoiceProvider | null = null;
  private activeName: string;
  private lastFallbackReason: VoiceProviderError | null = null;
  private stopped = false;

  constructor(private readonly providers: VoiceProvider[]) {
    if (providers.length === 0) {
      throw new Error('FallbackVoiceProvider requires at least one provider.');
    }
    this.activeName = providers.find((p) => p.isAvailable())?.getName() ?? providers[0].getName();
  }

  getName(): string {
    return this.activeName;
  }

  /** True while any provider can serve (the silent provider always can). */
  isAvailable(): boolean {
    return this.providers.some((p) => p.isAvailable());
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

  /** The error that caused a downgrade on the last utterance, if any. */
  getFallbackReason(): VoiceProviderError | null {
    return this.lastFallbackReason;
  }

  private setState(state: VoiceState): void {
    this.state = state;
    for (const l of this.listeners) l(state);
  }

  async speak(text: string, options?: VoiceSpeakOptions): Promise<void> {
    this.stopAll();
    this.stopped = false;
    this.lastFallbackReason = null;
    this.setState('preparing');

    for (const provider of this.providers) {
      if (this.stopped) {
        this.setState('stopped');
        return;
      }
      if (!provider.isAvailable()) continue;

      this.active = provider;
      this.activeName = provider.getName();

      // Mirror the attempted provider's state while it owns playback.
      const unsubscribe = provider.subscribe((s) => {
        if (this.active === provider) this.setState(s);
      });

      try {
        await provider.speak(text, options);
        unsubscribe();
        // Finished normally. Silent provider never enters 'speaking', so
        // normalise the terminal state here.
        if (this.state !== 'stopped') this.setState('idle');
        return;
      } catch (err) {
        unsubscribe();
        this.active = null;
        if (err instanceof VoiceProviderError && err.reason === 'cancelled') {
          this.setState('stopped');
          return;
        }
        this.lastFallbackReason =
          err instanceof VoiceProviderError
            ? err
            : new VoiceProviderError('Voice provider failed.', 'unknown');
        // Fall through to the next provider — one attempt each.
      }
    }

    this.setState('unavailable');
    throw new VoiceUnavailableError();
  }

  stop(): void {
    this.stopped = true;
    this.stopAll();
    this.setState('stopped');
  }

  private stopAll(): void {
    for (const p of this.providers) {
      try {
        p.stop();
      } catch {
        // never let one provider's cleanup break the chain
      }
    }
    this.active = null;
  }
}
