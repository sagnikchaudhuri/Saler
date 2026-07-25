import { describe, it, expect } from 'vitest';
import { validateEvaluatorResult, safeFallbackResult, emptySignals } from './validate';
import { DemoRealTimeEvaluatorProvider } from './DemoRealTimeEvaluatorProvider';
import { LLMRealTimeEvaluatorProvider } from './LLMRealTimeEvaluatorProvider';
import { createEvaluatorProvider } from './provider';
import { EvaluatorUnavailableError } from './errors';
import type { EvaluationContext } from './types';

function validResult() {
  return {
    signals: emptySignals(),
    brief_feedback: 'ok',
    recommended_next_move: 'continue',
    detected_stage: 'discovery',
  };
}

describe('validateEvaluatorResult', () => {
  it('accepts a well-formed result', () => {
    expect(validateEvaluatorResult(validResult()).ok).toBe(true);
  });

  it('rejects non-objects and null', () => {
    expect(validateEvaluatorResult(null).ok).toBe(false);
    expect(validateEvaluatorResult('nope').ok).toBe(false);
  });

  it('rejects missing or non-boolean signals', () => {
    const bad = { ...validResult(), signals: { ...emptySignals(), asked_open_question: 'yes' } };
    expect(validateEvaluatorResult(bad).ok).toBe(false);
  });

  it('no longer treats turn_quality as a validated score field', () => {
    // The schema dropped turn_quality; scoring reads only `signals`. A result
    // without it is valid, and a stray value can never gate validation.
    expect(validateEvaluatorResult(validResult()).ok).toBe(true);
    expect(validateEvaluatorResult({ ...validResult(), turn_quality: 140 }).ok).toBe(true);
  });

  it('rejects an invalid stage', () => {
    expect(validateEvaluatorResult({ ...validResult(), detected_stage: 'closing' }).ok).toBe(false);
  });
});

describe('safeFallbackResult', () => {
  it('is itself valid and applies no signals', () => {
    const fb = safeFallbackResult('impact');
    expect(validateEvaluatorResult(fb).ok).toBe(true);
    expect(Object.values(fb.signals).every((v) => v === false)).toBe(true);
    expect(fb.detected_stage).toBe('impact');
  });
});

describe('evaluator providers', () => {
  it('Demo evaluator is available and returns a valid result', async () => {
    const ev = new DemoRealTimeEvaluatorProvider();
    expect(ev.isAvailable()).toBe(true);
    const ctx: EvaluationContext = {
      sellerMessage: 'How do you train reps today?',
      latestCustomerStatement: null,
      transcript: [],
      stage: 'opening',
      objectionsRaised: [],
      previousSellerMessages: [],
    };
    const res = await ev.evaluate(ctx);
    expect(validateEvaluatorResult(res).ok).toBe(true);
  });

  it('LLM evaluator is disabled by default and throws when called', async () => {
    const ev = new LLMRealTimeEvaluatorProvider();
    expect(ev.isAvailable()).toBe(false);
    await expect(
      ev.evaluate({
        sellerMessage: 'x', latestCustomerStatement: null, transcript: [],
        stage: 'opening', objectionsRaised: [], previousSellerMessages: [],
      }),
    ).rejects.toBeInstanceOf(EvaluatorUnavailableError);
  });

  it('factory falls back to the Demo evaluator', () => {
    const { provider, demoMode } = createEvaluatorProvider();
    expect(demoMode).toBe(true);
    expect(provider.getName()).toMatch(/demo/i);
  });

  it('factory selects the LLM evaluator only when enabled and endpoint set', () => {
    const { demoMode } = createEvaluatorProvider({ llmEnabled: true, llmEndpoint: '/api/eval' });
    expect(demoMode).toBe(false);
  });
});
