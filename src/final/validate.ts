import { OBJECTIONS } from '../conversation/types';
import type {
  FinalCategoryScores,
  FinalEvaluationContext,
  FinalReport,
  ObjectionResult,
} from './types';

// ============================================================================
// Strict validation + safe fallback for final reports.
//
// A malformed report (especially from a future LLM) must never corrupt a saved
// session. If validation fails we substitute a grounded fallback derived from
// the live average and surface a non-blocking warning — the transcript and
// score history are always preserved.
// ============================================================================

const CATEGORY_KEYS: (keyof FinalCategoryScores)[] = [
  'opening_and_confidence', 'discovery_questions', 'problem_identification',
  'value_articulation', 'objection_handling', 'clarity_and_conciseness',
  'closing_and_next_step',
];

export interface FinalValidationRefs {
  /** Actual seller statements (strongest/weakest must be one of these or ''). */
  sellerMessages: Set<string>;
  /** Labels of objections actually raised (results may not invent others). */
  raisedObjectionLabels: Set<string>;
}

export interface FinalValidationResult {
  ok: boolean;
  value?: FinalReport;
  error?: string;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}
function isScore(x: unknown): x is number {
  return typeof x === 'number' && !Number.isNaN(x) && x >= 0 && x <= 100;
}
function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === 'string');
}

export function validateFinalReport(
  x: unknown,
  refs?: FinalValidationRefs,
): FinalValidationResult {
  if (!isRecord(x)) return { ok: false, error: 'Report is not an object.' };

  if (!isScore(x.overall_score)) return { ok: false, error: 'overall_score out of range.' };

  if (!isRecord(x.category_scores)) return { ok: false, error: 'Missing category_scores.' };
  for (const k of CATEGORY_KEYS) {
    if (!isScore(x.category_scores[k])) return { ok: false, error: `category ${k} invalid.` };
  }

  // Strengths are evidence-based and may be empty: a weak call has none, and we
  // never pad with invented praise. Zero to three.
  if (!isStringArray(x.strengths) || x.strengths.length > 3) {
    return { ok: false, error: 'strengths must be 0 to 3 strings.' };
  }
  if (!isStringArray(x.missed_opportunities) || x.missed_opportunities.length !== 3) {
    return { ok: false, error: 'missed_opportunities must be exactly 3 strings.' };
  }

  if (typeof x.strongest_statement !== 'string') return { ok: false, error: 'strongest_statement invalid.' };
  if (typeof x.weakest_statement !== 'string') return { ok: false, error: 'weakest_statement invalid.' };
  if (typeof x.better_response !== 'string') return { ok: false, error: 'better_response invalid.' };
  if (!isStringArray(x.missed_discovery_questions)) return { ok: false, error: 'missed_discovery_questions invalid.' };
  if (typeof x.recommended_practice !== 'string') return { ok: false, error: 'recommended_practice invalid.' };
  if (typeof x.summary !== 'string') return { ok: false, error: 'summary invalid.' };

  if (!Array.isArray(x.objection_results)) return { ok: false, error: 'objection_results invalid.' };
  for (const r of x.objection_results as unknown[]) {
    if (!isRecord(r) || typeof r.objection !== 'string' ||
        typeof r.handled !== 'boolean' || typeof r.explanation !== 'string') {
      return { ok: false, error: 'objection_results entry invalid.' };
    }
  }

  // Semantic rules that need the transcript context.
  if (refs) {
    const stmtOk = (s: string) => s === '' || refs.sellerMessages.has(s);
    if (!stmtOk(x.strongest_statement)) return { ok: false, error: 'strongest_statement is not a real seller statement.' };
    if (!stmtOk(x.weakest_statement)) return { ok: false, error: 'weakest_statement is not a real seller statement.' };
    for (const r of x.objection_results as ObjectionResult[]) {
      if (!refs.raisedObjectionLabels.has(r.objection)) {
        return { ok: false, error: 'objection_results references an objection that was never raised.' };
      }
    }
  }

  return { ok: true, value: x as unknown as FinalReport };
}

/** A grounded, valid fallback report. Loses no data; adds no fake precision. */
export function safeFinalFallback(ctx: FinalEvaluationContext): FinalReport {
  const base = Math.max(0, Math.min(100, Math.round(ctx.liveAverage)));
  const cats: FinalCategoryScores = {
    opening_and_confidence: base,
    discovery_questions: base,
    problem_identification: base,
    value_articulation: base,
    objection_handling: base,
    clarity_and_conciseness: base,
    closing_and_next_step: base,
  };
  const objection_results: ObjectionResult[] = ctx.objectionEvents.map((e) => ({
    objection: OBJECTIONS[e.key],
    handled: ctx.addressedObjections.includes(e.key),
    explanation: 'Based on live tracking; the full analysis was unavailable.',
  }));

  return {
    overall_score: base,
    category_scores: cats,
    // No invented praise, and none at all for a call that never happened.
    strengths:
      ctx.sellerTurnCount === 0
        ? []
        : ['Completed a practice call.', 'Engaged with the customer.', 'Kept the conversation moving.'],
    missed_opportunities: [
      'Full analysis was unavailable for this call.',
      'Re-run the call for detailed coaching.',
      'Focus on discovery and a clear next step.',
    ],
    strongest_statement: ctx.sellerMessages[0] ?? '',
    weakest_statement: '',
    better_response: 'Lead with discovery, quantify the impact, then propose a concrete next step.',
    missed_discovery_questions: [
      'How are new reps onboarded and trained today?',
      'How much does slow ramp-up cost you?',
    ],
    objection_results,
    recommended_practice: 'Re-run this scenario and focus on quantifying impact before pitching.',
    summary: 'The detailed evaluation was unavailable, so this is a safe summary based on your live scores. Your transcript and score history are fully preserved.',
  };
}
