import type { EvaluatorResult, SalesStage } from '../types';
import { INITIAL_SCORES } from '../data/scenario';
import type { ScoreState, ScoreHistoryEntry } from './types';
import { applySignals, rawOverall, smoothVisible } from './scoring';
import { computeMomentum } from './momentum';

/**
 * Fresh scoring state. The initial visible overall is computed from the
 * initial metrics with objection handling excluded (no objection yet).
 */
export function createInitialScoreState(): ScoreState {
  return {
    metrics: { ...INITIAL_SCORES },
    visibleOverall: rawOverall(INITIAL_SCORES, false),
    objectionActive: false,
    rewardedCounts: {},
    history: [],
  };
}

export interface ApplyEvaluationMeta {
  sellerTurn: number;
  timestamp: number;
  stage: SalesStage;
  /** Whether an objection has been raised (activates objection weighting). */
  objectionActive: boolean;
}

/**
 * Apply one evaluator result to the scoring state, immutably. Produces a new
 * ScoreState with updated metrics, a smoothed visible overall, momentum, and a
 * complete history entry appended. The evaluator NEVER writes metrics directly:
 * it only supplies signals, which these deterministic functions convert.
 */
export function applyEvaluation(
  state: ScoreState,
  result: EvaluatorResult,
  meta: ApplyEvaluationMeta,
): ScoreState {
  const previousMetrics = state.metrics;
  const { metrics, reasons, rewardedCounts } = applySignals(
    previousMetrics,
    result.signals,
    state.rewardedCounts,
  );

  const objectionActive = state.objectionActive || meta.objectionActive;
  const raw = rawOverall(metrics, objectionActive);
  const visibleOverall = smoothVisible(state.visibleOverall, raw);

  const visibleHistory = [...state.history.map((h) => h.visibleOverall), visibleOverall];
  const momentum = computeMomentum(visibleHistory);

  const entry: ScoreHistoryEntry = {
    sellerTurn: meta.sellerTurn,
    timestamp: meta.timestamp,
    stage: meta.stage,
    previousMetrics,
    updatedMetrics: metrics,
    rawOverall: raw,
    visibleOverall,
    momentum,
    signals: result.signals,
    briefFeedback: result.brief_feedback,
    recommendedNextMove: result.recommended_next_move,
    reasons,
  };

  return {
    metrics,
    visibleOverall,
    objectionActive,
    rewardedCounts,
    history: [...state.history, entry],
  };
}
