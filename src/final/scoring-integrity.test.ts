import { describe, it, expect } from 'vitest';
import { ConversationEngine } from '../conversation/engine';
import { DemoConversationProvider } from '../conversation/DemoConversationProvider';
import { DemoRealTimeEvaluatorProvider } from '../evaluation/DemoRealTimeEvaluatorProvider';
import { DemoFinalEvaluatorProvider } from './DemoFinalEvaluatorProvider';
import { evidenceLevel } from './analyze';
import { emptySignals } from '../evaluation/validate';
import type { ScoreHistoryEntry } from '../scoring/types';
import type { EvaluatorSignals } from '../types';

// ============================================================================
// Coaching integrity (audit Repair Phase 1, §4–§6): no fabricated strengths,
// merit-gated strongest moment, spam-resistant final score, evidence policy.
// Reports are produced end-to-end through the real engine so detection,
// scoring, and aggregation are all exercised together.
// ============================================================================

function makeEngine() {
  return new ConversationEngine(
    new DemoConversationProvider(0),
    { scenarioId: 'integrity', demoMode: true },
    new DemoRealTimeEvaluatorProvider(),
    new DemoFinalEvaluatorProvider(),
  );
}

async function runCall(messages: string[]) {
  const engine = makeEngine();
  engine.start();
  for (const m of messages) await engine.submitSeller(m);
  await engine.endCall();
  return engine.getState();
}

const STRONG_CONCISE = [
  'How are new reps onboarded and trained today?',
  'What is the single biggest bottleneck in that ramp-up process?',
  'How many months until a new rep hits full quota, and what does that cost you in lost revenue?',
  'Who signs off on a decision like this, and what timeline are you targeting?',
  'You mentioned managers lose hours — shall we set up a demo with two team leads next week?',
];

// Twenty near-identical questions: the farming attempt from the audit.
const REPETITIVE_SPAM = Array.from(
  { length: 20 },
  (_, i) => `How do you currently train your reps today? (${i})`,
);

describe('narrative grounding — no fabricated strengths', () => {
  it('a "?", "ok", "sure" call invents no strengths and no strongest moment', async () => {
    const s = await runCall(['?', 'ok', 'sure']);
    const r = s.finalReport!;
    expect(r.strengths).toEqual([]); // never padded with filler
    expect(r.strongest_statement).toBe(''); // "?" is not a strongest moment
  });

  it('never presents a punctuation-only turn as the strongest moment', async () => {
    const s = await runCall(['?', '...', '!!!', '???']);
    expect(s.finalReport!.strongest_statement).toBe('');
  });

  it('a call with no positive signal has an empty strongest statement', async () => {
    const s = await runCall(['ok', 'right', 'cool', 'sure']);
    expect(s.finalReport!.strongest_statement).toBe('');
    expect(s.finalReport!.strengths.length).toBe(0);
  });

  it('strengths stay within 0–3 and only reflect real behaviour', async () => {
    const s = await runCall(STRONG_CONCISE);
    const r = s.finalReport!;
    expect(r.strengths.length).toBeGreaterThan(0);
    expect(r.strengths.length).toBeLessThanOrEqual(3);
  });
});

describe('final scoring — spam cannot beat a concise strong call', () => {
  it('five concise strong turns outscore twenty repetitive turns', async () => {
    const strong = await runCall(STRONG_CONCISE);
    const spam = await runCall(REPETITIVE_SPAM);
    const strongScore = strong.finalReport!.overall_score;
    const spamScore = spam.finalReport!.overall_score;
    console.log(
      `[integrity] strongFinal=${strongScore} (live ${strong.liveAverage}) ` +
        `spamFinal=${spamScore} (live ${spam.liveAverage})`,
    );
    expect(strongScore).toBeGreaterThan(spamScore);
  });

  it('repetition lowers the final score versus the same idea said once', async () => {
    const once = await runCall(['How do you currently train your reps today?']);
    const many = await runCall(REPETITIVE_SPAM);
    expect(many.finalReport!.overall_score).toBeLessThanOrEqual(
      once.finalReport!.overall_score,
    );
  });

  it('one discovery occurrence does not create a discovery score of 100', async () => {
    const s = await runCall(['How are new reps onboarded and trained today?']);
    // A single (genuine) discovery turn earns partial coverage, never full marks.
    expect(s.finalReport!.category_scores.discovery_questions).toBeLessThan(100);
  });

  it('a repetitive call does not receive a high final score', async () => {
    const spam = await runCall(REPETITIVE_SPAM);
    expect(spam.finalReport!.overall_score).toBeLessThan(65);
  });

  it('strong discovery with a weak close is reflected in the categories', async () => {
    const s = await runCall([
      'How are new reps onboarded and trained today?',
      'How many hours a week do managers spend on that, and what does it cost?',
    ]);
    const c = s.finalReport!.category_scores;
    expect(c.discovery_questions).toBeGreaterThan(c.closing_and_next_step);
  });
});

describe('final scoring — divergence guard', () => {
  it('caps a collapsing repetitive call near its live average', async () => {
    const spam = await runCall(REPETITIVE_SPAM);
    const r = spam.finalReport!;
    // The final may not float far above what the live turns actually earned.
    expect(r.overall_score).toBeLessThanOrEqual(spam.liveAverage! + 8);
    expect(r.overall_score).toBeGreaterThanOrEqual(0);
  });
});

// --- evidence policy --------------------------------------------------------

function entry(signals: Partial<EvaluatorSignals>): ScoreHistoryEntry {
  const m = { discovery: 50, relevance: 50, clarity: 50, listening: 50, objectionHandling: 50, progression: 50 };
  return {
    sellerTurn: 1, timestamp: 1, stage: 'discovery', previousMetrics: m, updatedMetrics: m,
    rawOverall: 50, visibleOverall: 50, momentum: 'Stable',
    signals: { ...emptySignals(), ...signals }, briefFeedback: '', recommendedNextMove: '', reasons: [],
  };
}

describe('evidence policy', () => {
  it('a zero-turn call is not scored', () => {
    expect(evidenceLevel(0, [])).toBe('none');
  });

  it('a one- or two-turn call is limited', () => {
    expect(evidenceLevel(1, [entry({ asked_open_question: true })])).toBe('limited');
    expect(evidenceLevel(2, [entry({ identified_pain: true }), entry({})])).toBe('limited');
  });

  it('several trivial turns with no positive signal are limited, not sufficient', () => {
    expect(evidenceLevel(5, [entry({}), entry({}), entry({}), entry({}), entry({})])).toBe('limited');
  });

  it('a meaningful multi-turn call is sufficient', () => {
    expect(
      evidenceLevel(4, [
        entry({ asked_open_question: true }),
        entry({ identified_pain: true }),
        entry({ quantified_impact: true }),
        entry({ referenced_customer_context: true }),
      ]),
    ).toBe('sufficient');
  });

  it('a zero-turn engine call reports none and invents no precision', async () => {
    const s = await runCall([]);
    expect(evidenceLevel(s.completedSession!.sellerTurnCount, s.completedSession!.scoreHistory)).toBe('none');
    expect(s.finalReport!.strengths).toEqual([]);
    expect(s.finalReport!.strongest_statement).toBe('');
  });

  it('a trivial call is limited and carries no invented praise', async () => {
    const s = await runCall(['ok', 'sure', 'right']);
    expect(evidenceLevel(s.completedSession!.sellerTurnCount, s.completedSession!.scoreHistory)).toBe('limited');
    expect(s.finalReport!.strengths).toEqual([]);
  });
});
