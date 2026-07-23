import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { SALES_SCENARIO } from '../data/scenario';
import { ConversationEngine, type ConversationEngineState } from '../conversation/engine';
import { createConversationProvider, type CreateProviderConfig } from '../conversation/provider';
import { createEvaluatorProvider } from '../evaluation/provider';
import { createFinalEvaluatorProvider } from '../final/provider';
import { sessionRepository } from '../persistence/repository';

function createEngine(config: CreateProviderConfig): ConversationEngine {
  const { provider, demoMode } = createConversationProvider(config);
  // Each provider is selected independently; in Demo Mode all three fall back
  // to their deterministic implementations.
  const { provider: evaluator } = createEvaluatorProvider({
    llmEnabled: config.llmEnabled,
    llmEndpoint: config.llmEndpoint,
  });
  const { provider: finalEvaluator } = createFinalEvaluatorProvider({
    llmEnabled: config.llmEnabled,
    llmEndpoint: config.llmEndpoint,
  });
  return new ConversationEngine(
    provider,
    { scenarioId: SALES_SCENARIO.id, demoMode },
    evaluator,
    finalEvaluator,
  );
}

export interface UseConversation {
  state: ConversationEngineState;
  providerName: string;
  evaluatorName: string;
  finalEvaluatorName: string;
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
  const engineRef = useRef<ConversationEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = createEngine(config);
  }
  const engine = engineRef.current;

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
    engineRef.current = createEngine(config);
    setVersion((v) => v + 1);
  }, [config]);

  return {
    state,
    providerName: engine.getProviderName(),
    evaluatorName: engine.getEvaluatorName(),
    finalEvaluatorName: engine.getFinalEvaluatorName(),
    start,
    submit,
    endCall,
    retry,
    reset,
  };
}
