import type { FinalEvaluationContext, FinalEvaluatorProvider, FinalReport } from './types';

/** Thrown when the final evaluator is called while unconfigured. */
export class FinalEvaluatorUnavailableError extends Error {
  constructor(message = 'The final evaluation service is unavailable.') {
    super(message);
    this.name = 'FinalEvaluatorUnavailableError';
  }
}

export interface LLMFinalEvaluatorConfig {
  /** Non-secret flag: is a server-side final-evaluator route configured? */
  enabled?: boolean;
  endpoint?: string;
}

/**
 * Real-LLM final evaluator. DISABLED in Phase 4 — no secure endpoint yet.
 * Same interface as the Demo evaluator so it can be adopted later unchanged.
 */
export class LLMFinalEvaluatorProvider implements FinalEvaluatorProvider {
  constructor(private readonly config: LLMFinalEvaluatorConfig = {}) {}

  getName(): string {
    return 'LLM final evaluator (server-side, disabled until configured)';
  }

  isAvailable(): boolean {
    return this.config.enabled === true && typeof this.config.endpoint === 'string';
  }

  async evaluate(_ctx: FinalEvaluationContext): Promise<FinalReport> {
    throw new FinalEvaluatorUnavailableError(
      'The LLM final evaluator is not configured yet. Using the deterministic evaluator.',
    );
  }
}
