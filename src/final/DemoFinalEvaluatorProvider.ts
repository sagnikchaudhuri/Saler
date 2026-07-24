import type { FinalEvaluationContext, FinalEvaluatorProvider, FinalReport } from './types';
import {
  aggregate,
  applyEvidenceGuard,
  computeCategories,
  objectionHandlingScore,
  overallFromCategories,
} from './analyze';
import { analyzeObjections } from './objections';
import {
  betterResponse,
  buildMissed,
  buildStrengths,
  buildSummary,
  lowestRelevantCategory,
  missedDiscoveryQuestions,
  recommendedPractice,
  selectStatements,
} from './narrative';

/**
 * Deterministic final evaluator. Judges the whole conversation from the
 * transcript + live score history — it does NOT copy the final live metrics.
 * No randomness.
 */
export class DemoFinalEvaluatorProvider implements FinalEvaluatorProvider {
  getName(): string {
    return 'Demo (deterministic final evaluator)';
  }

  isAvailable(): boolean {
    return true;
  }

  async evaluate(ctx: FinalEvaluationContext): Promise<FinalReport> {
    const a = aggregate(ctx);

    // Objections drive the objection-handling category (null when none raised).
    const { results: objection_results, quality } = analyzeObjections(ctx);
    const ohScore = objectionHandlingScore(quality);
    const { categories, objectionRelevant } = computeCategories(ctx, a, ohScore);

    // Weighted blend, then corroborate against the live history so a repetitive
    // or low-information call cannot outscore what its turns actually earned.
    const blended = overallFromCategories(categories, objectionRelevant);
    const overall_score = applyEvidenceGuard(blended, ctx, a);

    const { strongest, weakest, weakestSignals } = selectStatements(ctx);
    const lowest = lowestRelevantCategory(categories, objectionRelevant);

    return {
      overall_score,
      category_scores: categories,
      strengths: buildStrengths(ctx, a),
      missed_opportunities: buildMissed(ctx, a),
      strongest_statement: strongest,
      weakest_statement: weakest,
      better_response: betterResponse(weakestSignals, lowest),
      missed_discovery_questions: missedDiscoveryQuestions(ctx, a),
      objection_results,
      recommended_practice: recommendedPractice(categories, objectionRelevant),
      summary: buildSummary(ctx, a),
    };
  }
}
