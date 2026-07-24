import { describe, it, expect } from 'vitest';
import { validateFinalReport, safeFinalFallback } from './validate';
import { OBJECTIONS } from '../conversation/types';
import type { ObjectionKey } from '../conversation/types';
import type { FinalEvaluationContext, FinalReport } from './types';

function baseCtx(over: Partial<FinalEvaluationContext> = {}): FinalEvaluationContext {
  return {
    transcript: [],
    sellerMessages: ['How do you train reps today?'],
    scoreHistory: [],
    objectionEvents: [],
    addressedObjections: [],
    finalStage: 'discovery',
    durationMs: 1000,
    liveAverage: 52,
    agreedToNextStep: false,
    sellerTurnCount: 1,
    ...over,
  };
}

function validReport(): FinalReport {
  return {
    overall_score: 60,
    category_scores: {
      opening_and_confidence: 60, discovery_questions: 60, problem_identification: 60,
      value_articulation: 60, objection_handling: 60, clarity_and_conciseness: 60,
      closing_and_next_step: 60,
    },
    strengths: ['a', 'b', 'c'],
    missed_opportunities: ['x', 'y', 'z'],
    strongest_statement: '',
    weakest_statement: '',
    better_response: 'better',
    missed_discovery_questions: ['q'],
    objection_results: [],
    recommended_practice: 'practice',
    summary: 'summary',
  };
}

describe('validateFinalReport — shape rules', () => {
  it('accepts a well-formed report', () => {
    expect(validateFinalReport(validReport()).ok).toBe(true);
  });

  it('rejects non-objects', () => {
    expect(validateFinalReport(null).ok).toBe(false);
    expect(validateFinalReport('nope').ok).toBe(false);
  });

  it('rejects out-of-range scores', () => {
    expect(validateFinalReport({ ...validReport(), overall_score: 140 }).ok).toBe(false);
    const bad = validReport();
    bad.category_scores.discovery_questions = -5;
    expect(validateFinalReport(bad).ok).toBe(false);
  });

  it('allows zero to three strengths but rejects more than three', () => {
    // Strengths are evidence-based and may be empty; padding with filler is the
    // bug this replaces. Two is fine; four is not.
    expect(validateFinalReport({ ...validReport(), strengths: [] }).ok).toBe(true);
    expect(validateFinalReport({ ...validReport(), strengths: ['a', 'b'] }).ok).toBe(true);
    expect(validateFinalReport({ ...validReport(), strengths: ['a', 'b', 'c', 'd'] }).ok).toBe(false);
  });

  it('still requires exactly three missed opportunities', () => {
    expect(validateFinalReport({ ...validReport(), missed_opportunities: ['a', 'b'] }).ok).toBe(false);
    expect(validateFinalReport({ ...validReport(), missed_opportunities: ['a', 'b', 'c', 'd'] }).ok).toBe(false);
  });

  it('rejects malformed objection results', () => {
    const bad = { ...validReport(), objection_results: [{ objection: 'x', handled: 'yes', explanation: 'e' }] };
    expect(validateFinalReport(bad).ok).toBe(false);
  });
});

describe('validateFinalReport — semantic rules', () => {
  const refs = {
    sellerMessages: new Set(['How do you train reps today?']),
    raisedObjectionLabels: new Set([OBJECTIONS.generic_chatbot]),
  };

  it('accepts statements that exist in the transcript', () => {
    const r = { ...validReport(), strongest_statement: 'How do you train reps today?' };
    expect(validateFinalReport(r, refs).ok).toBe(true);
  });

  it('rejects an invented strongest statement', () => {
    const r = { ...validReport(), strongest_statement: 'I never said this.' };
    const res = validateFinalReport(r, refs);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not a real seller statement/i);
  });

  it('rejects objections that were never raised', () => {
    const r = {
      ...validReport(),
      objection_results: [{ objection: OBJECTIONS.adoption, handled: false, explanation: 'e' }],
    };
    const res = validateFinalReport(r, refs);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/never raised/i);
  });
});

describe('safeFinalFallback', () => {
  it('produces a valid report grounded in the live average', () => {
    const ctx = baseCtx({ liveAverage: 47 });
    const fb = safeFinalFallback(ctx);
    expect(validateFinalReport(fb).ok).toBe(true);
    expect(fb.overall_score).toBe(47);
  });

  it('never invents statements or objections', () => {
    const ctx = baseCtx({
      objectionEvents: [{ key: 'generic_chatbot' as ObjectionKey, turnRaised: 1 }],
      addressedObjections: ['generic_chatbot' as ObjectionKey],
    });
    const fb = safeFinalFallback(ctx);
    expect(ctx.sellerMessages).toContain(fb.strongest_statement);
    expect(fb.weakest_statement).toBe('');
    expect(fb.objection_results).toHaveLength(1);
    expect(fb.objection_results[0].handled).toBe(true);
    expect(
      validateFinalReport(fb, {
        sellerMessages: new Set(ctx.sellerMessages),
        raisedObjectionLabels: new Set([OBJECTIONS.generic_chatbot]),
      }).ok,
    ).toBe(true);
  });

  it('handles an empty call without inventing a strongest statement', () => {
    const fb = safeFinalFallback(baseCtx({ sellerMessages: [], sellerTurnCount: 0 }));
    expect(fb.strongest_statement).toBe('');
    expect(validateFinalReport(fb).ok).toBe(true);
  });
});
