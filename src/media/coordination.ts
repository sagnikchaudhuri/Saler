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
  isOutputPreparing: boolean;
  canStartListening: boolean;
  /** Whether customer audio may begin right now. */
  canStartOutput: boolean;
  /** Output wants to start but recognition must be stopped first. */
  mustStopRecognitionForOutput: boolean;
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
  /** The user's voice-output toggle. Defaults to enabled. */
  voiceEnabled?: boolean;
}

/**
 * The single rule for whether listening may begin. Blocking on output playback
 * prevents the microphone from hearing the customer's own voice (a feedback
 * loop) once Phase 6 lands.
 */
export function computeMediaActivity(input: MediaActivityInput): MediaActivity {
  const isOutputSpeaking = input.isOutputSpeaking ?? false;
  const isOutputPreparing = input.isOutputPreparing ?? false;
  const voiceEnabled = input.voiceEnabled ?? true;

  // Input side: never listen while output is preparing or playing.
  const canStartListening =
    input.speechSupported &&
    !input.permissionBlocked &&
    !input.isListening &&
    !isOutputSpeaking &&
    !isOutputPreparing &&
    input.conversationAcceptsInput;

  // Output side: never speak over an open microphone. Recognition must be
  // stopped through the speech controller first — hence the explicit flag.
  const canStartOutput =
    voiceEnabled && !input.isListening && !isOutputSpeaking && !isOutputPreparing;

  return {
    isListening: input.isListening,
    isOutputSpeaking,
    isOutputPreparing,
    canStartListening,
    canStartOutput,
    mustStopRecognitionForOutput: voiceEnabled && input.isListening,
  };
}
