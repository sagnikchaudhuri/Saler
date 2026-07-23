import { VoiceProviderError } from './errors';
import {
  VOICE_DEFAULTS,
  type VoiceProvider,
  type VoiceSpeakOptions,
  type VoiceState,
  type VoiceStateListener,
} from './types';

// ---------------------------------------------------------------------------
// Minimal typings for the speech-synthesis surface we use, so the provider can
// be driven by a fake in tests without `any`.
// ---------------------------------------------------------------------------

export interface SynthesisVoiceLike {
  name: string;
  lang: string;
  default?: boolean;
}

export interface UtteranceLike {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  volume: number;
  voice: SynthesisVoiceLike | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
}

export interface SpeechSynthesisLike {
  speak(utterance: UtteranceLike): void;
  cancel(): void;
  getVoices(): SynthesisVoiceLike[];
}

export interface SynthesisWindowLike {
  speechSynthesis?: SpeechSynthesisLike;
  SpeechSynthesisUtterance?: new (text: string) => UtteranceLike;
}

function defaultSynthesisWindow(): SynthesisWindowLike | undefined {
  if (typeof window === 'undefined') return undefined;
  return window as unknown as SynthesisWindowLike;
}

/**
 * Fallback voice using the browser's built-in speech synthesis. Requires no
 * key, no network, and no server route — which is what makes it a dependable
 * second step in the chain (and keeps Demo Mode audible).
 */
export class BrowserSpeechSynthesisProvider implements VoiceProvider {
  private readonly win: SynthesisWindowLike | undefined;
  private readonly listeners = new Set<VoiceStateListener>();
  private state: VoiceState;
  private current: UtteranceLike | null = null;
  /** Guards against a duplicate utterance from StrictMode double-invocation. */
  private activeToken = 0;
  /**
   * Settles the in-flight speak() promise. Without this, calling stop() while
   * speaking would leave the awaiting caller hanging forever.
   */
  private settleCurrent: (() => void) | null = null;

  constructor(win: SynthesisWindowLike | undefined = defaultSynthesisWindow()) {
    this.win = win;
    this.state = this.isAvailable() ? 'idle' : 'unavailable';
  }

  getName(): string {
    return 'Browser Voice';
  }

  isAvailable(): boolean {
    return Boolean(this.win?.speechSynthesis && this.win?.SpeechSynthesisUtterance);
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

  /** Prefer an English voice; never depend on one specific installed voice. */
  private pickVoice(lang: string): SynthesisVoiceLike | null {
    const synth = this.win?.speechSynthesis;
    if (!synth) return null;
    let voices: SynthesisVoiceLike[] = [];
    try {
      voices = synth.getVoices() ?? [];
    } catch {
      return null;
    }
    if (voices.length === 0) return null;
    return (
      voices.find((v) => v.lang === lang) ??
      voices.find((v) => v.lang?.toLowerCase().startsWith('en')) ??
      null
    );
  }

  async speak(text: string, options: VoiceSpeakOptions = {}): Promise<void> {
    if (!this.isAvailable()) {
      throw new VoiceProviderError('Speech synthesis is not available.', 'unavailable');
    }
    const synth = this.win!.speechSynthesis!;
    const Utterance = this.win!.SpeechSynthesisUtterance!;

    // One utterance at a time.
    this.stop();

    const token = ++this.activeToken;
    const utterance = new Utterance(text);
    utterance.lang = options.lang ?? VOICE_DEFAULTS.lang;
    utterance.rate = VOICE_DEFAULTS.rate;
    utterance.pitch = VOICE_DEFAULTS.pitch;
    utterance.volume = VOICE_DEFAULTS.volume;
    utterance.voice = this.pickVoice(utterance.lang);
    this.current = utterance;

    this.setState('speaking');

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        utterance.onend = null;
        utterance.onerror = null;
        if (this.current === utterance) this.current = null;
        if (this.settleCurrent === settle) this.settleCurrent = null;
      };

      // stop() calls this so the awaiting caller always completes.
      const settle = () => {
        cleanup();
        resolve();
      };
      this.settleCurrent = settle;

      utterance.onend = () => {
        cleanup();
        // A newer utterance superseded this one — don't clobber its state.
        if (token !== this.activeToken) return resolve();
        this.setState('stopped');
        resolve();
      };

      utterance.onerror = (event) => {
        cleanup();
        if (token !== this.activeToken) return resolve();
        // A cancel triggers an error in some browsers; that is not a failure.
        if (event?.error === 'interrupted' || event?.error === 'canceled') {
          this.setState('stopped');
          return resolve();
        }
        this.setState('error');
        reject(new VoiceProviderError('Browser speech failed.', 'playback-failed'));
      };

      try {
        synth.speak(utterance);
      } catch {
        cleanup();
        this.setState('error');
        reject(new VoiceProviderError('Browser speech could not start.', 'playback-failed'));
      }
    });
  }

  stop(): void {
    this.activeToken += 1; // invalidate any in-flight utterance callbacks
    const synth = this.win?.speechSynthesis;
    if (this.current) {
      this.current.onend = null;
      this.current.onerror = null;
      this.current = null;
    }
    try {
      synth?.cancel();
    } catch {
      // ignore
    }
    if (this.state === 'speaking' || this.state === 'preparing') this.setState('stopped');
    // Release any caller awaiting this utterance.
    const settle = this.settleCurrent;
    this.settleCurrent = null;
    settle?.();
  }
}
