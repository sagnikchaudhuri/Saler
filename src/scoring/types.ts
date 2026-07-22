import type { EvaluatorSignals, Momentum, SalesStage, Scores } from '../types';

// ============================================================================
// Scoring domain types.
//
// The scoring engine is PURE TypeScript — no React, no evaluator, no
// randomness. The evaluator returns signals; these functions decide the
// numbers. That separation is deliberate: an LLM must never assign persistent
// scores directly, so scores stay explainable and unit-testable.
// ============================================================================

/** One recorded reason for a single metric change on a turn. */
export interface ScoreChangeReason {
  signal: keyof EvaluatorSignals;
  metric: keyof Scores;
  delta: number;
  note: string;
}

/** A full history entry, written after every seller turn. */
export interface ScoreHistoryEntry {
  sellerTurn: number;
  timestamp: number;
  stage: SalesStage;
  previousMetrics: Scores;
  updatedMetrics: Scores;
  rawOverall: number;
  visibleOverall: number;
  momentum: Momentum;
  signals: EvaluatorSignals;
  briefFeedback: string;
  recommendedNextMove: string;
  reasons: ScoreChangeReason[];
}

/**
 * The persistent scoring state for a session. Immutable updates only — every
 * function returns a new object rather than mutating.
 */
export interface ScoreState {
  metrics: Scores;
  /** Smoothed, movement-capped score actually shown to the user. */
  visibleOverall: number;
  /** True once an objection has been raised (activates objection weighting). */
  objectionActive: boolean;
  /** How many times each signal has already been rewarded (diminishing returns). */
  rewardedCounts: Partial<Record<keyof EvaluatorSignals, number>>;
  history: ScoreHistoryEntry[];
}
