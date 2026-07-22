import type { SalesStage, Scores } from '../types';
import { INITIAL_SCORES } from '../data/scenario';
import { OBJECTIONS, type ObjectionKey } from './types';
import { analyzeSeller } from './persona';
import type { ConversationEngineState } from './engine';

/** Append filler items (skipping duplicates) until the list reaches `target`. */
function padDistinct(list: string[], filler: string[], target: number): string[] {
  const out = [...list];
  for (const f of filler) {
    if (out.length >= target) break;
    if (!out.includes(f)) out.push(f);
  }
  return out.slice(0, target);
}

// ============================================================================
// PLACEHOLDER coaching report.
//
// This produces a *deterministic* report straight from the conversation state,
// with NO AI. It exists so the End Call → report flow is complete and testable.
// Phase 4 replaces this with the real transcript evaluator. It never claims an
// AI evaluation happened.
// ============================================================================

export interface ReportObjection {
  key: ObjectionKey;
  label: string;
  handled: boolean;
}

export interface DemoReport {
  placeholder: true;
  demoMode: boolean;
  overallFinal: number;
  liveAverage: number;
  transcriptEval: number;
  categoryScores: Scores;
  stageReached: SalesStage;
  strengths: string[];
  missedOpportunities: string[];
  strongestStatement: string | null;
  weakestStatement: string | null;
  betterResponse: string;
  objections: ReportObjection[];
  recommendedPractice: string;
  coachingSummary: string;
}

const STAGE_RANK: Record<SalesStage, number> = {
  opening: 0,
  discovery: 1,
  impact: 2,
  value_mapping: 3,
  objection_handling: 4,
  next_step: 5,
};

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Build a deterministic placeholder report from the final conversation state. */
export function buildDemoReport(state: ConversationEngineState): DemoReport {
  const { memory, objectionsRaised, stage, agreedToNextStep, transcript, scoreState } = state;
  const sellerTurns = transcript.filter((t) => t.speaker === 'seller');

  const handledCount = memory.addressedObjections.length;
  const raisedCount = objectionsRaised.length;

  // Prefer REAL live-scoring history (Phase 3). The transcript-eval number
  // remains a placeholder until the Phase 4 final evaluator. If no turns were
  // scored yet, fall back to observable-fact heuristics.
  const history = scoreState.history;
  const hasScores = history.length > 0;

  const liveAverage = hasScores
    ? clamp(history.reduce((sum, h) => sum + h.visibleOverall, 0) / history.length)
    : clamp(45 + memory.receptiveness * 0.2);

  const finalVisible = hasScores
    ? history[history.length - 1].visibleOverall
    : liveAverage;

  const transcriptEval = clamp(finalVisible + 4); // placeholder until Phase 4
  const overallFinal = clamp((finalVisible + transcriptEval) / 2);

  const categoryScores: Scores = hasScores
    ? history[history.length - 1].updatedMetrics
    : {
        discovery: clamp(INITIAL_SCORES.discovery + (memory.askedAboutProcess ? 15 : 0)),
        relevance: clamp(INITIAL_SCORES.relevance + memory.facts.length * 4),
        clarity: clamp(INITIAL_SCORES.clarity + (memory.receptiveness - 30) * 0.3),
        listening: clamp(INITIAL_SCORES.listening + memory.facts.length * 3),
        objectionHandling: clamp(
          INITIAL_SCORES.objectionHandling + handledCount * 12 - (raisedCount - handledCount) * 4,
        ),
        progression: clamp(INITIAL_SCORES.progression + STAGE_RANK[stage] * 6),
      };

  // Strengths / misses — deterministic from what actually happened.
  const strengths: string[] = [];
  if (memory.askedAboutProcess) strengths.push('Explored the current onboarding process.');
  if (memory.quantifiedValue) strengths.push('Worked to quantify the impact in real numbers.');
  if (handledCount >= 1) strengths.push('Made a genuine attempt to address an objection.');
  if (agreedToNextStep) strengths.push('Earned agreement for a product demo.');
  const strengthFiller = [
    'Kept the conversation customer-led.',
    'Opened with a question rather than a pitch.',
    'Stayed composed against a sceptical buyer.',
  ];

  const missed: string[] = [];
  if (!memory.askedAboutProcess) missed.push('Did not explore how the team trains reps today.');
  if (!memory.quantifiedValue) missed.push('Never quantified the cost of slow ramp-up.');
  if (handledCount < raisedCount) missed.push('Left at least one objection unresolved.');
  if (!agreedToNextStep) missed.push('Did not secure a clear next step (a demo).');
  const missedFiller = [
    'Could have referenced Rohan’s own words more directly.',
    'Did not explore the decision-making process or timeline.',
    'Spent little time mapping value to the stated problem.',
  ];

  // Strongest = the seller's first genuine question. Weakest = a distinct
  // message, preferring a pitch/claim; fall back to the longest that differs.
  const strongest =
    sellerTurns.find((t) => t.message.includes('?'))?.message ??
    sellerTurns[0]?.message ??
    null;
  const others = sellerTurns.filter((t) => t.message !== strongest);
  const weakest =
    others.find((t) => analyzeSeller(t.message).isPitch)?.message ??
    [...others].sort((a, b) => b.message.length - a.message.length)[0]?.message ??
    null;

  const objections: ReportObjection[] = objectionsRaised.map((key) => ({
    key,
    label: OBJECTIONS[key],
    handled: memory.addressedObjections.includes(key),
  }));

  return {
    placeholder: true,
    demoMode: state.demoMode,
    overallFinal,
    liveAverage,
    transcriptEval,
    categoryScores,
    stageReached: stage,
    strengths: padDistinct(strengths, strengthFiller, 3),
    missedOpportunities: padDistinct(missed, missedFiller, 3),
    strongestStatement: strongest,
    weakestStatement: weakest,
    betterResponse:
      'Tie value directly to Rohan’s stated pain: “You said managers lose hours to mock calls — reps can run unlimited practice here with no manager in the room.”',
    objections,
    recommendedPractice:
      'Re-run this call and end every problem statement with a quantification question (hours, dollars, or ramp weeks) plus a concrete next step.',
    coachingSummary: agreedToNextStep
      ? 'Strong close — you earned the demo. Tighten discovery so value-mapping lands even faster next time.'
      : 'Solid instincts, but the call stalled before a commitment. Focus on quantifying impact and proposing a clear next step.',
  };
}
