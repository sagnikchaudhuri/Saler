import type { EvaluatorSignals } from '../types';
import type { Aggregates } from './analyze';
import type { FinalCategoryScores, FinalEvaluationContext } from './types';

// ============================================================================
// Deterministic narrative pieces: strongest/weakest statements, better
// response, missed discovery questions, recommended practice, summary, and the
// live-vs-final comparison message. All pure; strongest/weakest are ALWAYS
// actual seller statements from the transcript (never invented).
// ============================================================================

interface Pair {
  msg: string;
  sig: EvaluatorSignals | null;
}

function pairs(ctx: FinalEvaluationContext): Pair[] {
  return ctx.sellerMessages.map((msg, i) => ({
    msg,
    sig: ctx.scoreHistory[i]?.signals ?? null,
  }));
}

function strongestScore(s: EvaluatorSignals | null): number {
  if (!s) return 0;
  let v = 0;
  if (s.identified_pain) v += 3;
  if (s.quantified_impact) v += 4;
  if (s.referenced_customer_context) v += 3;
  if (s.answered_objection) v += 4;
  if (s.confirmed_objection_resolution) v += 2;
  if (s.explored_current_process) v += 2;
  if (s.explored_decision_process) v += 2;
  if (s.explored_timeline) v += 2;
  if (s.asked_relevant_follow_up) v += 2;
  if (s.asked_open_question) v += 1;
  if (s.proposed_next_step) v += 2;
  if (s.made_unsupported_claim) v -= 5;
  if (s.pitched_too_early) v -= 4;
  if (s.ignored_customer_statement) v -= 3;
  return v;
}

function weakestScore(s: EvaluatorSignals | null): number {
  if (!s) return 0;
  let v = 0;
  if (s.made_unsupported_claim) v += 5;
  if (s.pitched_too_early) v += 4;
  if (s.ignored_customer_statement) v += 4;
  if (s.was_repetitive) v += 3;
  if (s.was_too_long) v += 3;
  // vague/irrelevant: no positive signal fired at all
  const anyPositive =
    s.asked_open_question || s.identified_pain || s.quantified_impact ||
    s.explored_current_process || s.referenced_customer_context ||
    s.answered_objection || s.acknowledged_objection || s.clarified_objection ||
    s.asked_relevant_follow_up || s.proposed_next_step;
  if (!anyPositive) v += 2;
  if (s.identified_pain || s.quantified_impact || s.referenced_customer_context) v -= 3;
  return v;
}

export interface SelectedStatements {
  strongest: string;
  weakest: string;
  weakestSignals: EvaluatorSignals | null;
}

/**
 * Positive-merit threshold a statement must clear to be shown as the strongest
 * moment: at least one genuine positive signal. Below it (punctuation-only,
 * "ok", "sure", a bare acknowledgement) there is no strongest moment, and we
 * return '' rather than crowning whichever statement merely scored least-badly
 * or happened to come first.
 */
export const STRONGEST_MERIT_THRESHOLD = 1;

export function selectStatements(ctx: FinalEvaluationContext): SelectedStatements {
  const p = pairs(ctx);
  if (p.length === 0) return { strongest: '', weakest: '', weakestSignals: null };

  const best = [...p].sort((a, b) => strongestScore(b.sig) - strongestScore(a.sig))[0];
  const strongest = strongestScore(best.sig) >= STRONGEST_MERIT_THRESHOLD ? best.msg : '';

  if (p.length === 1) {
    // One statement: it is the strongest only if it has real merit, and there
    // is never enough evidence for a distinct weakest.
    return { strongest, weakest: '', weakestSignals: null };
  }

  // Weakest must be a DIFFERENT statement than the chosen strongest. When no
  // statement qualified as strongest, every statement stays eligible.
  const weakestCandidates = [...p]
    .filter((x) => strongest === '' || x.msg !== strongest)
    .sort((a, b) => weakestScore(b.sig) - weakestScore(a.sig));
  const weakest = weakestCandidates[0] ?? null;

  return {
    strongest,
    weakest: weakest ? weakest.msg : '',
    weakestSignals: weakest ? weakest.sig : null,
  };
}

export function betterResponse(
  weakestSignals: EvaluatorSignals | null,
  lowestCategory: keyof FinalCategoryScores,
): string {
  const s = weakestSignals;
  if (s?.made_unsupported_claim)
    return 'Replace the unsupported claim with a discovered fact: “You said ramp-up takes months — here’s how reps rehearse that exact scenario, unlimited times.”';
  if (s?.pitched_too_early)
    return 'Hold the pitch and open with discovery: “Before I show anything — how are your reps trained today?”';
  if (s?.ignored_customer_statement)
    return 'Address the concern head-on: “On data — conversations stay inside your environment; let me show exactly how.”';
  if (s?.was_repetitive)
    return 'Advance instead of repeating: ask a deeper, new question about the impact of the problem.';
  if (s?.was_too_long)
    return 'Tighten it to two sentences that answer the question directly, then ask a follow-up.';
  return PRACTICE_BY_CATEGORY[lowestCategory].better;
}

// --- missed discovery -------------------------------------------------------

const MISSED_QUESTIONS = {
  current_process: 'How are new reps onboarded and trained today?',
  pain: 'What is the single biggest problem with your current ramp-up?',
  impact: 'How much does slow ramp-up cost you — in quota attainment or manager hours?',
  timeline: 'What timeline are you working toward for improving this?',
  decision: 'Who else would be involved in a decision like this?',
  success: 'What would success look like six months after rolling this out?',
  adoption: 'What would it take for your managers and reps to actually adopt it?',
  security: 'What are your data and security requirements for a tool like this?',
} as const;

export function missedDiscoveryQuestions(
  ctx: FinalEvaluationContext,
  a: Aggregates,
): string[] {
  const text = ctx.sellerMessages.join(' \n ').toLowerCase();
  const askedSuccess = /success|goal|kpi|measure|what good looks like/.test(text);
  const askedAdoption = /adopt|buy-in|will (they|reps|managers) use|actually use/.test(text);
  const askedSecurity =
    /secur|privacy|complian|confidential|data (stays|storage|residency)/.test(text) ||
    ctx.objectionEvents.some((e) => e.key === 'sensitive_info');

  const missed: string[] = [];
  if (!a.everProcess) missed.push(MISSED_QUESTIONS.current_process);
  if (!a.everPain) missed.push(MISSED_QUESTIONS.pain);
  if (!a.everImpact) missed.push(MISSED_QUESTIONS.impact);
  if (!a.everTimeline) missed.push(MISSED_QUESTIONS.timeline);
  if (!a.everDecision) missed.push(MISSED_QUESTIONS.decision);
  if (!askedSuccess) missed.push(MISSED_QUESTIONS.success);
  if (!askedAdoption) missed.push(MISSED_QUESTIONS.adoption);
  if (!askedSecurity) missed.push(MISSED_QUESTIONS.security);
  return missed.slice(0, 6);
}

// --- recommended practice ---------------------------------------------------

export const PRACTICE_BY_CATEGORY: Record<
  keyof FinalCategoryScores,
  { practice: string; better: string }
> = {
  opening_and_confidence: {
    practice: 'Practice a concise, confident opening that leads with a question, not a pitch.',
    better: 'Open with a crisp line and a question: “Thanks for the time — how are your reps ramped today?”',
  },
  discovery_questions: {
    practice: 'Practice asking two impact questions before presenting any features.',
    better: 'Ask an impact question: “How long does a new rep take to hit quota today?”',
  },
  problem_identification: {
    practice: 'Practice reflecting the customer’s problem back in their own words before pitching.',
    better: 'Reflect it back: “So slow ramp-up is costing you both manager time and quota — is that right?”',
  },
  value_articulation: {
    practice: 'Practice tying one specific feature to one discovered pain — no generic feature dumps.',
    better: 'Tie value to pain: “You mentioned manager time — reps practise here with no manager in the room.”',
  },
  objection_handling: {
    practice: 'Use the Acknowledge–Clarify–Respond–Confirm framework on the next objection you hit.',
    better: 'Acknowledge, then clarify: “Fair concern — is it mainly data storage or access you’re worried about?”',
  },
  clarity_and_conciseness: {
    practice: 'Practice answering in two or three sentences and dropping any unsupported claims.',
    better: 'Answer in two sentences, then ask a question — no superlatives or guarantees.',
  },
  closing_and_next_step: {
    practice: 'Practice closing with a specific next step and the right stakeholder.',
    better: 'Close concretely: “Shall we set a 20-minute demo with two of your team leads next week?”',
  },
};

export function lowestRelevantCategory(
  cats: FinalCategoryScores,
  objectionRelevant: boolean,
): keyof FinalCategoryScores {
  const keys = (Object.keys(cats) as (keyof FinalCategoryScores)[]).filter(
    (k) => objectionRelevant || k !== 'objection_handling',
  );
  return keys.sort((a, b) => cats[a] - cats[b])[0];
}

export function recommendedPractice(
  cats: FinalCategoryScores,
  objectionRelevant: boolean,
): string {
  return PRACTICE_BY_CATEGORY[lowestRelevantCategory(cats, objectionRelevant)].practice;
}

// --- summary & comparison ---------------------------------------------------

const STAGE_WORD: Record<string, string> = {
  opening: 'the opening',
  discovery: 'discovery',
  impact: 'impact',
  value_mapping: 'value-mapping',
  objection_handling: 'objection handling',
  next_step: 'a next step',
};

export function buildSummary(ctx: FinalEvaluationContext, a: Aggregates): string {
  if (a.n === 0) {
    return 'No seller turns were recorded, so there is not enough evidence to assess this call. Start a call and speak with Rohan to get a full report.';
  }
  const reached = STAGE_WORD[ctx.finalStage] ?? ctx.finalStage;
  const limited = a.n <= 2 ? ' This was a very short call, so confidence in these findings is limited.' : '';
  if (ctx.agreedToNextStep) {
    return `Strong close — you reached ${reached} and earned the demo. Keep discovery tight so value-mapping lands even faster.${limited}`;
  }
  if (a.everPain && !a.everImpact) {
    return `You surfaced the problem and reached ${reached}, but never quantified its impact, which weakened the case for change.${limited}`;
  }
  if (!a.everPain) {
    return `The call stalled around ${reached} without pinning down a concrete problem to solve.${limited}`;
  }
  return `You made progress to ${reached} but did not secure a commitment. Focus on quantifying impact and proposing a clear next step.${limited}`;
}

/** Deterministic explanation of why the final score differs from the live average. */
export function buildComparison(liveAverage: number, finalScore: number): string {
  const diff = finalScore - liveAverage;
  if (diff >= 4) {
    return 'Your final score was higher because the full conversation showed stronger overall progression than the early, turn-by-turn scores suggested.';
  }
  if (diff <= -4) {
    return 'Your final score was lower because, viewed as a whole, the conversation started reasonably but fell short on later fundamentals like securing a next step.';
  }
  return 'Your final score is close to your live average — the whole-conversation view broadly agrees with how the individual turns scored.';
}

/**
 * Explains the methodological difference (shown once in the report).
 */
export const LIVE_VS_FINAL_NOTE =
  'Live scoring rates each turn incrementally as the call unfolds; final scoring judges the conversation as a whole — coverage, progression, and outcome — so the two can differ.';

/**
 * Zero to three strengths, drawn ONLY from what actually happened. There is no
 * filler: a call that demonstrated nothing praiseworthy returns an empty list,
 * and the report renders an honest "no clear strengths" state. Inventing praise
 * for a weak call (the old behaviour) destroyed the report's credibility.
 */
export function buildStrengths(ctx: FinalEvaluationContext, a: Aggregates): string[] {
  const found: string[] = [];
  if (a.everProcess) found.push('Explored how the team trains reps today.');
  if (a.everPain) found.push('Surfaced a concrete business problem.');
  if (a.everImpact) found.push('Quantified the impact in real terms.');
  if (a.everContext) found.push('Listened well and referenced Rohan’s own words.');
  if (ctx.addressedObjections.length > 0) found.push('Engaged an objection directly.');
  if (ctx.agreedToNextStep) found.push('Earned agreement for a product demo.');
  return found.slice(0, 3);
}

/** Exactly three missed opportunities, based on real gaps. */
export function buildMissed(ctx: FinalEvaluationContext, a: Aggregates): string[] {
  const found: string[] = [];
  if (!a.everProcess) found.push('Did not explore the current onboarding process.');
  if (!a.everImpact) found.push('Never quantified the cost of slow ramp-up.');
  if (!a.everDecision) found.push('Did not explore the decision-making process.');
  if (ctx.objectionEvents.length > ctx.addressedObjections.length)
    found.push('Left at least one objection unresolved.');
  if (!a.everNextStep || !ctx.agreedToNextStep)
    found.push('Did not secure a clear next step (a demo).');
  const filler = [
    'Could have reflected the problem back more explicitly.',
    'Spent little time mapping value to the stated problem.',
    'Did not confirm success criteria or timeline.',
  ];
  return pad(found, filler, 3);
}

function pad(list: string[], filler: string[], target: number): string[] {
  const out = [...list];
  for (const f of filler) {
    if (out.length >= target) break;
    if (!out.includes(f)) out.push(f);
  }
  return out.slice(0, target);
}
