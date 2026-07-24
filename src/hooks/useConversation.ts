import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { SALES_SCENARIO } from '../data/scenario';
import { ConversationEngine, type ConversationEngineState } from '../conversation/engine';
import { createConversationProvider, type CreateProviderConfig } from '../conversation/provider';
import { createEvaluatorProvider } from '../evaluation/provider';
import { createFinalEvaluatorProvider } from '../final/provider';
import { sessionRepository } from '../persistence/repository';
import type { CapabilityMode } from '../persistence/types';
import { getAiStatus } from '../ai/status';

export const AI_ROUTES = {
  conversation: '/api/conversation',
  evaluateTurn: '/api/evaluate-turn',
  evaluateFinal: '/api/evaluate-final',
} as const;

function createEngine(config: CreateProviderConfig, aiEnabled: boolean): ConversationEngine {
  const conversation = createConversationProvider({
    ...config,
    llmEnabled: aiEnabled,
    llmEndpoint: aiEnabled ? AI_ROUTES.conversation : undefined,
  });
  const evaluator = createEvaluatorProvider({
    llmEnabled: aiEnabled,
    llmEndpoint: aiEnabled ? AI_ROUTES.evaluateTurn : undefined,
  });
  const finalEvaluator = createFinalEvaluatorProvider({
    llmEnabled: aiEnabled,
    llmEndpoint: aiEnabled ? AI_ROUTES.evaluateFinal : undefined,
  });

  return new ConversationEngine(
    conversation.provider,
    {
      scenarioId: SALES_SCENARIO.id,
      demoMode: conversation.demoMode,
      // Report what ACTUALLY handled each capability, not what was configured.
      providerModes: {
        customer: () => conversation.fallback.tracker.summary() as CapabilityMode,
        turnEvaluator: () => evaluator.fallback.tracker.summary() as CapabilityMode,
        finalReport: () => finalEvaluator.fallback.tracker.summary() as CapabilityMode,
      },
      fallbackNotices: {
        customer: () => conversation.fallback.lastFallbackReason,
        turnEvaluator: () => evaluator.fallback.lastFallbackReason,
        finalReport: () => finalEvaluator.fallback.lastFallbackReason,
      },
    },
    evaluator.provider,
    finalEvaluator.provider,
  );
}

export interface UseConversation {
  state: ConversationEngineState;
  providerName: string;
  evaluatorName: string;
  finalEvaluatorName: string;
  /** True when a server-side LLM is configured (probed, never a browser key). */
  aiEnabled: boolean;
  /** Which implementation has actually produced customer turns so far. */
  customerMode: CapabilityMode;
  start: () => void;
  submit: (text: string) => void;
  endCall: () => void;
  retry: () => void;
  reset: () => void;
}

/**
 * React binding for the ConversationEngine. Also owns the single side effect
 * that persists a completed session through the repository — guarded by a ref
 * so repeated renders or End Call clicks can never save duplicates.
 */
export function useConversation(config: CreateProviderConfig = {}): UseConversation {
  const [version, setVersion] = useState(0);
  const [aiEnabled, setAiEnabled] = useState(false);
  const aiEnabledRef = useRef(false);

  const engineRef = useRef<ConversationEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = createEngine(config, aiEnabledRef.current);
  }
  const engine = engineRef.current;

  // Probe once whether the server has an LLM configured. Until it answers we
  // stay in Demo Mode, so the UI never claims AI it does not have.
  useEffect(() => {
    let cancelled = false;
    void getAiStatus().then((status) => {
      if (cancelled || status.enabled === aiEnabledRef.current) return;
      aiEnabledRef.current = status.enabled;
      setAiEnabled(status.enabled);
      // Only swap in AI providers before a call starts; never mid-conversation.
      if (engineRef.current?.getState().status === 'Idle') {
        engineRef.current = createEngine(config, status.enabled);
        setVersion((v) => v + 1);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subscribe = useCallback(
    (cb: () => void) => engine.subscribe(cb),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, version],
  );
  const state = useSyncExternalStore(subscribe, () => engine.getState());

  // Persist exactly once per completed session.
  const savedIds = useRef<Set<string>>(new Set());
  const session = state.completedSession;
  useEffect(() => {
    if (!session) return;
    if (savedIds.current.has(session.id)) return;
    savedIds.current.add(session.id);
    sessionRepository.save(session);
  }, [session]);

  const start = useCallback(() => engine.start(), [engine]);
  const submit = useCallback((text: string) => void engine.submitSeller(text), [engine]);
  const endCall = useCallback(() => void engine.endCall(), [engine]);
  const retry = useCallback(() => engine.retry(), [engine]);
  const reset = useCallback(() => {
    engineRef.current = createEngine(config, aiEnabledRef.current);
    setVersion((v) => v + 1);
  }, [config]);

  return {
    state,
    providerName: engine.getProviderName(),
    customerMode: engine.getProviderModes().customer,
    evaluatorName: engine.getEvaluatorName(),
    finalEvaluatorName: engine.getFinalEvaluatorName(),
    aiEnabled,
    start,
    submit,
    endCall,
    retry,
    reset,
  };
}
