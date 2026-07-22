import type { EvaluatorResult } from '../types';
import type { EvaluationContext, RealTimeEvaluatorProvider } from './types';
import { EvaluatorUnavailableError } from './errors';

export interface LLMEvaluatorConfig {
  /**
   * Non-secret feature flag: is a server-side evaluator route configured?
   * The API key lives in a server env var and is never exposed to the browser.
   * Disabled until a later phase wires the serverless endpoint.
   */
  enabled?: boolean;
  endpoint?: string;
}

/**
 * Real-LLM evaluator. DISABLED in Phase 3 — there is no secure endpoint yet.
 * Implements the same interface as the Demo evaluator so the engine can adopt
 * it later with no changes. When enabled it will POST the evaluation context to
 * a server route that holds the key and returns a result we then validate.
 */
export class LLMRealTimeEvaluatorProvider implements RealTimeEvaluatorProvider {
  constructor(private readonly config: LLMEvaluatorConfig = {}) {}

  getName(): string {
    return 'LLM evaluator (server-side, disabled until configured)';
  }

  isAvailable(): boolean {
    return this.config.enabled === true && typeof this.config.endpoint === 'string';
  }

  async evaluate(_ctx: EvaluationContext): Promise<EvaluatorResult> {
    throw new EvaluatorUnavailableError(
      'The LLM evaluator is not configured yet. Using the deterministic evaluator.',
    );
  }
}
