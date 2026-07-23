import type { EvaluatorSignals } from '../types';
import type { FinalCategoryScores, FinalEvaluationContext } from './types';

// ============================================================================
// Deterministic final category scoring.
//
// Categories are computed from evidence (per-turn signals in the score history
// + transcript facts), NOT copied from the final live metrics. The overall is a
// documented weighted blend of the categories. Objection Handling is only
// meaningful when an objection was raised — otherwise it is excluded from the
// overall (its weight is redistributed) so a clean call is never penalised for
// a dimension that never became relevant.
// ============================================================================

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export interface Aggregates {
  n: number;
  everOpenQuestion: boolean;
  everProcess: boolean;
  everPain: boolean;
  everImpact: boolean;
  everTimeline: boolean;
  everDecision: boolean;
  everContext: boolean;
  everFollowUp: boolean;
  everNextStep: boolean;
  unsupportedCount: number;
  earlyPitchCount: number;
  tooLongCount: number;
  repetitiveCount: number;
  ignoredCount: number;
  firstSignals: EvaluatorSignals | null;
}

export function aggregate(ctx: FinalEvaluationContext): Aggregates {
  const h = ctx.scoreHistory;
  const ever = (k: keyof EvaluatorSignals) => h.some((e) => e.signals[k]);
  const count = (k: keyof EvaluatorSignals) => h.filter((e) => e.signals[k]).length;
  return {
    n: ctx.sellerTurnCount,
    everOpenQuestion: ever('asked_open_question'),
    everProcess: ever('explored_current_process'),
    everPain: ever('identified_pain'),
    everImpact: ever('quantified_impact'),
    everTimeline: ever('explored_timeline'),
    everDecision: ever('explored_decision_process'),
    everContext: ever('referenced_customer_context'),
    everFollowUp: ever('asked_relevant_follow_up'),
    everNextStep: ever('proposed_next_step'),
    unsupportedCount: count('made_unsupported_claim'),
    earlyPitchCount: count('pitched_too_early'),
    tooLongCount: count('was_too_long'),
    repetitiveCount: count('was_repetitive'),
    ignoredCount: count('ignored_customer_statement'),
    firstSignals: h[0]?.signals ?? null,
  };
}

// --- individual category scores --------------------------------------------

function openingAndConfidence(a: Aggregates): number {
  if (a.n === 0) return 40; // limited evidence: neutral-low
  let s = 55;
  const first = a.firstSignals;
  if (first) {
    if (first.asked_open_question || first.asked_closed_question) s += 15;
    if (first.pitched_too_early || first.made_unsupported_claim) s -= 20;
    if (first.was_too_long) s -= 10;
  }
  if (a.tooLongCount === 0) s += 8;
  if (a.unsupportedCount === 0 && a.earlyPitchCount === 0) s += 7;
  return clamp(s);
}

function discoveryQuestions(a: Aggregates): number {
  let s = 22;
  if (a.everOpenQuestion) s += 12;
  if (a.everProcess) s += 15;
  if (a.everPain) s += 15;
  if (a.everImpact) s += 16;
  if (a.everTimeline) s += 10;
  if (a.everDecision) s += 10;
  return clamp(s);
}

function problemIdentification(a: Aggregates): number {
  let s = 25;
  if (a.everPain) s += 30;
  if (a.everImpact) s += 25;
  if (a.everContext) s += 20;
  return clamp(s);
}

function valueArticulation(a: Aggregates, ctx: FinalEvaluationContext): number {
  let s = 48;
  if (a.everContext) s += 15; // tied value to a stated need
  if (ctx.finalStage === 'value_mapping' || ctx.finalStage === 'next_step') s += 10;
  if (a.everNextStep) s += 5;
  s -= a.unsupportedCount * 12;
  s -= a.earlyPitchCount * 8;
  return clamp(s);
}

function clarityAndConciseness(a: Aggregates): number {
  let s = 65;
  s -= a.tooLongCount * 8;
  s -= a.repetitiveCount * 8;
  s -= a.unsupportedCount * 6;
  s -= a.ignoredCount * 5;
  return clamp(s);
}

function closingAndNextStep(a: Aggregates, ctx: FinalEvaluationContext): number {
  // Do not reward a premature close: proposing a next step before any pain was
  // identified is not a real close.
  if (!a.everNextStep) return a.n <= 1 ? 35 : 30;
  let s = 55;
  if (ctx.agreedToNextStep) s += 25;
  if (a.everPain) s += 10; // earned the close
  else s -= 15; // premature
  if (a.everDecision) s += 10; // involved decision-maker
  return clamp(s);
}

/**
 * Objection handling score across only the objections actually raised.
 * Returns null when no objection was raised (dimension not relevant).
 */
export function objectionHandlingScore(
  perObjectionQuality: number[],
): number | null {
  if (perObjectionQuality.length === 0) return null;
  const avg = perObjectionQuality.reduce((sum, q) => sum + q, 0) / perObjectionQuality.length;
  return clamp(avg);
}

// --- weights & overall ------------------------------------------------------

/** Documented category weights (sum = 1.0 with objection handling included). */
export const CATEGORY_WEIGHTS: Record<keyof FinalCategoryScores, number> = {
  opening_and_confidence: 0.1,
  discovery_questions: 0.22,
  problem_identification: 0.18,
  value_articulation: 0.15,
  objection_handling: 0.15,
  clarity_and_conciseness: 0.1,
  closing_and_next_step: 0.1,
};

/**
 * Weighted overall. When no objection was raised, the objection-handling weight
 * is redistributed proportionally across the remaining categories so the call
 * is neither rewarded nor penalised for it.
 */
export function overallFromCategories(
  cats: FinalCategoryScores,
  objectionRelevant: boolean,
): number {
  const keys = Object.keys(CATEGORY_WEIGHTS) as (keyof FinalCategoryScores)[];
  const active = keys.filter((k) => objectionRelevant || k !== 'objection_handling');
  const weightSum = active.reduce((sum, k) => sum + CATEGORY_WEIGHTS[k], 0);
  const score = active.reduce((sum, k) => sum + cats[k] * (CATEGORY_WEIGHTS[k] / weightSum), 0);
  return clamp(score);
}

/**
 * Compute all seven category scores. `objectionHandling` is passed in because
 * it depends on the per-objection analysis (see objections.ts); when no
 * objection was raised it is set to the mean of the other categories so the
 * stored number is neutral and never skews anything.
 */
export function computeCategories(
  ctx: FinalEvaluationContext,
  a: Aggregates,
  objectionHandling: number | null,
): { categories: FinalCategoryScores; objectionRelevant: boolean } {
  const partial = {
    opening_and_confidence: openingAndConfidence(a),
    discovery_questions: discoveryQuestions(a),
    problem_identification: problemIdentification(a),
    value_articulation: valueArticulation(a, ctx),
    clarity_and_conciseness: clarityAndConciseness(a),
    closing_and_next_step: closingAndNextStep(a, ctx),
  };
  const objectionRelevant = objectionHandling !== null;
  const others = Object.values(partial);
  const neutral = clamp(others.reduce((s, v) => s + v, 0) / others.length);
  return {
    categories: {
      ...partial,
      objection_handling: objectionRelevant ? objectionHandling! : neutral,
    },
    objectionRelevant,
  };
}
