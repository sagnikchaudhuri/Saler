// ============================================================================
// Voice-output domain types.
//
// Output is a sibling of speech INPUT, not part of it: the conversation engine,
// scoring, and persistence stay entirely voice-agnostic. Providers are swapped
// through a fallback chain so the UI never couples to a specific one.
// ============================================================================

export type VoiceState =
  | 'idle'
  | 'preparing'
  | 'speaking'
  | 'stopped'
  | 'error'
  | 'unavailable';

export interface VoiceSpeakOptions {
  /** BCP-47 tag; providers may ignore it. */
  lang?: string;
  /** Identifies the utterance for logging/dedup at the caller level. */
  turnId?: string;
}

export type VoiceStateListener = (state: VoiceState) => void;

export interface VoiceProvider {
  getName(): string;
  isAvailable(): boolean;
  /**
   * Speak the text. Resolves when playback finishes; REJECTS when this
   * provider could not deliver audio, which is the signal for the fallback
   * chain to try the next provider.
   */
  speak(text: string, options?: VoiceSpeakOptions): Promise<void>;
  stop(): void;
  getState(): VoiceState;
  subscribe(listener: VoiceStateListener): () => void;
}

/** Default speech settings — deliberately neutral and professional. */
export const VOICE_DEFAULTS = {
  lang: 'en-IN',
  rate: 1,
  pitch: 1,
  volume: 1,
} as const;
