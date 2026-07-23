import type { FinalEvaluatorProvider } from './types';
import { DemoFinalEvaluatorProvider } from './DemoFinalEvaluatorProvider';
import { LLMFinalEvaluatorProvider } from './LLMFinalEvaluatorProvider';

export interface FinalEvaluatorSelection {
  provider: FinalEvaluatorProvider;
  demoMode: boolean;
}

export interface CreateFinalEvaluatorConfig {
  llmEnabled?: boolean;
  llmEndpoint?: string;
}

/** Prefer the LLM final evaluator only when genuinely available; else Demo. */
export function createFinalEvaluatorProvider(
  config: CreateFinalEvaluatorConfig = {},
): FinalEvaluatorSelection {
  const llm = new LLMFinalEvaluatorProvider({
    enabled: config.llmEnabled,
    endpoint: config.llmEndpoint,
  });
  if (llm.isAvailable()) return { provider: llm, demoMode: false };
  return { provider: new DemoFinalEvaluatorProvider(), demoMode: true };
}
