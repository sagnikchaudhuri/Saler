import type { RealTimeEvaluatorProvider } from './types';
import { DemoRealTimeEvaluatorProvider } from './DemoRealTimeEvaluatorProvider';
import { LLMRealTimeEvaluatorProvider } from './LLMRealTimeEvaluatorProvider';

export interface EvaluatorSelection {
  provider: RealTimeEvaluatorProvider;
  demoMode: boolean;
}

export interface CreateEvaluatorConfig {
  /** Non-secret flag: is a server-side evaluator route configured? */
  llmEnabled?: boolean;
  /** Serverless endpoint path (later phase). */
  llmEndpoint?: string;
}

/**
 * Choose an evaluator. Prefers the LLM evaluator only when it is genuinely
 * available; otherwise falls back to the always-available deterministic Demo
 * evaluator. Single place evaluator switching happens.
 */
export function createEvaluatorProvider(
  config: CreateEvaluatorConfig = {},
): EvaluatorSelection {
  const llm = new LLMRealTimeEvaluatorProvider({
    enabled: config.llmEnabled,
    endpoint: config.llmEndpoint,
  });
  if (llm.isAvailable()) {
    return { provider: llm, demoMode: false };
  }
  return { provider: new DemoRealTimeEvaluatorProvider(), demoMode: true };
}
