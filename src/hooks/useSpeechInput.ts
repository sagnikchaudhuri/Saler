import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSpeechProvider } from '../speech/provider';
import type {
  SpeechError,
  SpeechRecognitionProvider,
  SpeechRecognitionState,
} from '../speech/types';
import { computeMediaActivity, type MediaActivity } from '../media/coordination';

/**
 * Join recognised text onto the existing draft without destroying anything the
 * user typed. Whitespace is normalised; punctuation is left alone.
 */
export function appendRecognised(draft: string, addition: string): string {
  const clean = addition.replace(/\s+/g, ' ').trim();
  if (!clean) return draft;
  const base = draft.replace(/\s+$/, '');
  if (!base) return clean;
  return `${base} ${clean}`;
}

export interface UseSpeechInputOptions {
  /** Injectable for tests; defaults to the real browser provider. */
  provider?: SpeechRecognitionProvider;
  /** True when the conversation is ready for seller input. */
  conversationAcceptsInput: boolean;
  /** Phase 6 hooks — customer audio playback state. */
  isOutputSpeaking?: boolean;
  isOutputPreparing?: boolean;
  lang?: string;
}

export interface UseSpeechInput {
  /** The editable text the user will send (typed and/or recognised). */
  draft: string;
  setDraft: (value: string) => void;
  clearDraft: () => void;
  /** Live partial text while listening; never part of the draft until final. */
  interim: string;
  state: SpeechRecognitionState;
  isListening: boolean;
  isSupported: boolean;
  error: SpeechError | null;
  permissionBlocked: boolean;
  media: MediaActivity;
  startListening: () => void;
  stopListening: () => void;
  /** Cancel the session and drop interim text; the draft is untouched. */
  cancelListening: () => void;
  /** Called by the UI just before submitting through the conversation engine. */
  prepareForSubmit: () => void;
}

/**
 * Controller for speech input. Owns the editable draft, interim text, and the
 * recognition lifecycle. It never writes to the conversation transcript — the
 * user must review/edit and press Send, which goes through the same
 * submitSeller path as typed input.
 */
export function useSpeechInput(options: UseSpeechInputOptions): UseSpeechInput {
  const {
    provider: injected,
    conversationAcceptsInput,
    isOutputSpeaking,
    isOutputPreparing,
    lang,
  } = options;

  const providerRef = useRef<SpeechRecognitionProvider | null>(null);
  if (providerRef.current === null) {
    providerRef.current = injected ?? createSpeechProvider().provider;
  }
  const provider = providerRef.current;

  const [draft, setDraft] = useState('');
  const [interim, setInterim] = useState('');
  const [state, setState] = useState<SpeechRecognitionState>(() => provider.getState());
  const [error, setError] = useState<SpeechError | null>(null);
  const [permissionBlocked, setPermissionBlocked] = useState(false);

  const isSupported = provider.isSupported();
  const isListening = state === 'listening' || state === 'requesting_permission';

  // Subscribe once; unsubscribe and abort on unmount so no stale handler fires
  // and no recognition survives navigating away.
  useEffect(() => {
    const unsubscribe = provider.subscribe((event) => {
      if (event.type === 'state') {
        setState(event.state);
        // Leaving an active session: interim text is no longer meaningful.
        if (event.state === 'stopped' || event.state === 'error') setInterim('');
      } else if (event.type === 'interim') {
        setInterim(event.transcript);
      } else if (event.type === 'final') {
        setDraft((prev) => appendRecognised(prev, event.transcript));
      } else {
        setError(event.error);
        if (event.error.blocksFurtherAttempts) setPermissionBlocked(true);
      }
    });
    return () => {
      unsubscribe();
      provider.abort();
    };
  }, [provider]);

  // Never keep listening once the conversation stops accepting input
  // (Evaluating, GeneratingReply, End Call, Completed).
  useEffect(() => {
    if (!conversationAcceptsInput && isListening) provider.abort();
  }, [conversationAcceptsInput, isListening, provider]);

  const media = useMemo(
    () =>
      computeMediaActivity({
        isListening,
        isOutputSpeaking,
        isOutputPreparing,
        conversationAcceptsInput,
        speechSupported: isSupported,
        permissionBlocked,
      }),
    [isListening, isOutputSpeaking, isOutputPreparing, conversationAcceptsInput, isSupported, permissionBlocked],
  );

  const startListening = useCallback(() => {
    if (!media.canStartListening) return;
    // A fresh, valid attempt clears the previous error.
    setError(null);
    setInterim('');
    void provider.start(lang ? { lang } : undefined);
  }, [media.canStartListening, provider, lang]);

  const stopListening = useCallback(() => {
    if (!isListening) return;
    provider.stop();
  }, [isListening, provider]);

  const cancelListening = useCallback(() => {
    provider.abort();
    setInterim('');
    setError(null);
  }, [provider]);

  const clearDraft = useCallback(() => setDraft(''), []);

  const prepareForSubmit = useCallback(() => {
    provider.abort();
    setInterim('');
  }, [provider]);

  return {
    draft,
    setDraft,
    clearDraft,
    interim,
    state,
    isListening,
    isSupported,
    error,
    permissionBlocked,
    media,
    startListening,
    stopListening,
    cancelListening,
    prepareForSubmit,
  };
}
