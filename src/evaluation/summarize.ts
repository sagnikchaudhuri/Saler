import type { EvaluatorSignals, SalesStage } from '../types';
import type { EvaluationContext } from './types';

// ============================================================================
// Deterministic turn-quality, feedback, next-move, and stage summarisation.
//
// These are VISUAL coaching hints only — they render in the UI and are never
// spoken to the seller or passed into the customer persona. Pure functions.
// ============================================================================

const POSITIVE_KEYS: (keyof EvaluatorSignals)[] = [
  'asked_open_question', 'identified_pain', 'quantified_impact',
  'explored_current_process', 'explored_decision_process', 'explored_timeline',
  'referenced_customer_context', 'acknowledged_objection', 'clarified_objection',
  'answered_objection', 'confirmed_objection_resolution', 'asked_relevant_follow_up',
  'proposed_next_step',
];
const NEGATIVE_KEYS: (keyof EvaluatorSignals)[] = [
  'pitched_too_early', 'ignored_customer_statement', 'was_repetitive',
  'was_too_long', 'made_unsupported_claim',
];

/** Deterministic 0–100 quality read of a single turn from its signals. */
export function computeTurnQuality(s: EvaluatorSignals): number {
  const pos = POSITIVE_KEYS.filter((k) => s[k]).length;
  const neg = NEGATIVE_KEYS.filter((k) => s[k]).length;
  const q = 50 + pos * 10 - neg * 15;
  return Math.max(0, Math.min(100, q));
}

/** One-line visual feedback, chosen by the most significant signal. */
export function pickFeedback(s: EvaluatorSignals): string {
  if (s.made_unsupported_claim) return 'Avoid unsupported guarantees — they read as red flags.';
  if (s.pitched_too_early) return "You're pitching before you understand the problem.";
  if (s.ignored_customer_statement) return 'You skipped over what Rohan just said.';
  if (s.was_too_long) return 'Tighten that up — keep your turns concise.';
  if (s.was_repetitive) return "You've asked this already; move the conversation forward.";
  if (s.answered_objection || s.confirmed_objection_resolution) return 'Good — you engaged the objection directly.';
  if (s.acknowledged_objection || s.clarified_objection) return 'Nice acknowledgement; now resolve the concern.';
  if (s.quantified_impact) return 'Great — you put a number on the pain.';
  if (s.identified_pain) return 'Good — you surfaced a real problem.';
  if (s.referenced_customer_context) return 'Strong listening — you built on his words.';
  if (s.asked_open_question || s.explored_current_process) return 'Good discovery question.';
  if (s.proposed_next_step) return "Reasonable — just make sure you've earned the demo.";
  return 'Keep guiding the conversation forward.';
}

/** Deterministic recommended next move from context + what's still missing. */
export function pickNextMove(ctx: EvaluationContext, s: EvaluatorSignals): string {
  const painBefore = ctx.previousSellerMessages.some((m) => /slow|problem|ramp|struggl|too long|difficult/i.test(m));
  const painNow = s.identified_pain || painBefore;

  if (ctx.objectionsRaised.length > 0 && !(s.answered_objection || s.confirmed_objection_resolution)) {
    return "Address Rohan's open concern before moving on.";
  }
  if (!painNow) return 'Ask how new reps are onboarded and trained today.';
  if (painNow && !s.quantified_impact) {
    return 'Quantify it — ask how long ramp-up takes or what it costs.';
  }
  if (ctx.stage === 'impact' || ctx.stage === 'value_mapping') {
    return 'Connect your solution to the specific pain he named.';
  }
  if (!s.proposed_next_step) return 'Once concerns are handled, propose a short demo.';
  return 'Keep exploring before pitching.';
}

/** Deterministic stage read for the evaluator result. */
export function detectStageFromSignals(ctx: EvaluationContext, s: EvaluatorSignals): SalesStage {
  if (s.proposed_next_step) return 'next_step';
  if (ctx.objectionsRaised.length > 0 || s.acknowledged_objection || s.clarified_objection || s.answered_objection) {
    return 'objection_handling';
  }
  if (s.quantified_impact || s.identified_pain) return 'impact';
  if (s.pitched_too_early) return 'value_mapping';
  if (s.explored_current_process || s.asked_open_question) return 'discovery';
  return ctx.stage;
}
