import { OBJECTIONS } from '../conversation/types';
import type {
  AiFinalNarrative,
  FinalEvaluationContext,
  FinalEvaluatorProvider,
  FinalReport,
} from './types';
import { validateAiNarrative, validateFinalReport } from './validate';
import {
  aggregate,
  applyEvidenceGuard,
  computeCategories,
  objectionHandlingScore,
  overallFromCategories,
} from './analyze';
import { analyzeObjections } from './objections';
import { betterResponse, lowestRelevantCategory } from './narrative';
import { aiFetch } from '../ai/aiFetch';

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
 * AI final evaluator.
 *
 * DETERMINISTIC SCORE AUTHORITY: the model supplies NARRATIVE ONLY. This
 * provider computes overall_score, all category_scores, and objection results
 * locally with the same deterministic analysis the Demo evaluator uses
 * (`analyze.ts` / `objections.ts`), then merges the grounded narrative on top.
 * The model can therefore enrich the coaching prose but can never influence a
 * number. An invented quote, an out-of-bounds field, or any score field the
 * model tries to smuggle in fails validation and the deterministic evaluator
 * takes over — the session is always saved either way.
 */
export class LLMFinalEvaluatorProvider implements FinalEvaluatorProvider {
  private readonly fetchImpl: typeof fetch;
  private controller: AbortController | null = null;

  constructor(private readonly config: LLMFinalEvaluatorConfig = {}) {
    this.fetchImpl = config.fetchImpl ?? aiFetch;
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

  /** Deterministic scores + objection results, identical to the Demo path. */
  private computeScores(ctx: FinalEvaluationContext) {
    const a = aggregate(ctx);
    const { results: objection_results, quality } = analyzeObjections(ctx);
    const ohScore = objectionHandlingScore(quality);
    const { categories, objectionRelevant } = computeCategories(ctx, a, ohScore);
    const overall_score = applyEvidenceGuard(
      overallFromCategories(categories, objectionRelevant),
      ctx,
      a,
    );
    return { categories, overall_score, objection_results, objectionRelevant };
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

      // The route already returns narrative-only, but validate again on the
      // client so a compromised or unexpected response still cannot inject
      // scores or ungrounded quotes.
      const narrative = validateAiNarrative(await response.json(), {
        sellerMessages: new Set(ctx.sellerMessages),
        raisedObjectionLabels: new Set(objectionLabels),
      });
      if (!narrative.ok || !narrative.value) throw new FinalEvaluatorUnavailableError();

      const report = this.assemble(ctx, narrative.value);
      // Belt and suspenders: the assembled report must itself be valid.
      const finalCheck = validateFinalReport(report, {
        sellerMessages: new Set(ctx.sellerMessages),
        raisedObjectionLabels: new Set(objectionLabels),
      });
      if (!finalCheck.ok || !finalCheck.value) throw new FinalEvaluatorUnavailableError();
      return finalCheck.value;
    } catch (err) {
      if (err instanceof FinalEvaluatorUnavailableError) throw err;
      throw new FinalEvaluatorUnavailableError();
    } finally {
      clearTimeout(timer);
      if (this.controller === controller) this.controller = null;
    }
  }

  /** Merge deterministic scores with the model's grounded narrative. */
  private assemble(ctx: FinalEvaluationContext, n: AiFinalNarrative): FinalReport {
    const { categories, overall_score, objection_results, objectionRelevant } =
      this.computeScores(ctx);
    const lowest = lowestRelevantCategory(categories, objectionRelevant);
    return {
      overall_score,
      category_scores: categories,
      strengths: n.strengths,
      missed_opportunities: n.missed_opportunities,
      strongest_statement: n.strongest_statement,
      weakest_statement: n.weakest_statement,
      // If the model gave no suggestion, fall back to deterministic coaching.
      better_response: n.better_response || betterResponse(null, lowest),
      missed_discovery_questions: n.missed_discovery_questions,
      objection_results,
      recommended_practice: n.recommended_practice,
      summary: n.summary,
    };
  }
}
