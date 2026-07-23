import type { FinalEvaluatorProvider } from './types';
import { DemoFinalEvaluatorProvider } from './DemoFinalEvaluatorProvider';
import { LLMFinalEvaluatorProvider } from './LLMFinalEvaluatorProvider';
import { FallbackFinalEvaluatorProvider } from '../ai/fallback';

export interface FinalEvaluatorSelection {
  provider: FinalEvaluatorProvider;
  demoMode: boolean;
  fallback: FallbackFinalEvaluatorProvider;
}

export interface CreateFinalEvaluatorConfig {
  /** Non-secret flag from the /api/ai-status probe. */
  llmEnabled?: boolean;
  llmEndpoint?: string;
}

/**
 * Build the final evaluator. A failed or invalid AI report falls back to the
 * deterministic report — the completed session is always produced and saved.
 */
export function createFinalEvaluatorProvider(
  config: CreateFinalEvaluatorConfig = {},
): FinalEvaluatorSelection {
  const demo = new DemoFinalEvaluatorProvider();
  const llm =
    config.llmEnabled && config.llmEndpoint
      ? new LLMFinalEvaluatorProvider({ enabled: true, endpoint: config.llmEndpoint })
      : null;

  const fallback = new FallbackFinalEvaluatorProvider(llm, demo);
  return { provider: fallback, demoMode: llm === null, fallback };
}
