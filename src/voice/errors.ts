/** Raised when a provider cannot deliver audio; signals the fallback chain. */
export class VoiceProviderError extends Error {
  constructor(
    message: string,
    /** Machine-readable reason, safe to display/log (never contains secrets). */
    readonly reason:
      | 'unavailable'
      | 'network'
      | 'timeout'
      | 'invalid-response'
      | 'autoplay-blocked'
      | 'playback-failed'
      | 'cancelled'
      | 'configuration'
      | 'quota'
      | 'auth'
      | 'unknown' = 'unknown',
  ) {
    super(message);
    this.name = 'VoiceProviderError';
  }
}

/** Every provider in the chain failed or was unavailable. */
export class VoiceUnavailableError extends VoiceProviderError {
  constructor(message = 'Voice output is unavailable.') {
    super(message, 'unavailable');
    this.name = 'VoiceUnavailableError';
  }
}

/** User-facing messages. Never include upstream bodies or secrets. */
export const VOICE_MESSAGES = {
  silent:
    'Voice output is unavailable. The customer response is still available in the transcript.',
  fellBackToBrowser:
    'Premium voice was unavailable, so the browser’s built-in voice is being used.',
  autoplayBlocked:
    'Your browser blocked automatic audio. Press “Play customer response” to hear it.',
} as const;
