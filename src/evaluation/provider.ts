import type { RealTimeEvaluatorProvider } from './types';
import { DemoRealTimeEvaluatorProvider } from './DemoRealTimeEvaluatorProvider';
import { LLMRealTimeEvaluatorProvider } from './LLMRealTimeEvaluatorProvider';
import { FallbackRealTimeEvaluatorProvider } from '../ai/fallback';

export interface EvaluatorSelection {
  provider: RealTimeEvaluatorProvider;
  demoMode: boolean;
  fallback: FallbackRealTimeEvaluatorProvider;
}

export interface CreateEvaluatorConfig {
  /** Non-secret flag from the /api/ai-status probe. */
  llmEnabled?: boolean;
  llmEndpoint?: string;
}

/**
 * Build the real-time evaluator. The AI evaluator only ever supplies SIGNALS;
 * the deterministic scoring engine remains authoritative either way, so a
 * fallback changes who observed the turn, never how points are awarded.
 */
export function createEvaluatorProvider(
  config: CreateEvaluatorConfig = {},
): EvaluatorSelection {
  const demo = new DemoRealTimeEvaluatorProvider();
  const llm =
    config.llmEnabled && config.llmEndpoint
      ? new LLMRealTimeEvaluatorProvider({ enabled: true, endpoint: config.llmEndpoint })
      : null;

  const fallback = new FallbackRealTimeEvaluatorProvider(llm, demo);
  return { provider: fallback, demoMode: llm === null, fallback };
}
