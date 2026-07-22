import { describe, it, expect } from 'vitest';
import { detectSignals } from './detect';
import type { EvaluationContext } from './types';
import type { ObjectionKey } from '../conversation/types';

function ctx(
  sellerMessage: string,
  overrides: Partial<EvaluationContext> = {},
): EvaluationContext {
  return {
    sellerMessage,
    latestCustomerStatement: null,
    transcript: [],
    stage: 'discovery',
    objectionsRaised: [],
    previousSellerMessages: [],
    ...overrides,
  };
}

describe('detectSignals — discovery & questions', () => {
  it('recognises an open discovery question', () => {
    const s = detectSignals(ctx('How are you currently training new sales representatives?'));
    expect(s.asked_open_question).toBe(true);
    expect(s.asked_closed_question).toBe(false);
    expect(s.explored_current_process).toBe(true);
  });

  it('recognises a closed question', () => {
    const s = detectSignals(ctx('Do you use recorded call reviews today?'));
    expect(s.asked_closed_question).toBe(true);
    expect(s.asked_open_question).toBe(false);
  });

  it('recognises pain identification in an impact question', () => {
    const s = detectSignals(ctx('What effect does the slow ramp-up have on quota attainment?'));
    expect(s.identified_pain).toBe(true);
    expect(s.asked_open_question).toBe(true);
  });

  it('recognises quantified impact only with real numbers', () => {
    const withNumber = detectSignals(ctx('How many hours per week do managers spend on mock calls?'));
    expect(withNumber.quantified_impact).toBe(true);
    const withoutNumber = detectSignals(ctx('What effect does the slow ramp-up have on quota attainment?'));
    expect(withoutNumber.quantified_impact).toBe(false);
  });

  it('recognises decision-process and timeline exploration', () => {
    expect(detectSignals(ctx('Who else is involved in the buying decision?')).explored_decision_process).toBe(true);
    expect(detectSignals(ctx('When do you need this in place by?')).explored_timeline).toBe(true);
  });
});

describe('detectSignals — context & objections', () => {
  it('recognises a context reference', () => {
    const s = detectSignals(ctx('You mentioned that managers already conduct mock calls.'));
    expect(s.referenced_customer_context).toBe(true);
  });

  const withObjection: Partial<EvaluationContext> = {
    objectionsRaised: ['generic_chatbot'] as ObjectionKey[],
    latestCustomerStatement: 'How is this different from a generic AI chatbot?',
  };

  it('recognises objection acknowledgement', () => {
    const s = detectSignals(ctx('That makes sense — you already invest manager time in practice.', withObjection));
    expect(s.acknowledged_objection).toBe(true);
  });

  it('recognises objection clarification', () => {
    const s = detectSignals(ctx('Is your concern mainly around data storage or access control?', {
      objectionsRaised: ['sensitive_info'] as ObjectionKey[],
      latestCustomerStatement: 'Our conversations contain sensitive information.',
    }));
    expect(s.clarified_objection).toBe(true);
  });

  it('recognises an answered objection', () => {
    const s = detectSignals(ctx(
      'Unlike a generic chatbot, this simulates your real buyer persona because it is trained on your scenarios.',
      withObjection,
    ));
    expect(s.answered_objection).toBe(true);
  });

  it('does not fire objection signals when no objection exists', () => {
    const s = detectSignals(ctx('That makes sense.'));
    expect(s.acknowledged_objection).toBe(false);
  });
});

describe('detectSignals — next step, pitching, claims', () => {
  it('recognises a proposed next step', () => {
    const s = detectSignals(ctx('Would it make sense to schedule a demonstration with your enablement team?'));
    expect(s.proposed_next_step).toBe(true);
  });

  it('recognises an early pitch', () => {
    const s = detectSignals(ctx('Our AI platform will immediately improve your sales performance.', {
      stage: 'opening',
      previousSellerMessages: [],
    }));
    expect(s.pitched_too_early).toBe(true);
    expect(s.made_unsupported_claim).toBe(false);
  });

  it('does not flag a pitch as early once discovery has happened', () => {
    const s = detectSignals(ctx('Our platform improves your sales onboarding.', {
      stage: 'value_mapping',
      previousSellerMessages: ['How do you currently onboard new reps?'],
    }));
    expect(s.pitched_too_early).toBe(false);
  });

  it('recognises an unsupported claim', () => {
    const s = detectSignals(ctx('We guarantee a 40% revenue increase.', {
      stage: 'value_mapping',
    }));
    expect(s.made_unsupported_claim).toBe(true);
  });
});

describe('detectSignals — length & repetition', () => {
  it('recognises excessive length', () => {
    const long = Array(90).fill('word').join(' ');
    expect(detectSignals(ctx(long)).was_too_long).toBe(true);
  });

  it('does not flag a concise turn as too long', () => {
    expect(detectSignals(ctx('How do you onboard reps?')).was_too_long).toBe(false);
  });

  it('recognises repetition of a near-identical earlier question', () => {
    const s = detectSignals(ctx('How are you currently training your new sales reps?', {
      previousSellerMessages: ['How are you currently training your new sales representatives?'],
    }));
    expect(s.was_repetitive).toBe(true);
  });
});

describe('detectSignals — ignoring the customer', () => {
  it('flags ignoring a customer question that shares no content', () => {
    const s = detectSignals(ctx('Let me tell you about pricing tiers and packaging options.', {
      latestCustomerStatement: 'Where does our sensitive customer data end up?',
      objectionsRaised: ['sensitive_info'] as ObjectionKey[],
    }));
    expect(s.ignored_customer_statement).toBe(true);
  });
});
