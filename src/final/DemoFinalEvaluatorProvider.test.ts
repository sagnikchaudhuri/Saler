import { describe, it, expect } from 'vitest';
import { DemoFinalEvaluatorProvider } from './DemoFinalEvaluatorProvider';
import { LLMFinalEvaluatorProvider, FinalEvaluatorUnavailableError } from './LLMFinalEvaluatorProvider';
import { createFinalEvaluatorProvider } from './provider';
import { validateFinalReport } from './validate';
import { overallFromCategories } from './analyze';
import { emptySignals } from '../evaluation/validate';
import { OBJECTIONS } from '../conversation/types';
import type { ObjectionKey } from '../conversation/types';
import type { EvaluatorSignals } from '../types';
import type { ScoreHistoryEntry } from '../scoring/types';
import type { FinalEvaluationContext, FinalCategoryScores } from './types';

const evaluator = new DemoFinalEvaluatorProvider();

function entry(sellerTurn: number, signals: Partial<EvaluatorSignals>): ScoreHistoryEntry {
  const metrics = {
    discovery: 50, relevance: 50, clarity: 50,
    listening: 50, objectionHandling: 50, progression: 50,
  };
  return {
    sellerTurn,
    timestamp: sellerTurn,
    stage: 'discovery',
    previousMetrics: metrics,
    updatedMetrics: metrics,
    rawOverall: 50,
    visibleOverall: 50,
    momentum: 'Stable',
    signals: { ...emptySignals(), ...signals },
    briefFeedback: 'fb',
    recommendedNextMove: 'next',
    reasons: [],
  };
}

function ctx(over: Partial<FinalEvaluationContext> = {}): FinalEvaluationContext {
  const sellerMessages = over.sellerMessages ?? [];
  return {
    transcript: [],
    sellerMessages,
    scoreHistory: over.scoreHistory ?? [],
    objectionEvents: [],
    addressedObjections: [],
    finalStage: 'discovery',
    durationMs: 60_000,
    liveAverage: 50,
    agreedToNextStep: false,
    sellerTurnCount: sellerMessages.length,
    ...over,
  };
}

function refsFor(c: FinalEvaluationContext) {
  return {
    sellerMessages: new Set(c.sellerMessages),
    raisedObjectionLabels: new Set(c.objectionEvents.map((e) => OBJECTIONS[e.key])),
  };
}

describe('DemoFinalEvaluatorProvider — schema & completeness', () => {
  it('returns a valid report for a complete multi-turn call', async () => {
    const c = ctx({
      sellerMessages: [
        'How are you currently training new reps?',
        'How many hours per week do managers spend on that?',
        'You mentioned managers lose time — that is the core issue.',
      ],
      scoreHistory: [
        entry(1, { asked_open_question: true, explored_current_process: true }),
        entry(2, { quantified_impact: true, identified_pain: true }),
        entry(3, { referenced_customer_context: true }),
      ],
      finalStage: 'impact',
    });
    const r = await evaluator.evaluate(c);
    expect(validateFinalReport(r, refsFor(c)).ok).toBe(true);
    expect(r.strengths).toHaveLength(3);
    expect(r.missed_opportunities).toHaveLength(3);
    expect(r.overall_score).toBeGreaterThanOrEqual(0);
    expect(r.overall_score).toBeLessThanOrEqual(100);
  });

  it('is deterministic — same context yields an identical report', async () => {
    const c = ctx({
      sellerMessages: ['How do you train reps today?'],
      scoreHistory: [entry(1, { asked_open_question: true })],
    });
    expect(await evaluator.evaluate(c)).toEqual(await evaluator.evaluate(c));
  });
});

describe('DemoFinalEvaluatorProvider — short calls', () => {
  it('handles a call with no seller turns without inventing statements', async () => {
    const c = ctx({ sellerMessages: [], scoreHistory: [] });
    const r = await evaluator.evaluate(c);
    expect(validateFinalReport(r, refsFor(c)).ok).toBe(true);
    expect(r.strongest_statement).toBe('');
    expect(r.weakest_statement).toBe('');
    expect(r.summary).toMatch(/not enough evidence|no seller turns/i);
  });

  it('uses the single statement as strongest and leaves weakest empty', async () => {
    const only = 'How do you onboard new reps today?';
    const c = ctx({
      sellerMessages: [only],
      scoreHistory: [entry(1, { asked_open_question: true, explored_current_process: true })],
    });
    const r = await evaluator.evaluate(c);
    expect(r.strongest_statement).toBe(only);
    expect(r.weakest_statement).toBe('');
  });

  it('flags limited evidence in the summary for very short calls', async () => {
    const c = ctx({
      sellerMessages: ['How do you train reps?', 'What does that cost you?'],
      scoreHistory: [entry(1, { asked_open_question: true }), entry(2, { identified_pain: true })],
    });
    const r = await evaluator.evaluate(c);
    expect(r.summary).toMatch(/short call|limited/i);
  });
});

describe('DemoFinalEvaluatorProvider — objections', () => {
  it('returns no objection results when none were raised', async () => {
    const c = ctx({
      sellerMessages: ['How do you train reps?'],
      scoreHistory: [entry(1, { asked_open_question: true })],
    });
    const r = await evaluator.evaluate(c);
    expect(r.objection_results).toHaveLength(0);
  });

  it('marks an objection handled when answered and acknowledged', async () => {
    const c = ctx({
      sellerMessages: ['pitch', 'That makes sense. Unlike a chatbot, it is trained on your scenarios.'],
      scoreHistory: [
        entry(1, {}),
        entry(2, { acknowledged_objection: true, answered_objection: true }),
      ],
      objectionEvents: [{ key: 'generic_chatbot' as ObjectionKey, turnRaised: 1 }],
      addressedObjections: ['generic_chatbot' as ObjectionKey],
    });
    const r = await evaluator.evaluate(c);
    expect(r.objection_results).toHaveLength(1);
    expect(r.objection_results[0].objection).toBe(OBJECTIONS.generic_chatbot);
    expect(r.objection_results[0].handled).toBe(true);
  });

  it('marks an objection not handled when never answered', async () => {
    const c = ctx({
      sellerMessages: ['pitch', 'Anyway, let me tell you about our pricing tiers.'],
      scoreHistory: [entry(1, {}), entry(2, { ignored_customer_statement: true })],
      objectionEvents: [{ key: 'sensitive_info' as ObjectionKey, turnRaised: 1 }],
      addressedObjections: [],
    });
    const r = await evaluator.evaluate(c);
    expect(r.objection_results[0].handled).toBe(false);
    expect(r.objection_results[0].explanation).toMatch(/not handled|unanswered/i);
  });

  it('reports every objection actually raised and never invents others', async () => {
    const c = ctx({
      sellerMessages: ['a', 'b', 'c'],
      scoreHistory: [entry(1, {}), entry(2, { answered_objection: true, acknowledged_objection: true }), entry(3, {})],
      objectionEvents: [
        { key: 'generic_chatbot' as ObjectionKey, turnRaised: 1 },
        { key: 'sensitive_info' as ObjectionKey, turnRaised: 2 },
      ],
      addressedObjections: ['generic_chatbot' as ObjectionKey],
    });
    const r = await evaluator.evaluate(c);
    expect(r.objection_results).toHaveLength(2);
    const labels = r.objection_results.map((o) => o.objection);
    expect(labels).toContain(OBJECTIONS.generic_chatbot);
    expect(labels).toContain(OBJECTIONS.sensitive_info);
    expect(validateFinalReport(r, refsFor(c)).ok).toBe(true);
  });
});

describe('DemoFinalEvaluatorProvider — statement selection', () => {
  it('picks a high-value discovery/impact turn as strongest', async () => {
    const strong = 'How many hours per week does that cost your managers?';
    const c = ctx({
      sellerMessages: ['Hi there.', strong],
      scoreHistory: [entry(1, {}), entry(2, { quantified_impact: true, identified_pain: true })],
    });
    const r = await evaluator.evaluate(c);
    expect(r.strongest_statement).toBe(strong);
  });

  it('picks an unsupported claim as weakest', async () => {
    const weak = 'We guarantee a 40% revenue increase.';
    const c = ctx({
      sellerMessages: ['How do you train reps today?', weak],
      scoreHistory: [
        entry(1, { asked_open_question: true, explored_current_process: true }),
        entry(2, { made_unsupported_claim: true }),
      ],
    });
    const r = await evaluator.evaluate(c);
    expect(r.weakest_statement).toBe(weak);
    expect(r.better_response).toMatch(/guarantee|discovered fact/i);
  });

  it('never uses the same statement for strongest and weakest', async () => {
    const c = ctx({
      sellerMessages: ['How do you train reps?', 'We guarantee 40% more revenue.'],
      scoreHistory: [
        entry(1, { asked_open_question: true }),
        entry(2, { made_unsupported_claim: true }),
      ],
    });
    const r = await evaluator.evaluate(c);
    expect(r.strongest_statement).not.toBe(r.weakest_statement);
  });

  it('only ever selects real seller statements', async () => {
    const c = ctx({
      sellerMessages: ['alpha question?', 'beta claim'],
      scoreHistory: [entry(1, { asked_open_question: true }), entry(2, { was_too_long: true })],
    });
    const r = await evaluator.evaluate(c);
    for (const s of [r.strongest_statement, r.weakest_statement]) {
      if (s !== '') expect(c.sellerMessages).toContain(s);
    }
  });
});

describe('DemoFinalEvaluatorProvider — coaching content', () => {
  it('lists genuinely missed discovery areas and omits covered ones', async () => {
    const c = ctx({
      sellerMessages: ['How are reps onboarded and trained today?'],
      scoreHistory: [entry(1, { explored_current_process: true, asked_open_question: true })],
    });
    const r = await evaluator.evaluate(c);
    // Current process WAS covered, so it must not be suggested.
    expect(r.missed_discovery_questions.join(' ')).not.toMatch(/onboarded and trained today/i);
    // Impact was not covered, so it should be suggested.
    expect(r.missed_discovery_questions.join(' ')).toMatch(/cost you/i);
  });

  it('recommends practice aimed at the weakest area', async () => {
    // Strong discovery, nothing else → closing should be weakest.
    const c = ctx({
      sellerMessages: ['How are reps trained today?', 'How many hours does that cost?'],
      scoreHistory: [
        entry(1, { asked_open_question: true, explored_current_process: true }),
        entry(2, { quantified_impact: true, identified_pain: true, explored_timeline: true }),
      ],
    });
    const r = await evaluator.evaluate(c);
    expect(r.recommended_practice).toMatch(/next step|stakeholder|close/i);
  });
});

describe('final overall score calculation', () => {
  const cats = (v: number): FinalCategoryScores => ({
    opening_and_confidence: v, discovery_questions: v, problem_identification: v,
    value_articulation: v, objection_handling: v, clarity_and_conciseness: v,
    closing_and_next_step: v,
  });

  it('is a weighted blend that respects the bounds', () => {
    expect(overallFromCategories(cats(100), true)).toBe(100);
    expect(overallFromCategories(cats(0), true)).toBe(0);
    expect(overallFromCategories(cats(60), true)).toBe(60);
  });

  it('redistributes objection weight when no objection was raised', () => {
    // With objection_handling at 0 but excluded, the overall must equal the
    // others rather than being dragged down.
    const skewed = { ...cats(70), objection_handling: 0 };
    expect(overallFromCategories(skewed, false)).toBe(70);
    expect(overallFromCategories(skewed, true)).toBeLessThan(70);
  });
});

describe('final evaluator providers', () => {
  it('the LLM final evaluator is disabled and throws when called', async () => {
    const llm = new LLMFinalEvaluatorProvider();
    expect(llm.isAvailable()).toBe(false);
    await expect(llm.evaluate(ctx())).rejects.toBeInstanceOf(FinalEvaluatorUnavailableError);
  });

  it('the factory falls back to the deterministic evaluator', () => {
    const { provider, demoMode } = createFinalEvaluatorProvider();
    expect(demoMode).toBe(true);
    expect(provider.getName()).toMatch(/demo/i);
  });

  it('the factory selects the LLM evaluator only when enabled with an endpoint', () => {
    const { demoMode } = createFinalEvaluatorProvider({ llmEnabled: true, llmEndpoint: '/api/final' });
    expect(demoMode).toBe(false);
  });
});
