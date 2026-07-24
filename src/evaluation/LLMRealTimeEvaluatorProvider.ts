import type { EvaluatorResult } from '../types';
import type { EvaluationContext, RealTimeEvaluatorProvider } from './types';
import { EvaluatorUnavailableError } from './errors';
import { validateEvaluatorResult } from './validate';
import { aiFetch } from '../ai/aiFetch';

export interface LLMEvaluatorConfig {
  /** From the secret-free /api/ai-status probe, never a key in the browser. */
  enabled?: boolean;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * AI turn evaluator.
 *
 * It returns SIGNALS ONLY — the deterministic TypeScript scoring engine stays
 * authoritative and converts signals into metric changes. The model can never
 * write a score, adjust a weight, or mutate a metric, because nothing here
 * passes anything but validated booleans onward.
 */
export class LLMRealTimeEvaluatorProvider implements RealTimeEvaluatorProvider {
  private readonly fetchImpl: typeof fetch;
  private controller: AbortController | null = null;

  constructor(private readonly config: LLMEvaluatorConfig = {}) {
    // Default to aiFetch so the capability token rides along; tests inject.
    this.fetchImpl = config.fetchImpl ?? aiFetch;
  }

  getName(): string {
    return 'AI Evaluation';
  }

  isAvailable(): boolean {
    return this.config.enabled === true && typeof this.config.endpoint === 'string';
  }

  cancel(): void {
    this.controller?.abort();
    this.controller = null;
  }

  async evaluate(ctx: EvaluationContext): Promise<EvaluatorResult> {
    if (!this.isAvailable()) {
      throw new EvaluatorUnavailableError('The AI evaluator is not configured.');
    }

    // One evaluation request per seller turn.
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 20_000);

    try {
      const response = await this.fetchImpl(this.config.endpoint!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerMessage: ctx.sellerMessage,
          latestCustomerStatement: ctx.latestCustomerStatement ?? '',
          stage: ctx.stage,
          transcript: ctx.transcript.slice(-8).map((t) => ({
            speaker: t.speaker === 'seller' ? 'seller' : 'customer',
            message: t.message,
          })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new EvaluatorUnavailableError();

      // Same strict validator the deterministic evaluator is held to. Anything
      // that is not a complete, well-typed signal set is rejected outright.
      const validated = validateEvaluatorResult(await response.json());
      if (!validated.ok || !validated.value) throw new EvaluatorUnavailableError();
      return validated.value;
    } catch (err) {
      if (err instanceof EvaluatorUnavailableError) throw err;
      throw new EvaluatorUnavailableError();
    } finally {
      clearTimeout(timer);
      if (this.controller === controller) this.controller = null;
    }
  }
}
