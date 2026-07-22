import type { EvaluatorResult, SalesStage, TranscriptTurn } from '../types';
import type { ObjectionKey } from '../conversation/types';

// ============================================================================
// Real-time evaluator abstraction.
//
// The evaluator SILENTLY analyses each seller turn and returns structured
// behavioural *signals* — never final scores, and never coaching that flows
// back into the customer persona. Keeping it a provider (Demo now, LLM later)
// means the deterministic engine and the LLM-backed one share one contract.
// ============================================================================

/** Everything the evaluator legitimately needs to score one seller turn. */
export interface EvaluationContext {
  /** The seller's latest message (the turn being evaluated). */
  sellerMessage: string;
  /** The customer's most recent statement, i.e. what the seller replied to. */
  latestCustomerStatement: string | null;
  /** Full transcript up to and including the seller turn. */
  transcript: TranscriptTurn[];
  /** The sales stage at the time of the seller turn. */
  stage: SalesStage;
  /** Objections raised so far (used to gate objection-handling signals). */
  objectionsRaised: ObjectionKey[];
  /** Prior seller messages, for repetition detection. */
  previousSellerMessages: string[];
}

/**
 * The evaluator provider contract. Demo and LLM implementations expose exactly
 * this interface.
 */
export interface RealTimeEvaluatorProvider {
  getName(): string;
  isAvailable(): boolean;
  evaluate(ctx: EvaluationContext): Promise<EvaluatorResult>;
}
