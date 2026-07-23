import { OBJECTIONS } from '../conversation/types';
import type { FinalEvaluationContext, FinalEvaluatorProvider, FinalReport } from './types';
import { validateFinalReport } from './validate';

/** Thrown when the final evaluator is unavailable or returns something invalid. */
export class FinalEvaluatorUnavailableError extends Error {
  constructor(message = 'The final evaluation service is unavailable.') {
    super(message);
    this.name = 'FinalEvaluatorUnavailableError';
  }
}

export interface LLMFinalEvaluatorConfig {
  /** From the secret-free /api/ai-status probe, never a key in the browser. */
  enabled?: boolean;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * AI final evaluator. Runs exactly once per completed call.
 *
 * The response is validated against the transcript itself: a quoted statement
 * must be a real seller message and an objection must be one that was actually
 * raised. An invented quote or objection fails validation and the deterministic
 * evaluator takes over — the session is always saved either way.
 */
export class LLMFinalEvaluatorProvider implements FinalEvaluatorProvider {
  private readonly fetchImpl: typeof fetch;
  private controller: AbortController | null = null;

  constructor(private readonly config: LLMFinalEvaluatorConfig = {}) {
    this.fetchImpl = config.fetchImpl ?? ((...args) => fetch(...args));
  }

  getName(): string {
    return 'AI Final Review';
  }

  isAvailable(): boolean {
    return this.config.enabled === true && typeof this.config.endpoint === 'string';
  }

  cancel(): void {
    this.controller?.abort();
    this.controller = null;
  }

  async evaluate(ctx: FinalEvaluationContext): Promise<FinalReport> {
    if (!this.isAvailable()) {
      throw new FinalEvaluatorUnavailableError('The AI final evaluator is not configured.');
    }

    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 30_000);

    const objectionLabels = ctx.objectionEvents.map((e) => OBJECTIONS[e.key]);

    try {
      const response = await this.fetchImpl(this.config.endpoint!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: ctx.transcript.slice(-40).map((t) => ({
            speaker: t.speaker === 'seller' ? 'seller' : 'customer',
            message: t.message,
          })),
          objectionLabels,
          liveAverage: ctx.liveAverage,
          finalStage: ctx.finalStage,
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new FinalEvaluatorUnavailableError();

      const validated = validateFinalReport(await response.json(), {
        sellerMessages: new Set(ctx.sellerMessages),
        raisedObjectionLabels: new Set(objectionLabels),
      });
      if (!validated.ok || !validated.value) throw new FinalEvaluatorUnavailableError();
      return validated.value;
    } catch (err) {
      if (err instanceof FinalEvaluatorUnavailableError) throw err;
      throw new FinalEvaluatorUnavailableError();
    } finally {
      clearTimeout(timer);
      if (this.controller === controller) this.controller = null;
    }
  }
}
