import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { SALES_SCENARIO } from '../data/scenario';
import { ConversationEngine, type ConversationEngineState } from '../conversation/engine';
import { createConversationProvider, type CreateProviderConfig } from '../conversation/provider';
import { createEvaluatorProvider } from '../evaluation/provider';
import { buildDemoReport, type DemoReport } from '../conversation/report';

function createEngine(config: CreateProviderConfig): ConversationEngine {
  const { provider, demoMode } = createConversationProvider(config);
  // The evaluator is chosen independently of the conversation provider, but in
  // Phase 3 both fall back to their deterministic Demo implementations.
  const { provider: evaluator } = createEvaluatorProvider({
    llmEnabled: config.llmEnabled,
    llmEndpoint: config.llmEndpoint,
  });
  return new ConversationEngine(
    provider,
    { scenarioId: SALES_SCENARIO.id, demoMode },
    evaluator,
  );
}

export interface UseConversation {
  state: ConversationEngineState;
  providerName: string;
  evaluatorName: string;
  report: DemoReport | null;
  start: () => void;
  submit: (text: string) => void;
  endCall: () => void;
  retry: () => void;
  reset: () => void;
}

/**
 * React binding for the ConversationEngine. Uses useSyncExternalStore so the
 * component re-renders on every engine state change without extra effects.
 */
export function useConversation(config: CreateProviderConfig = {}): UseConversation {
  // A version counter lets `reset()` swap in a fresh engine and force a resubscribe.
  const [version, setVersion] = useState(0);
  const engineRef = useRef<ConversationEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = createEngine(config);
  }
  const engine = engineRef.current;

  const subscribe = useCallback(
    (cb: () => void) => engine.subscribe(cb),
    // Re-subscribe when the engine instance changes (after reset).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, version],
  );
  const state = useSyncExternalStore(subscribe, () => engine.getState());

  const report = useMemo(
    () => (state.status === 'Completed' ? buildDemoReport(state) : null),
    [state],
  );

  const start = useCallback(() => engine.start(), [engine]);
  const submit = useCallback((text: string) => void engine.submitSeller(text), [engine]);
  const endCall = useCallback(() => engine.endCall(), [engine]);
  const retry = useCallback(() => engine.retry(), [engine]);
  const reset = useCallback(() => {
    engineRef.current = createEngine(config);
    setVersion((v) => v + 1);
  }, [config]);

  return {
    state,
    providerName: engine.getProviderName(),
    evaluatorName: engine.getEvaluatorName(),
    report,
    start,
    submit,
    endCall,
    retry,
    reset,
  };
}
