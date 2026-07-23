// ============================================================================
// Speech-input domain types.
//
// These states are deliberately SEPARATE from the conversation engine's state
// machine. The speech provider's only job is capturing seller text; evaluating,
// customer generation, transcript, scoring, and the final report all remain the
// conversation engine's responsibility. Browser speech state never enters the
// deterministic scoring logic.
// ============================================================================

export type SpeechRecognitionState =
  | 'unsupported'
  | 'idle'
  | 'requesting_permission'
  | 'listening'
  | 'processing'
  | 'stopped'
  | 'error';

export type SpeechErrorCode =
  | 'no-speech'
  | 'audio-capture'
  | 'not-allowed'
  | 'service-not-allowed'
  | 'network'
  | 'aborted'
  | 'language-not-supported'
  | 'insecure-context'
  | 'unsupported'
  | 'unknown';

export interface SpeechError {
  code: SpeechErrorCode;
  /** Beginner-friendly, safe to display. */
  message: string;
  /** True when the user cancelled deliberately — not a real failure. */
  intentional: boolean;
  /** True when the browser will not prompt again without user intervention. */
  blocksFurtherAttempts: boolean;
}

export interface SpeechRecognitionOptions {
  /** BCP-47 language tag. Configurable in code; defaults to en-IN. */
  lang?: string;
  interimResults?: boolean;
  /**
   * Continuous listening is fragile across browsers, so we default to a
   * manually controlled (push-to-talk style) session.
   */
  continuous?: boolean;
  /** Safety auto-stop so a forgotten session cannot listen forever. */
  maxDurationMs?: number;
}

export const SPEECH_DEFAULTS: Required<SpeechRecognitionOptions> = {
  lang: 'en-IN',
  interimResults: true,
  continuous: false,
  maxDurationMs: 30_000,
};

export type SpeechRecognitionEvent =
  | { type: 'state'; state: SpeechRecognitionState }
  | { type: 'interim'; transcript: string }
  | { type: 'final'; transcript: string }
  | { type: 'error'; error: SpeechError };

export type SpeechRecognitionListener = (event: SpeechRecognitionEvent) => void;

/**
 * The provider contract. React components never touch browser speech APIs
 * directly — they go through an implementation of this interface.
 */
export interface SpeechRecognitionProvider {
  getName(): string;
  isSupported(): boolean;
  /** Resolves once the session has started or failed; errors arrive as events. */
  start(options?: SpeechRecognitionOptions): Promise<void>;
  /** Graceful stop: keeps whatever was recognised. */
  stop(): void;
  /** Immediate cancel: intentional, and must not surface as a scary error. */
  abort(): void;
  subscribe(listener: SpeechRecognitionListener): () => void;
  getState(): SpeechRecognitionState;
}
