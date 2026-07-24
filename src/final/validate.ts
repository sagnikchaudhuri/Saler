import { OBJECTIONS } from '../conversation/types';
import type {
  AiFinalNarrative,
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

// ============================================================================
// AI narrative grounding.
//
// The AI final evaluator supplies interpretive coaching text only — never
// scores. Even so, an LLM can be steered by seller-controlled transcript
// content, so every field is bounded and screened before it is trusted. What
// cannot be positively proven (strengths, missed opportunities, summary,
// practice, better response, missed questions) is treated as coaching
// interpretation and must not smuggle in invented facts about the customer.
// Quotes (strongest/weakest) must match a real seller message exactly.
// ============================================================================

/** Control characters (except normal whitespace) never belong in coaching text. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
/** Markdown / HTML we do not expect in plain coaching prose. */
const MARKUP = /[<>]|\[[^\]]*\]\([^)]*\)|(^|\s)[*_`#]{1,}\S|```/;

/**
 * Numerals that read as asserted FACTS about the customer — the exact class the
 * audit caught being invented (team sizes, percentages, pricing, dates,
 * performance multipliers). Bare small numbers (e.g. "a 20-minute demo",
 * "two leads") are allowed; these specific fact-shaped patterns are not.
 */
const FABRICATED_FACT =
  /\d+\s*%|[$£€]\s*\d|\b\d[\d,]*\s*(reps|employees|people|staff|salespeople|agents|customers|users|seats|deals|hours per|percent)\b|\b\d+x\b|\b(19|20)\d{2}\b|\b\d[\d,]{3,}\b/i;

function cleanText(s: unknown, maxLen: number, allowFactNumerals = false): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (t.length > maxLen) return null;
  if (CONTROL_CHARS.test(t)) return null;
  if (MARKUP.test(t)) return null;
  if (!allowFactNumerals && FABRICATED_FACT.test(t)) return null;
  return t;
}

function cleanList(x: unknown, maxItems: number, maxLen: number): string[] | null {
  if (!Array.isArray(x)) return null;
  if (x.length > maxItems) return null;
  const out: string[] = [];
  for (const v of x) {
    const c = cleanText(v, maxLen);
    if (c === null) return null;
    if (c.length > 0) out.push(c);
  }
  return out;
}

/** Cheap token-set similarity, for de-duplicating near-identical questions. */
function similar(a: string, b: string): boolean {
  const toks = (s: string) =>
    new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
  const A = toks(a);
  const B = toks(b);
  if (A.size === 0 || B.size === 0) return false;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter) >= 0.6;
}

export interface AiNarrativeResult {
  ok: boolean;
  value?: AiFinalNarrative;
  error?: string;
}

/**
 * Validate + ground an AI narrative payload. Forbidden score fields cause
 * rejection outright (the model must not even attempt to score). Quotes are
 * matched against real seller messages; interpretive fields are screened for
 * markup, control chars, over-length, and fabricated factual numerals; and
 * missed questions are de-duplicated against each other and against questions
 * already asked. Any failure returns `ok: false` so the caller falls back to
 * the deterministic report.
 */
export function validateAiNarrative(
  x: unknown,
  refs: FinalValidationRefs,
): AiNarrativeResult {
  if (!isRecord(x)) return { ok: false, error: 'Narrative is not an object.' };

  // Reject any attempt to supply scores: the model owns no numbers.
  if ('overall_score' in x || 'category_scores' in x || 'objection_results' in x) {
    return { ok: false, error: 'Narrative must not contain score or objection fields.' };
  }

  const strengths = cleanList(x.strengths, 3, 160);
  if (strengths === null) return { ok: false, error: 'strengths invalid.' };

  const missed = cleanList(x.missed_opportunities, 3, 160);
  if (missed === null || missed.length !== 3) {
    return { ok: false, error: 'missed_opportunities must be 3 clean items.' };
  }

  // better_response is a SUGGESTED reply — it may contain example specifics, so
  // fact-numerals are permitted, but markup/control/over-length are not.
  const better = cleanText(x.better_response, 300, true);
  if (better === null) return { ok: false, error: 'better_response invalid.' };

  const practice = cleanText(x.recommended_practice, 300);
  if (practice === null) return { ok: false, error: 'recommended_practice invalid.' };

  const summary = cleanText(x.summary, 600);
  if (summary === null) return { ok: false, error: 'summary invalid.' };

  // Quotes must be verbatim seller messages (or empty).
  const strongest = typeof x.strongest_statement === 'string' ? x.strongest_statement : null;
  const weakest = typeof x.weakest_statement === 'string' ? x.weakest_statement : null;
  if (strongest === null || weakest === null) return { ok: false, error: 'quotes invalid.' };
  const quoteOk = (s: string) => s === '' || refs.sellerMessages.has(s);
  if (!quoteOk(strongest)) return { ok: false, error: 'strongest_statement is not a real seller statement.' };
  if (!quoteOk(weakest)) return { ok: false, error: 'weakest_statement is not a real seller statement.' };

  // Missed questions: clean, then drop ones already asked or duplicated.
  const rawQuestions = cleanList(x.missed_discovery_questions, 6, 200);
  if (rawQuestions === null) return { ok: false, error: 'missed_discovery_questions invalid.' };
  const asked = [...refs.sellerMessages];
  const questions: string[] = [];
  for (const q of rawQuestions) {
    if (asked.some((m) => similar(q, m))) continue; // already asked
    if (questions.some((kept) => similar(q, kept))) continue; // duplicate of a kept one
    questions.push(q);
  }

  return {
    ok: true,
    value: {
      strengths,
      missed_opportunities: missed,
      strongest_statement: strongest,
      weakest_statement: weakest,
      better_response: better,
      missed_discovery_questions: questions,
      recommended_practice: practice,
      summary,
    },
  };
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
