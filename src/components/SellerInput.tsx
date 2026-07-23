import { useEffect, useRef } from 'react';
import { useSpeechInput } from '../hooks/useSpeechInput';
import type { SpeechRecognitionProvider, SpeechRecognitionState } from '../speech/types';
import type { MediaCoordinator } from '../media/MediaCoordinator';
import { speechErrorMessage } from '../speech/errors';

const STATUS_TEXT: Record<SpeechRecognitionState, string> = {
  unsupported: 'Voice input unavailable',
  idle: 'Microphone ready',
  requesting_permission: 'Requesting microphone access…',
  listening: 'Listening',
  processing: 'Processing speech…',
  stopped: 'Microphone ready',
  error: 'Voice input problem',
};

/**
 * Seller input: microphone capture plus an editable draft.
 *
 * Recognised speech is never sent automatically — it lands in the draft so the
 * user can fix transcription mistakes first. Typed and spoken input converge on
 * exactly the same `onSubmit` path, so there is no separate voice pipeline.
 */
export function SellerInput({
  canSend,
  inputError,
  onSubmit,
  speechProvider,
  coordinator,
  isOutputSpeaking,
  isOutputPreparing,
}: {
  canSend: boolean;
  inputError: string | null;
  onSubmit: (text: string) => void;
  /** Injectable for tests; defaults to the real browser provider. */
  speechProvider?: SpeechRecognitionProvider;
  /** Broker for input/output exclusivity. */
  coordinator?: MediaCoordinator;
  isOutputSpeaking?: boolean;
  isOutputPreparing?: boolean;
}) {
  const speech = useSpeechInput({
    provider: speechProvider,
    conversationAcceptsInput: canSend,
    coordinator,
    isOutputSpeaking,
    isOutputPreparing,
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wasListening = useRef(false);

  // Return focus to the draft once a recognition session ends, so keyboard
  // users land where they can edit.
  useEffect(() => {
    if (wasListening.current && !speech.isListening) {
      textareaRef.current?.focus();
    }
    wasListening.current = speech.isListening;
  }, [speech.isListening]);

  const send = () => {
    if (!canSend) return;
    speech.prepareForSubmit();
    onSubmit(speech.draft);
    speech.clearDraft();
  };

  const showError = speech.error !== null && !speech.error.intentional;
  const micDisabled = !speech.media.canStartListening && !speech.isListening;

  return (
    <div className="mt-4 border-t border-line pt-4">
      {/* Microphone row */}
      <div className="flex flex-wrap items-center gap-2">
        {!speech.isListening ? (
          <button
            type="button"
            className="btn-ghost"
            onClick={speech.startListening}
            disabled={micDisabled}
            aria-label={
              speech.isSupported
                ? 'Start voice input'
                : 'Voice input unavailable in this browser'
            }
          >
            <span aria-hidden>🎙</span> Speak
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn-primary"
              onClick={speech.stopListening}
              aria-label="Stop listening and keep what was recognised"
            >
              <span aria-hidden>■</span> Stop
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={speech.cancelListening}
              aria-label="Cancel voice input and discard what was heard"
            >
              Cancel
            </button>
          </>
        )}

        {/* Status: text + shape, never colour alone. */}
        <span
          className="inline-flex items-center gap-1.5 text-xs text-ink-secondary"
          aria-live="polite"
        >
          {speech.isListening && (
            <span
              aria-hidden
              className="h-2 w-2 animate-pulse-soft rounded-full bg-critical motion-reduce:animate-none"
            />
          )}
          {STATUS_TEXT[speech.state]}
        </span>

        {speech.draft.length > 0 && (
          <button
            type="button"
            className="btn-ghost ml-auto"
            onClick={speech.clearDraft}
            aria-label="Clear the draft response"
          >
            Clear draft
          </button>
        )}
      </div>

      {/* Interim (partial) recognition preview */}
      {speech.isListening && (
        <p
          className="mt-2 min-h-[1.25rem] text-xs italic text-ink-muted"
          aria-live="polite"
        >
          {speech.interim ? `Heard so far: ${speech.interim}` : 'Listening — start speaking…'}
        </p>
      )}

      {/* Editable draft + send */}
      <div className="mt-3 flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={2}
          value={speech.draft}
          onChange={(e) => speech.setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={!canSend}
          aria-label="Your response"
          placeholder={canSend ? 'Type or dictate your response…' : 'Waiting for Rohan…'}
          className="min-h-[2.75rem] flex-1 resize-y rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-muted disabled:opacity-60"
        />
        <button type="button" className="btn-primary" onClick={send} disabled={!canSend}>
          Send
        </button>
      </div>

      {inputError && <p className="mt-2 text-xs text-caution">{inputError}</p>}

      {showError && (
        <p role="status" className="mt-2 text-xs text-caution">
          {speech.error!.message}
        </p>
      )}

      {!speech.isSupported && (
        <p className="mt-2 text-[11px] text-ink-muted">
          {speechErrorMessage('unsupported')}
        </p>
      )}

      <p className="mt-2 text-[11px] text-ink-muted">
        Press Enter to send, Shift+Enter for a new line. Speech is recognised by
        your browser&apos;s own service and is never stored as audio.
      </p>
    </div>
  );
}
