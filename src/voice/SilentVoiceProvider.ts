import type {
  VoiceProvider,
  VoiceState,
  VoiceStateListener,
} from './types';

/**
 * Final step in the chain: no audio, but a complete roleplay.
 *
 * It never claims to have spoken — the state stays `idle`, so the UI shows
 * "Silent Mode" rather than "Rohan is speaking". Silent Mode is a legitimate
 * operating state, not an application failure.
 */
export class SilentVoiceProvider implements VoiceProvider {
  private readonly listeners = new Set<VoiceStateListener>();
  private state: VoiceState = 'idle';
  /** Number of utterances that completed silently (useful in tests/UI copy). */
  spokenCount = 0;

  getName(): string {
    return 'Silent Mode';
  }

  /** Always available — this is the guaranteed terminal fallback. */
  isAvailable(): boolean {
    return true;
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

  async speak(): Promise<void> {
    // Deliberately produces no audio and does NOT enter the 'speaking' state,
    // so nothing in the UI implies audio played.
    this.spokenCount += 1;
  }

  stop(): void {
    // Nothing is playing; keep state honest.
  }
}
