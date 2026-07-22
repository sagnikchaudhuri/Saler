import type { EvaluatorResult, EvaluatorSignals, SalesStage } from '../types';

// ============================================================================
// Strict runtime validation for evaluator results.
//
// A real LLM evaluator can return malformed JSON, missing keys, or wrong
// types. We validate before trusting anything so a bad response can never
// corrupt the session — we fall back to a safe, neutral result and surface a
// non-blocking warning instead.
// ============================================================================

const SIGNAL_KEYS: (keyof EvaluatorSignals)[] = [
  'asked_open_question', 'asked_closed_question', 'identified_pain',
  'quantified_impact', 'explored_current_process', 'explored_decision_process',
  'explored_timeline', 'referenced_customer_context', 'acknowledged_objection',
  'clarified_objection', 'answered_objection', 'confirmed_objection_resolution',
  'asked_relevant_follow_up', 'proposed_next_step', 'pitched_too_early',
  'ignored_customer_statement', 'was_repetitive', 'was_too_long',
  'made_unsupported_claim',
];

const STAGES: SalesStage[] = [
  'opening', 'discovery', 'impact', 'value_mapping', 'objection_handling', 'next_step',
];

export interface ValidationResult {
  ok: boolean;
  value?: EvaluatorResult;
  error?: string;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

/** Validate an unknown value as a well-formed EvaluatorResult. */
export function validateEvaluatorResult(x: unknown): ValidationResult {
  if (!isRecord(x)) return { ok: false, error: 'Result is not an object.' };

  const signals = x.signals;
  if (!isRecord(signals)) return { ok: false, error: 'Missing signals object.' };
  for (const key of SIGNAL_KEYS) {
    if (typeof signals[key] !== 'boolean') {
      return { ok: false, error: `Signal "${key}" must be a boolean.` };
    }
  }

  if (typeof x.turn_quality !== 'number' || Number.isNaN(x.turn_quality) ||
      x.turn_quality < 0 || x.turn_quality > 100) {
    return { ok: false, error: 'turn_quality must be a number 0–100.' };
  }
  if (typeof x.brief_feedback !== 'string') {
    return { ok: false, error: 'brief_feedback must be a string.' };
  }
  if (typeof x.recommended_next_move !== 'string') {
    return { ok: false, error: 'recommended_next_move must be a string.' };
  }
  if (typeof x.detected_stage !== 'string' || !STAGES.includes(x.detected_stage as SalesStage)) {
    return { ok: false, error: 'detected_stage is not a valid stage.' };
  }

  return { ok: true, value: x as unknown as EvaluatorResult };
}

/** All-false signals — the neutral baseline. */
export function emptySignals(): EvaluatorSignals {
  const out = {} as EvaluatorSignals;
  for (const key of SIGNAL_KEYS) out[key] = false;
  return out;
}

/**
 * A safe, valid fallback result that applies NO score changes. Used when the
 * evaluator fails or returns something invalid, so the roleplay continues.
 */
export function safeFallbackResult(stage: SalesStage): EvaluatorResult {
  return {
    signals: emptySignals(),
    turn_quality: 50,
    brief_feedback: 'Scoring was skipped for this turn.',
    recommended_next_move: 'Continue guiding the conversation.',
    detected_stage: stage,
  };
}
