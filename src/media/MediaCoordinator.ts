// ============================================================================
// MediaCoordinator
//
// The single broker between the speech-INPUT controller and the voice-OUTPUT
// controller. Neither one reaches into the other's browser APIs: the speech
// controller registers its own stop function, and the voice controller asks the
// coordinator to stop recognition before playback begins.
//
// It is a plain object (no React, no globals) created in App and passed down,
// which keeps it explicit and trivially testable.
// ============================================================================

export interface RecognitionControl {
  /** Stop/abort recognition using the speech controller's own logic. */
  stop: () => void;
  /** Whether a recognition session is currently active. */
  isActive: () => boolean;
}

export interface MediaCoordinator {
  registerRecognition(control: RecognitionControl): () => void;
  /** True when a recognition session is currently running. */
  isRecognitionActive(): boolean;
  /**
   * Ensure the microphone is closed before audio output starts.
   * Returns true if recognition was stopped as a result.
   */
  stopRecognitionForOutput(): boolean;
  registerOutput(control: { stop: () => void }): () => void;
  /** Stop any audio output (End Call, navigation, submit). */
  stopOutput(): void;
  /** Stop both directions — used by End Call and teardown. */
  stopAll(): void;
}

export function createMediaCoordinator(): MediaCoordinator {
  let recognition: RecognitionControl | null = null;
  let output: { stop: () => void } | null = null;

  return {
    registerRecognition(control) {
      recognition = control;
      return () => {
        if (recognition === control) recognition = null;
      };
    },

    isRecognitionActive() {
      return recognition?.isActive() ?? false;
    },

    stopRecognitionForOutput() {
      if (!recognition || !recognition.isActive()) return false;
      recognition.stop();
      return true;
    },

    registerOutput(control) {
      output = control;
      return () => {
        if (output === control) output = null;
      };
    },

    stopOutput() {
      output?.stop();
    },

    stopAll() {
      output?.stop();
      if (recognition?.isActive()) recognition.stop();
    },
  };
}
