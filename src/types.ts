// ============================================================================
// Shared domain types for SalesSim.
// These are intentionally provider-agnostic so the UI, conversation engine,
// evaluator, and scoring engine can stay independent of each other.
// ============================================================================

/** Which screen the app is currently showing. */
export type Screen = 'briefing' | 'roleplay' | 'report' | 'history';

/** Who produced a given line in the transcript. */
export type Speaker = 'seller' | 'customer' | 'system';

/** One line of dialogue in the roleplay transcript. */
export interface TranscriptTurn {
  id: string;
  speaker: Speaker;
  text: string;
  /** Epoch milliseconds when the turn was recorded. */
  timestamp: number;
}

/** The six live performance metrics, each 0–100. */
export interface Scores {
  discovery: number;
  relevance: number;
  clarity: number;
  listening: number;
  objectionHandling: number;
  progression: number;
}

/** The sales stage the seller appears to be in. */
export type SalesStage =
  | 'opening'
  | 'discovery'
  | 'impact'
  | 'value_mapping'
  | 'objection_handling'
  | 'next_step';

/** Momentum derived from recent score history. */
export type Momentum = 'Improving' | 'Stable' | 'Declining';

/**
 * Structured behavioural signals the evaluator returns for each seller turn.
 * The evaluator only *observes*; the deterministic scoring engine turns these
 * booleans into score changes.
 */
export interface EvaluatorSignals {
  asked_open_question: boolean;
  asked_closed_question: boolean;
  identified_pain: boolean;
  quantified_impact: boolean;
  explored_current_process: boolean;
  explored_decision_process: boolean;
  explored_timeline: boolean;
  referenced_customer_context: boolean;
  acknowledged_objection: boolean;
  clarified_objection: boolean;
  answered_objection: boolean;
  confirmed_objection_resolution: boolean;
  asked_relevant_follow_up: boolean;
  proposed_next_step: boolean;
  pitched_too_early: boolean;
  ignored_customer_statement: boolean;
  was_repetitive: boolean;
  was_too_long: boolean;
  made_unsupported_claim: boolean;
}

/** The full structured result of evaluating one seller turn. */
export interface EvaluatorResult {
  signals: EvaluatorSignals;
  turn_quality: number;
  brief_feedback: string;
  recommended_next_move: string;
  detected_stage: SalesStage;
}

/** A saved roleplay session (persisted to localStorage in Phase 4). */
export interface SessionRecord {
  id: string;
  startedAt: number;
  endedAt: number | null;
  scenarioId: string;
  transcript: TranscriptTurn[];
  scoreHistory: Scores[];
  finalScore: number | null;
  /** True when the session ran without live AI/voice services. */
  demoMode: boolean;
}
