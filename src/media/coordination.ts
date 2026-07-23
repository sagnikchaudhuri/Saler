// ============================================================================
// Lightweight media coordination.
//
// Phase 6 will add customer audio output (ElevenLabs / browser speech). To
// avoid reworking microphone logic then, the rule that decides "may we listen
// right now?" lives here and already accounts for output playback. Nothing in
// this file starts or plays audio — it only computes the guard.
// ============================================================================

export interface MediaActivity {
  isListening: boolean;
  isOutputSpeaking: boolean;
  canStartListening: boolean;
}

export interface MediaActivityInput {
  /** A recognition session is currently active. */
  isListening: boolean;
  /** Customer audio is currently playing (Phase 6). */
  isOutputSpeaking?: boolean;
  /** Customer audio is being fetched/decoded and will play shortly (Phase 6). */
  isOutputPreparing?: boolean;
  /** The conversation is ready for seller input (WaitingForSeller). */
  conversationAcceptsInput: boolean;
  /** The browser supports speech recognition at all. */
  speechSupported: boolean;
  /** Permission was denied/blocked — do not re-prompt. */
  permissionBlocked: boolean;
}

/**
 * The single rule for whether listening may begin. Blocking on output playback
 * prevents the microphone from hearing the customer's own voice (a feedback
 * loop) once Phase 6 lands.
 */
export function computeMediaActivity(input: MediaActivityInput): MediaActivity {
  const isOutputSpeaking = input.isOutputSpeaking ?? false;
  const isOutputPreparing = input.isOutputPreparing ?? false;

  const canStartListening =
    input.speechSupported &&
    !input.permissionBlocked &&
    !input.isListening &&
    !isOutputSpeaking &&
    !isOutputPreparing &&
    input.conversationAcceptsInput;

  return {
    isListening: input.isListening,
    isOutputSpeaking,
    canStartListening,
  };
}
