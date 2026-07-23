import type { SalesStage, TranscriptTurn } from '../types';
import type { ObjectionKey } from '../conversation/types';
import type { ScoreHistoryEntry } from '../scoring/types';

// ============================================================================
// Final (post-call) evaluator abstraction and report schema.
//
// The final evaluator judges the conversation AS A WHOLE, using the transcript
// and the live score history as evidence — it does NOT simply copy the final
// live metrics. Demo (deterministic) and LLM (disabled until a secure endpoint
// exists) share one interface.
// ============================================================================

export interface FinalCategoryScores {
  opening_and_confidence: number;
  discovery_questions: number;
  problem_identification: number;
  value_articulation: number;
  objection_handling: number;
  clarity_and_conciseness: number;
  closing_and_next_step: number;
}

export interface ObjectionResult {
  objection: string;
  handled: boolean;
  explanation: string;
}

/** The exact final-report schema returned by the evaluator. */
export interface FinalReport {
  overall_score: number;
  category_scores: FinalCategoryScores;
  strengths: string[]; // exactly 3
  missed_opportunities: string[]; // exactly 3
  strongest_statement: string;
  weakest_statement: string;
  better_response: string;
  missed_discovery_questions: string[];
  objection_results: ObjectionResult[];
  recommended_practice: string;
  summary: string;
}

/** When an objection was raised, keyed to a seller-turn number. */
export interface ObjectionEvent {
  key: ObjectionKey;
  /** The seller turn number after which this objection was raised. */
  turnRaised: number;
}

/** Everything the final evaluator needs. No secrets, no prompts, no audio. */
export interface FinalEvaluationContext {
  transcript: TranscriptTurn[];
  sellerMessages: string[];
  scoreHistory: ScoreHistoryEntry[];
  objectionEvents: ObjectionEvent[];
  addressedObjections: ObjectionKey[];
  finalStage: SalesStage;
  durationMs: number;
  liveAverage: number;
  agreedToNextStep: boolean;
  sellerTurnCount: number;
}

export interface FinalEvaluatorProvider {
  getName(): string;
  isAvailable(): boolean;
  evaluate(ctx: FinalEvaluationContext): Promise<FinalReport>;
}
