import { describe, it, expect } from 'vitest';
import { DemoRealTimeEvaluatorProvider } from './DemoRealTimeEvaluatorProvider';
import { safeFallbackResult } from './validate';
import type { EvaluationContext } from './types';

// Guards the Repair Phase 3 dead-data decisions:
//   - turn_quality was removed (it drove no scoring and was a second, unowned
//     number).
//   - asked_closed_question is RETAINED because it is real evidence used by the
//     final analysis, so it must still be produced.

function ctx(): EvaluationContext {
  return {
    sellerMessage: 'Do you currently run manager-led mock calls?', // a closed question
    latestCustomerStatement: null,
    transcript: [],
    stage: 'discovery',
    objectionsRaised: [],
    previousSellerMessages: [],
  };
}

describe('dead-data decisions', () => {
  it('the evaluator result no longer carries a turn_quality field', async () => {
    const result = await new DemoRealTimeEvaluatorProvider().evaluate(ctx());
    expect('turn_quality' in result).toBe(false);
    expect('turn_quality' in safeFallbackResult('discovery')).toBe(false);
  });

  it('still detects asked_closed_question, because the final analysis uses it', async () => {
    const result = await new DemoRealTimeEvaluatorProvider().evaluate(ctx());
    expect(result.signals.asked_closed_question).toBe(true);
  });
});
