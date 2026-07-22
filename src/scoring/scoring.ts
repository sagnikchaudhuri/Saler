import type { EvaluatorSignals, Scores } from '../types';
import type { ScoreChangeReason } from './types';

// ============================================================================
// Pure deterministic scoring functions.
// ============================================================================

/** Maximum points the visible overall score may move in a single turn. */
export const MAX_VISIBLE_MOVEMENT = 8;

/** Positive signal → base metric changes (from the Phase 3 spec). */
export const POSITIVE_CHANGES: Partial<Record<keyof EvaluatorSignals, Partial<Scores>>> = {
  asked_open_question: { discovery: 5 },
  identified_pain: { discovery: 8 },
  quantified_impact: { discovery: 8, progression: 4 },
  explored_current_process: { discovery: 5 },
  explored_decision_process: { discovery: 5, progression: 3 },
  explored_timeline: { discovery: 4, progression: 3 },
  referenced_customer_context: { relevance: 7, listening: 5 },
  acknowledged_objection: { objectionHandling: 3 },
  clarified_objection: { objectionHandling: 4 },
  answered_objection: { objectionHandling: 7 },
  confirmed_objection_resolution: { objectionHandling: 4 },
  asked_relevant_follow_up: { listening: 6 },
  proposed_next_step: { progression: 8 },
};

/** Negative signal → base metric changes. Penalties are not diminished. */
export const NEGATIVE_CHANGES: Partial<Record<keyof EvaluatorSignals, Partial<Scores>>> = {
  pitched_too_early: { discovery: -5, progression: -5 },
  ignored_customer_statement: { listening: -7 },
  was_repetitive: { relevance: -4, clarity: -4 },
  was_too_long: { clarity: -6 },
  made_unsupported_claim: { relevance: -6, clarity: -3 },
};

/** Human-readable labels for reason logs. */
const SIGNAL_LABELS: Partial<Record<keyof EvaluatorSignals, string>> = {
  asked_open_question: 'Asked an open question',
  identified_pain: 'Identified a pain point',
  quantified_impact: 'Quantified the impact',
  explored_current_process: 'Explored the current process',
  explored_decision_process: 'Explored the decision process',
  explored_timeline: 'Explored the timeline',
  referenced_customer_context: 'Referenced what the customer said',
  acknowledged_objection: 'Acknowledged the objection',
  clarified_objection: 'Clarified the objection',
  answered_objection: 'Answered the objection',
  confirmed_objection_resolution: 'Confirmed objection resolution',
  asked_relevant_follow_up: 'Asked a relevant follow-up',
  proposed_next_step: 'Proposed a next step',
  pitched_too_early: 'Pitched too early',
  ignored_customer_statement: 'Ignored the customer',
  was_repetitive: 'Repeated earlier content',
  was_too_long: 'Response was too long',
  made_unsupported_claim: 'Made an unsupported claim',
};

const METRIC_KEYS: (keyof Scores)[] = [
  'discovery', 'relevance', 'clarity', 'listening', 'objectionHandling', 'progression',
];

export function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Diminishing-returns factor for repeated rewards of the SAME positive signal.
 * 1st time full, 2nd half, 3rd quarter, 4th+ nothing. This blocks farming the
 * same achievement (e.g. asking open questions forever). Penalties bypass this.
 */
export function rewardFactor(priorCount: number): number {
  if (priorCount <= 0) return 1;
  if (priorCount === 1) return 0.5;
  if (priorCount === 2) return 0.25;
  return 0;
}

export interface ApplySignalsResult {
  metrics: Scores;
  reasons: ScoreChangeReason[];
  rewardedCounts: Partial<Record<keyof EvaluatorSignals, number>>;
}

/**
 * Apply evaluator signals to metrics immutably. Positive signals use
 * diminishing returns via rewardedCounts; penalties always apply in full.
 * Returns new metrics, a reason log, and the updated reward counts.
 */
export function applySignals(
  metrics: Scores,
  signals: EvaluatorSignals,
  rewardedCounts: Partial<Record<keyof EvaluatorSignals, number>>,
): ApplySignalsResult {
  const next: Scores = { ...metrics };
  const reasons: ScoreChangeReason[] = [];
  const counts = { ...rewardedCounts };

  // Positive signals (diminishing returns).
  for (const key of Object.keys(POSITIVE_CHANGES) as (keyof EvaluatorSignals)[]) {
    if (!signals[key]) continue;
    const prior = counts[key] ?? 0;
    const factor = rewardFactor(prior);
    counts[key] = prior + 1;
    if (factor === 0) continue;
    const changes = POSITIVE_CHANGES[key]!;
    for (const metric of METRIC_KEYS) {
      const base = changes[metric];
      if (base === undefined) continue;
      const delta = Math.round(base * factor);
      if (delta === 0) continue;
      next[metric] = clamp(next[metric] + delta);
      reasons.push({ signal: key, metric, delta, note: SIGNAL_LABELS[key] ?? key });
    }
  }

  // Negative signals (always full weight).
  for (const key of Object.keys(NEGATIVE_CHANGES) as (keyof EvaluatorSignals)[]) {
    if (!signals[key]) continue;
    const changes = NEGATIVE_CHANGES[key]!;
    for (const metric of METRIC_KEYS) {
      const delta = changes[metric];
      if (delta === undefined) continue;
      next[metric] = clamp(next[metric] + delta);
      reasons.push({ signal: key, metric, delta, note: SIGNAL_LABELS[key] ?? key });
    }
  }

  return { metrics: next, reasons, rewardedCounts: counts };
}

/** Pre-objection weights (objection handling excluded). Sum = 1.0. */
export const PRE_OBJECTION_WEIGHTS = {
  discovery: 0.25,
  relevance: 0.22,
  clarity: 0.17,
  listening: 0.22,
  progression: 0.14,
} as const;

/** Post-objection weights (objection handling included). Sum = 1.0. */
export const POST_OBJECTION_WEIGHTS = {
  discovery: 0.2,
  relevance: 0.18,
  clarity: 0.14,
  listening: 0.18,
  objectionHandling: 0.18,
  progression: 0.12,
} as const;

/**
 * Raw weighted overall score. Objection handling is only weighted once an
 * objection has been raised — before that it isn't an active scored dimension.
 */
export function rawOverall(metrics: Scores, objectionActive: boolean): number {
  if (objectionActive) {
    const w = POST_OBJECTION_WEIGHTS;
    return Math.round(
      metrics.discovery * w.discovery +
        metrics.relevance * w.relevance +
        metrics.clarity * w.clarity +
        metrics.listening * w.listening +
        metrics.objectionHandling * w.objectionHandling +
        metrics.progression * w.progression,
    );
  }
  const w = PRE_OBJECTION_WEIGHTS;
  return Math.round(
    metrics.discovery * w.discovery +
      metrics.relevance * w.relevance +
      metrics.clarity * w.clarity +
      metrics.listening * w.listening +
      metrics.progression * w.progression,
  );
}

/**
 * Smooth the visible score toward the raw score, capping movement at
 * MAX_VISIBLE_MOVEMENT points per turn. This prevents jarring jumps.
 */
export function smoothVisible(prevVisible: number, raw: number): number {
  const delta = raw - prevVisible;
  const capped = clamp(delta, -MAX_VISIBLE_MOVEMENT, MAX_VISIBLE_MOVEMENT);
  return clamp(Math.round(prevVisible + capped));
}
