import { describe, it, expect } from 'vitest';
import { validateAiNarrative } from './validate';

const SELLER = ['How do you currently train new reps?', 'What does slow ramp-up cost you?'];
const refs = { sellerMessages: new Set(SELLER), raisedObjectionLabels: new Set<string>() };

function base(over: Record<string, unknown> = {}) {
  return {
    strengths: ['Asked about the current process.'],
    missed_opportunities: ['Did not quantify impact.', 'No next step.', 'No decision-maker.'],
    strongest_statement: SELLER[0],
    weakest_statement: '',
    better_response: 'Try quantifying the impact before pitching.',
    missed_discovery_questions: ['What timeline are you targeting?'],
    recommended_practice: 'Practice quantifying impact.',
    summary: 'A solid opening question, thin on impact.',
    ...over,
  };
}

describe('validateAiNarrative — grounding', () => {
  it('accepts a clean, grounded narrative', () => {
    expect(validateAiNarrative(base(), refs).ok).toBe(true);
  });

  it('rejects any score field outright', () => {
    expect(validateAiNarrative(base({ overall_score: 100 }), refs).ok).toBe(false);
    expect(validateAiNarrative(base({ category_scores: {} }), refs).ok).toBe(false);
    expect(validateAiNarrative(base({ objection_results: [] }), refs).ok).toBe(false);
  });

  it('rejects an invented strongest quote', () => {
    expect(validateAiNarrative(base({ strongest_statement: 'I never said this.' }), refs).ok).toBe(false);
  });

  it('accepts an empty strongest quote', () => {
    expect(validateAiNarrative(base({ strongest_statement: '' }), refs).ok).toBe(true);
  });

  it('rejects a transcript-absent percentage', () => {
    expect(validateAiNarrative(base({ summary: 'You improved conversion by 40%.' }), refs).ok).toBe(false);
  });

  it('rejects an invented team size', () => {
    expect(validateAiNarrative(base({ summary: 'You never asked about their 150 reps.' }), refs).ok).toBe(false);
    expect(
      validateAiNarrative(base({ strengths: ['Engaged all 25 employees well.'] }), refs).ok,
    ).toBe(false);
  });

  it('rejects invented pricing and dates', () => {
    expect(validateAiNarrative(base({ summary: 'You quoted $500 too early.' }), refs).ok).toBe(false);
    expect(validateAiNarrative(base({ summary: 'This felt like a 2021 pitch.' }), refs).ok).toBe(false);
  });

  it('rejects an overlong narrative field', () => {
    expect(validateAiNarrative(base({ summary: 'x'.repeat(700) }), refs).ok).toBe(false);
  });

  it('rejects markdown / HTML payloads', () => {
    expect(validateAiNarrative(base({ summary: 'Nice **work** on discovery.' }), refs).ok).toBe(false);
    expect(validateAiNarrative(base({ summary: 'See <script>alert(1)</script>.' }), refs).ok).toBe(false);
  });

  it('rejects control characters', () => {
    expect(validateAiNarrative(base({ summary: 'line onebell' }), refs).ok).toBe(false);
  });

  it('drops a missed question that was already asked (near-duplicate)', () => {
    const r = validateAiNarrative(
      base({ missed_discovery_questions: ['How do you currently train your new reps?', 'What is your budget?'] }),
      refs,
    );
    expect(r.ok).toBe(true);
    // The "train reps" question overlaps an asked one and is removed; the budget
    // question survives.
    expect(r.value!.missed_discovery_questions).toEqual(['What is your budget?']);
  });

  it('de-duplicates near-identical missed questions against each other', () => {
    const r = validateAiNarrative(
      base({ missed_discovery_questions: ['What is your timeline?', 'What is your timeline for this?'] }),
      refs,
    );
    expect(r.ok).toBe(true);
    expect(r.value!.missed_discovery_questions.length).toBe(1);
  });

  it('allows an example numeral in a suggested better_response', () => {
    // better_response is a suggestion, not a factual claim about the customer.
    expect(
      validateAiNarrative(base({ better_response: 'Suggest a 20-minute demo next week.' }), refs).ok,
    ).toBe(true);
  });

  it('requires exactly three missed opportunities', () => {
    expect(validateAiNarrative(base({ missed_opportunities: ['only', 'two'] }), refs).ok).toBe(false);
  });

  it('allows zero strengths', () => {
    const r = validateAiNarrative(base({ strengths: [] }), refs);
    expect(r.ok).toBe(true);
    expect(r.value!.strengths).toEqual([]);
  });
});
