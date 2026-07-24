import type { EvaluatorSignals } from '../types';
import type { ScoreHistoryEntry } from '../scoring/types';
import type { FinalCategoryScores, FinalEvaluationContext } from './types';

// ============================================================================
// Deterministic final category scoring.
//
// Categories are computed from evidence (per-turn signals in the score history
// + transcript facts), NOT copied from the final live metrics. The overall is a
// documented weighted blend of the categories, then a divergence guard keeps a
// repetitive or low-information call from claiming a whole-conversation score
// its turns never supported. Objection Handling is only meaningful when an
// objection was raised — otherwise it is excluded from the overall (its weight
// is redistributed) so a clean call is never penalised for a dimension that
// never became relevant.
//
// EVIDENCE-DENSITY, NOT EVER-OCCURRENCE. Heavily weighted categories blend
// COVERAGE (did the seller touch this area at all — breadth) with DENSITY (what
// fraction of turns actually did it — depth) and subtract repetition/noise
// penalties. This is what stops a 20-turn repetitive call from earning the same
// category credit as five concise strong turns: coverage saturates for both,
// but the repetitive call loses the density it faked to repetition penalties.
// ============================================================================

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Proportion of `n` turns that did something, guarded against divide-by-zero. */
function frac(count: number, n: number): number {
  return n > 0 ? count / n : 0;
}

/** Any of these firing means the turn did something genuinely on-task. */
const POSITIVE_SIGNALS: (keyof EvaluatorSignals)[] = [
  'asked_open_question', 'asked_closed_question', 'identified_pain',
  'quantified_impact', 'explored_current_process', 'explored_decision_process',
  'explored_timeline', 'referenced_customer_context', 'acknowledged_objection',
  'clarified_objection', 'answered_objection', 'confirmed_objection_resolution',
  'asked_relevant_follow_up', 'proposed_next_step',
];

/** The subset that counts as genuine discovery work. */
const DISCOVERY_SIGNALS: (keyof EvaluatorSignals)[] = [
  'asked_open_question', 'identified_pain', 'quantified_impact',
  'explored_current_process', 'explored_decision_process', 'explored_timeline',
  'referenced_customer_context', 'asked_relevant_follow_up',
];

const anySignal = (e: ScoreHistoryEntry, keys: (keyof EvaluatorSignals)[]) =>
  keys.some((k) => e.signals[k]);

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
  // --- density (depth), not just coverage (breadth) ---
  /** Turns that fired ANY positive signal. */
  meaningfulTurns: number;
  /** Turns that did genuine discovery work. */
  discoveryTurns: number;
  painTurns: number;
  impactTurns: number;
  contextTurns: number;
  /** Turns that did nothing on-task (trivial, off-topic, or pure noise). */
  noiseTurns: number;
}

export function aggregate(ctx: FinalEvaluationContext): Aggregates {
  const h = ctx.scoreHistory;
  const ever = (k: keyof EvaluatorSignals) => h.some((e) => e.signals[k]);
  const count = (k: keyof EvaluatorSignals) => h.filter((e) => e.signals[k]).length;
  const turnsWith = (keys: (keyof EvaluatorSignals)[]) =>
    h.filter((e) => anySignal(e, keys)).length;

  const meaningfulTurns = turnsWith(POSITIVE_SIGNALS);
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
    meaningfulTurns,
    discoveryTurns: turnsWith(DISCOVERY_SIGNALS),
    painTurns: count('identified_pain'),
    impactTurns: count('quantified_impact'),
    contextTurns: count('referenced_customer_context'),
    noiseTurns: Math.max(0, ctx.sellerTurnCount - meaningfulTurns),
  };
}

// --- evidence policy --------------------------------------------------------

export type EvidenceLevel = 'none' | 'limited' | 'sufficient';

/**
 * Deterministic minimum-evidence rule, from the persisted facts a report has:
 *
 *   none        no seller turns at all — nothing happened to assess.
 *   limited     one or two turns, OR several turns that were all trivial
 *               (no positive signal ever fired) — real but too thin to score
 *               with confidence.
 *   sufficient  enough substantive turns to stand behind the numbers.
 *
 * The report UI uses this to suppress a "Not scored" call's headline and to
 * qualify a limited one, so a near-empty call never wears a confident number.
 */
export function evidenceLevel(
  sellerTurnCount: number,
  scoreHistory: ScoreHistoryEntry[],
): EvidenceLevel {
  if (sellerTurnCount <= 0) return 'none';
  if (sellerTurnCount <= 2) return 'limited';
  const meaningful = scoreHistory.filter((e) => anySignal(e, POSITIVE_SIGNALS)).length;
  if (meaningful === 0) return 'limited';
  return 'sufficient';
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
  // Coverage of distinct discovery areas (breadth), max 50.
  const coverage =
    (Number(a.everProcess) + Number(a.everPain) + Number(a.everImpact) +
      Number(a.everTimeline) + Number(a.everDecision)) * 10;
  const open = a.everOpenQuestion ? 6 : 0;
  // Density: proportion of turns that actually did discovery (depth), max 24.
  const density = Math.round(frac(a.discoveryTurns, a.n) * 24);
  let s = coverage + open + density;
  s -= Math.min(a.repetitiveCount, 8) * 5; // repetition is not discovery
  s -= Math.min(a.noiseTurns, 8) * 3; // trivial / off-topic turns
  return clamp(s);
}

function problemIdentification(a: Aggregates): number {
  // Coverage of the pieces of a real problem statement, max 54.
  const coverage =
    (a.everPain ? 22 : 0) + (a.everImpact ? 18 : 0) + (a.everContext ? 14 : 0);
  // Sustained relevance: how much of the call actually stayed on-task, max 22.
  const sustained = Math.round(frac(a.meaningfulTurns, a.n) * 22);
  let s = coverage + sustained;
  s -= Math.min(a.repetitiveCount, 8) * 4;
  s -= Math.min(a.unsupportedCount, 4) * 6; // unsupported conclusions
  return clamp(s);
}

function valueArticulation(a: Aggregates, ctx: FinalEvaluationContext): number {
  let s = 45;
  if (a.everContext) s += 15; // tied value to a stated need
  if (ctx.finalStage === 'value_mapping' || ctx.finalStage === 'next_step') s += 10;
  if (a.everNextStep) s += 5;
  s -= a.unsupportedCount * 10;
  s -= a.earlyPitchCount * 8;
  s -= Math.min(a.repetitiveCount, 6) * 3;
  return clamp(s);
}

function clarityAndConciseness(a: Aggregates): number {
  let s = 68;
  s -= Math.min(a.tooLongCount, a.n) * 7;
  s -= Math.min(a.repetitiveCount, a.n) * 7; // rambling / repetition throughout
  s -= a.unsupportedCount * 6;
  s -= a.ignoredCount * 5;
  s -= Math.min(a.noiseTurns, 8) * 2;
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
 * Divergence guard: corroborate the blended overall against the live history.
 *
 * The final score legitimately differs from the live average — it judges the
 * whole conversation, not each turn — but it may only sit ABOVE the live
 * average by a margin the evidence earns. A call that was heavily repetitive or
 * mostly low-information cannot claim a strong whole-conversation score its
 * turns never supported (the exact spam-farming exploit this closes). The guard
 * never RAISES a score; it only caps an over-optimistic one.
 */
export function applyEvidenceGuard(
  overall: number,
  ctx: FinalEvaluationContext,
  a: Aggregates,
): number {
  const repRatio = frac(a.repetitiveCount, a.n);
  const noiseRatio = frac(a.noiseTurns, a.n);
  let maxAbove = 18;
  if (repRatio > 0.3 || noiseRatio > 0.3) maxAbove = 8;
  if (repRatio > 0.5 || noiseRatio > 0.5) maxAbove = 0;
  const cap = clamp(Math.round(ctx.liveAverage) + maxAbove);
  return Math.min(overall, cap);
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
