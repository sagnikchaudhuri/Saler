import { describe, it, expect, vi } from 'vitest';
import { LLMFinalEvaluatorProvider, FinalEvaluatorUnavailableError } from './LLMFinalEvaluatorProvider';
import { DemoFinalEvaluatorProvider } from './DemoFinalEvaluatorProvider';
import { FallbackFinalEvaluatorProvider } from '../ai/fallback';
import { emptySignals } from '../evaluation/validate';
import type { ScoreHistoryEntry } from '../scoring/types';
import type { EvaluatorSignals } from '../types';
import type { FinalEvaluationContext } from './types';

// ============================================================================
// Deterministic final-score authority (audit Repair Phase 2, §3/§5).
//
// The AI final evaluator supplies NARRATIVE ONLY. This provider recomputes
// every number locally, so no model output can move a score. These tests drive
// the client provider with mocked route responses — no network, no paid calls.
// ============================================================================

function entry(signals: Partial<EvaluatorSignals>): ScoreHistoryEntry {
  const m = { discovery: 55, relevance: 55, clarity: 55, listening: 55, objectionHandling: 50, progression: 55 };
  return {
    sellerTurn: 1, timestamp: 1, stage: 'discovery', previousMetrics: m, updatedMetrics: m,
    rawOverall: 55, visibleOverall: 55, momentum: 'Stable',
    signals: { ...emptySignals(), ...signals }, briefFeedback: '', recommendedNextMove: '', reasons: [],
  };
}

const SELLER = [
  'How are new reps onboarded and trained today?',
  'How many hours a week does that cost managers, and what is the impact on quota?',
];

function ctx(): FinalEvaluationContext {
  return {
    transcript: SELLER.map((message, i) => ({ id: `s${i}`, speaker: 'seller' as const, message, stage: 'discovery' as const, timestamp: i })),
    sellerMessages: SELLER,
    scoreHistory: [
      entry({ asked_open_question: true, explored_current_process: true }),
      entry({ quantified_impact: true, identified_pain: true }),
    ],
    objectionEvents: [],
    addressedObjections: [],
    finalStage: 'impact',
    durationMs: 60_000,
    liveAverage: 55,
    agreedToNextStep: false,
    sellerTurnCount: 2,
  };
}

const NARRATIVE = {
  strengths: ['Explored the current process.'],
  missed_opportunities: ['No next step.', 'No decision-maker.', 'No timeline.'],
  strongest_statement: SELLER[1],
  weakest_statement: '',
  better_response: 'Propose a concrete next step.',
  missed_discovery_questions: ['Who signs off on a decision like this?'],
  recommended_practice: 'Practice closing with a next step.',
  summary: 'Strong discovery, no close.',
};

function providerReturning(payload: unknown, ok = true) {
  const fetchImpl = vi.fn().mockResolvedValue({
    ok,
    json: async () => payload,
  }) as unknown as typeof fetch;
  return new LLMFinalEvaluatorProvider({ enabled: true, endpoint: '/api/evaluate-final', fetchImpl });
}

/** The deterministic score for this ctx, computed by the Demo evaluator. */
async function deterministicScore(): Promise<number> {
  const r = await new DemoFinalEvaluatorProvider().evaluate(ctx());
  return r.overall_score;
}

describe('AI final evaluator — deterministic score authority', () => {
  it('uses the AI narrative but computes the score locally', async () => {
    const report = await providerReturning(NARRATIVE).evaluate(ctx());
    expect(report.summary).toBe('Strong discovery, no close.'); // AI narrative used
    expect(report.overall_score).toBe(await deterministicScore()); // score is local
  });

  it('ignores a model-supplied overall_score of 100 (rejects the payload)', async () => {
    // A narrative that smuggles a score is rejected → falls back, never 100.
    await expect(
      providerReturning({ ...NARRATIVE, overall_score: 100 }).evaluate(ctx()),
    ).rejects.toBeInstanceOf(FinalEvaluatorUnavailableError);
  });

  it('rejects model-supplied category scores', async () => {
    await expect(
      providerReturning({ ...NARRATIVE, category_scores: { discovery_questions: 100 } }).evaluate(ctx()),
    ).rejects.toBeInstanceOf(FinalEvaluatorUnavailableError);
  });

  it('always produces the deterministic category scores', async () => {
    const report = await providerReturning(NARRATIVE).evaluate(ctx());
    const demo = await new DemoFinalEvaluatorProvider().evaluate(ctx());
    expect(report.category_scores).toEqual(demo.category_scores);
  });

  it('lets different narratives enrich the report without changing the score', async () => {
    const a = await providerReturning({ ...NARRATIVE, summary: 'Version A.' }).evaluate(ctx());
    const b = await providerReturning({ ...NARRATIVE, summary: 'Version B.' }).evaluate(ctx());
    expect(a.summary).not.toBe(b.summary);
    expect(a.overall_score).toBe(b.overall_score);
  });

  it('rejects an invented objection in the narrative', async () => {
    await expect(
      providerReturning({ ...NARRATIVE, objection_results: [{ objection: 'x', handled: true, explanation: 'e' }] }).evaluate(ctx()),
    ).rejects.toBeInstanceOf(FinalEvaluatorUnavailableError);
  });

  it('falls back to the deterministic report when the AI final fails', async () => {
    const chain = new FallbackFinalEvaluatorProvider(
      providerReturning({ ...NARRATIVE, overall_score: 100 }),
      new DemoFinalEvaluatorProvider(),
    );
    const report = await chain.evaluate(ctx());
    expect(report.overall_score).toBe(await deterministicScore());
    expect(chain.tracker.summary()).toBe('demo');
  });
});
