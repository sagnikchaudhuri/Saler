// ============================================================================
// Minimal, precise typings for the Web Speech API.
//
// TypeScript's DOM lib does not ship SpeechRecognition types (it is not a
// finished standard), so we declare exactly the surface we use rather than
// reaching for `any`. Both the standard and the WebKit-prefixed constructors
// are supported.
// ============================================================================

export interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
  readonly confidence: number;
}

export interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionResultListLike {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResultLike;
}

export interface SpeechRecognitionResultEventLike {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}

export interface SpeechRecognitionErrorEventLike {
  /** e.g. "no-speech", "not-allowed", "network", "aborted". */
  readonly error: string;
  readonly message?: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

/** The slice of `window` we need. Lets tests inject a fake window. */
export interface SpeechWindowLike {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
  isSecureContext?: boolean;
}

/**
 * Resolve the recognition constructor, preferring the standard name and
 * falling back to the WebKit-prefixed one used by Chromium browsers.
 */
export function getSpeechRecognitionConstructor(
  win: SpeechWindowLike | undefined,
): SpeechRecognitionConstructor | null {
  if (!win) return null;
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

/** The default browser window, typed, or undefined outside a browser. */
export function defaultSpeechWindow(): SpeechWindowLike | undefined {
  if (typeof window === 'undefined') return undefined;
  return window as unknown as SpeechWindowLike;
}
