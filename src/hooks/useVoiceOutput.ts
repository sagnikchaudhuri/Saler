import { useCallback, useEffect, useRef, useState } from 'react';
import type { TranscriptTurn } from '../types';
import { createVoiceProvider } from '../voice/provider';
import { VOICE_MESSAGES, VoiceProviderError } from '../voice/errors';
import type { VoiceProvider, VoiceState } from '../voice/types';
import type { MediaCoordinator } from '../media/MediaCoordinator';

export interface UseVoiceOutputOptions {
  /** Broker used to stop recognition before playback. */
  coordinator: MediaCoordinator;
  /** Injectable for tests; defaults to the production fallback chain. */
  provider?: VoiceProvider;
  /**
   * Only true while a live roleplay is on screen. Historical reports, the
   * briefing, and the history list must never trigger playback.
   */
  isLiveCall: boolean;
}

export interface UseVoiceOutput {
  providerName: string;
  state: VoiceState;
  isPreparing: boolean;
  isSpeaking: boolean;
  warning: string | null;
  /** Speak a customer turn exactly once (deduplicated by turn id). */
  speakCustomerTurn: (turn: TranscriptTurn) => void;
  stop: () => void;
  /** Explicit user action — replays the last turn (e.g. after autoplay block). */
  retryLast: () => void;
  /** Set when autoplay was blocked and the user must press play. */
  awaitingUserPlay: boolean;
  isVoiceEnabled: boolean;
  setVoiceEnabled: (enabled: boolean) => void;
}

/**
 * Owns customer-voice playback.
 *
 * Deduplication is by transcript turn id, so a turn is spoken at most once no
 * matter how many times React re-renders, StrictMode double-invokes effects, or
 * the component remounts. Historical/hydrated transcripts are never spoken
 * because the caller only feeds turns while a live call is on screen, and any
 * turns already present are marked as seen on mount.
 */
export function useVoiceOutput(options: UseVoiceOutputOptions): UseVoiceOutput {
  const { coordinator, provider: injected, isLiveCall } = options;

  const providerRef = useRef<VoiceProvider | null>(null);
  if (providerRef.current === null) {
    providerRef.current = injected ?? createVoiceProvider();
  }
  const provider = providerRef.current;

  const [state, setState] = useState<VoiceState>(() => provider.getState());
  const [providerName, setProviderName] = useState<string>(() => provider.getName());
  const [warning, setWarning] = useState<string | null>(null);
  const [isVoiceEnabled, setVoiceEnabled] = useState(true);
  const [awaitingUserPlay, setAwaitingUserPlay] = useState(false);

  /** Turn ids already spoken (or deliberately skipped). Never replayed. */
  const spokenIds = useRef<Set<string>>(new Set());
  const lastTurn = useRef<TranscriptTurn | null>(null);
  const isLiveRef = useRef(isLiveCall);
  isLiveRef.current = isLiveCall;

  // Mirror provider state.
  useEffect(() => {
    const unsubscribe = provider.subscribe((s) => {
      setState(s);
      setProviderName(provider.getName());
    });
    return unsubscribe;
  }, [provider]);

  // Register with the coordinator so other controllers can stop output.
  useEffect(() => {
    const unregister = coordinator.registerOutput({ stop: () => provider.stop() });
    return () => {
      unregister();
      provider.stop();
    };
  }, [coordinator, provider]);

  // Leaving the live call (End Call, navigation, report/history) stops audio.
  useEffect(() => {
    if (!isLiveCall) provider.stop();
  }, [isLiveCall, provider]);

  const play = useCallback(
    async (turn: TranscriptTurn) => {
      lastTurn.current = turn;
      setWarning(null);
      setAwaitingUserPlay(false);

      // Only one utterance at a time — cancel whatever is playing first.
      // (The chain also does this, but the hook must not depend on which
      // provider it was given.)
      provider.stop();

      // Exclusivity: close the microphone through the speech controller first.
      coordinator.stopRecognitionForOutput();

      try {
        await provider.speak(turn.message, { turnId: turn.id });
        // Be honest about what the user actually heard. A successful call can
        // still mean a downgrade happened (or that nothing was audible at all).
        const name = provider.getName();
        setProviderName(name);
        const downgraded = (
          provider as Partial<{ getFallbackReason: () => unknown }>
        ).getFallbackReason?.();
        if (name === 'Silent Mode') {
          setWarning(VOICE_MESSAGES.silent);
        } else if (downgraded) {
          setWarning(VOICE_MESSAGES.fellBackToBrowser);
        } else {
          setWarning(null);
        }
      } catch (err) {
        setProviderName(provider.getName());
        if (err instanceof VoiceProviderError && err.reason === 'autoplay-blocked') {
          setAwaitingUserPlay(true);
          setWarning(VOICE_MESSAGES.autoplayBlocked);
          return;
        }
        // Chain exhausted: the transcript still carries the reply.
        setWarning(VOICE_MESSAGES.silent);
      }
    },
    [coordinator, provider],
  );

  const speakCustomerTurn = useCallback(
    (turn: TranscriptTurn) => {
      // Guards: only live calls, only customer turns, only once per turn id.
      if (!isLiveRef.current) return;
      if (turn.speaker !== 'customer') return;
      if (spokenIds.current.has(turn.id)) return;

      // Mark BEFORE awaiting so a StrictMode double-invoke cannot double-speak.
      spokenIds.current.add(turn.id);

      if (!isVoiceEnabled) {
        lastTurn.current = turn; // still replayable if the user enables voice
        return;
      }
      void play(turn);
    },
    [isVoiceEnabled, play],
  );

  const stop = useCallback(() => {
    provider.stop();
    setAwaitingUserPlay(false);
  }, [provider]);

  const retryLast = useCallback(() => {
    const turn = lastTurn.current;
    if (!turn) return;
    void play(turn); // explicit user action bypasses dedup
  }, [play]);

  const handleSetVoiceEnabled = useCallback(
    (enabled: boolean) => {
      setVoiceEnabled(enabled);
      if (!enabled) {
        provider.stop();
        setAwaitingUserPlay(false);
        setWarning(null);
      }
    },
    [provider],
  );

  return {
    providerName,
    state,
    isPreparing: state === 'preparing',
    isSpeaking: state === 'speaking',
    warning,
    speakCustomerTurn,
    stop,
    retryLast,
    awaitingUserPlay,
    isVoiceEnabled,
    setVoiceEnabled: handleSetVoiceEnabled,
  };
}
