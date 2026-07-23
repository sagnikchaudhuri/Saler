import type { SpeechError, SpeechErrorCode } from './types';

// ============================================================================
// Error mapping.
//
// Every message is beginner-friendly, never blames the user, and always points
// out that typed input still works — speech failing must never feel like the
// roleplay is broken.
// ============================================================================

const MESSAGES: Record<SpeechErrorCode, string> = {
  'no-speech':
    "I didn't catch anything. Try speaking again, or type your response instead.",
  'audio-capture':
    'No microphone was found. Check that one is connected, or continue by typing.',
  'not-allowed':
    'Microphone access was blocked. You can enable it in your browser settings, or continue by typing.',
  'service-not-allowed':
    'Your browser blocked the speech service. You can continue by typing.',
  network:
    'Speech recognition needs an internet connection. Check your connection, or type instead.',
  aborted: 'Voice input cancelled.',
  'language-not-supported':
    "This language isn't supported for speech in this browser. Typed input still works normally.",
  'insecure-context':
    'Speech input needs a secure (https) connection. Typed input still works normally.',
  unsupported:
    'Speech recognition is unavailable in this browser. Typed input still works normally.',
  unknown:
    'Voice input ran into a problem. You can try again, or type your response.',
};

const KNOWN_CODES = new Set<string>(Object.keys(MESSAGES));

/**
 * Map a raw browser error string to a typed, displayable SpeechError.
 * `intentional` marks user-driven cancellation so the UI can stay calm;
 * `blocksFurtherAttempts` marks states where re-prompting would be futile,
 * so we never reopen the permission dialog in a loop.
 */
export function mapSpeechError(raw: string, intentional = false): SpeechError {
  const code: SpeechErrorCode = KNOWN_CODES.has(raw)
    ? (raw as SpeechErrorCode)
    : 'unknown';

  return {
    code,
    message: MESSAGES[code],
    intentional: intentional || code === 'aborted',
    blocksFurtherAttempts:
      code === 'not-allowed' ||
      code === 'service-not-allowed' ||
      code === 'unsupported' ||
      code === 'insecure-context',
  };
}

/** Message lookup for a known code (used for support/permission notices). */
export function speechErrorMessage(code: SpeechErrorCode): string {
  return MESSAGES[code];
}
