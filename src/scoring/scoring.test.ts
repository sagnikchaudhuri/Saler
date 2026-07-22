import { describe, it, expect } from 'vitest';
import {
  applySignals,
  rawOverall,
  smoothVisible,
  rewardFactor,
  clamp,
  MAX_VISIBLE_MOVEMENT,
  PRE_OBJECTION_WEIGHTS,
  POST_OBJECTION_WEIGHTS,
} from './scoring';
import { emptySignals } from '../evaluation/validate';
import type { Scores, EvaluatorSignals } from '../types';

const BASE: Scores = {
  discovery: 40, relevance: 45, clarity: 50, listening: 45, objectionHandling: 40, progression: 40,
};

function withSignals(overrides: Partial<EvaluatorSignals>): EvaluatorSignals {
  return { ...emptySignals(), ...overrides };
}

describe('applySignals — positive updates', () => {
  it('rewards an open question with +5 discovery', () => {
    const { metrics, reasons } = applySignals(BASE, withSignals({ asked_open_question: true }), {});
    expect(metrics.discovery).toBe(45);
    expect(reasons.some((r) => r.metric === 'discovery' && r.delta === 5)).toBe(true);
  });

  it('rewards quantified impact across two metrics', () => {
    const { metrics } = applySignals(BASE, withSignals({ quantified_impact: true }), {});
    expect(metrics.discovery).toBe(48);
    expect(metrics.progression).toBe(44);
  });
});

describe('applySignals — negative updates', () => {
  it('penalises pitching too early on two metrics', () => {
    const { metrics } = applySignals(BASE, withSignals({ pitched_too_early: true }), {});
    expect(metrics.discovery).toBe(35);
    expect(metrics.progression).toBe(35);
  });

  it('penalises an unsupported claim', () => {
    const { metrics } = applySignals(BASE, withSignals({ made_unsupported_claim: true }), {});
    expect(metrics.relevance).toBe(39);
    expect(metrics.clarity).toBe(47);
  });
});

describe('applySignals — immutability', () => {
  it('does not mutate the input metrics', () => {
    const input = { ...BASE };
    applySignals(input, withSignals({ asked_open_question: true }), {});
    expect(input).toEqual(BASE);
  });
});

describe('applySignals — clamping', () => {
  it('clamps at 100', () => {
    const high: Scores = { ...BASE, discovery: 99 };
    const { metrics } = applySignals(high, withSignals({ identified_pain: true }), {});
    expect(metrics.discovery).toBe(100);
  });

  it('clamps at 0', () => {
    const low: Scores = { ...BASE, listening: 3 };
    const { metrics } = applySignals(low, withSignals({ ignored_customer_statement: true }), {});
    expect(metrics.listening).toBe(0);
  });
});

describe('rewardFactor — repeated-achievement handling', () => {
  it('diminishes: full, half, quarter, then nothing', () => {
    expect(rewardFactor(0)).toBe(1);
    expect(rewardFactor(1)).toBe(0.5);
    expect(rewardFactor(2)).toBe(0.25);
    expect(rewardFactor(3)).toBe(0);
  });

  it('reduces reward the second time a signal fires and blocks it later', () => {
    const s = withSignals({ asked_open_question: true });
    const first = applySignals(BASE, s, {});
    expect(first.metrics.discovery).toBe(45); // +5

    const second = applySignals(first.metrics, s, first.rewardedCounts);
    expect(second.metrics.discovery).toBe(48); // +round(5*0.5)=+3 (47.5→48)

    const third = applySignals(second.metrics, s, second.rewardedCounts);
    expect(third.metrics.discovery).toBe(49); // +round(5*0.25)=+1

    const fourth = applySignals(third.metrics, s, third.rewardedCounts);
    expect(fourth.metrics.discovery).toBe(49); // factor 0 → no change
  });

  it('does NOT diminish penalties', () => {
    const s = withSignals({ was_too_long: true });
    const first = applySignals(BASE, s, {});
    const second = applySignals(first.metrics, s, first.rewardedCounts);
    expect(first.metrics.clarity).toBe(44);
    expect(second.metrics.clarity).toBe(38); // full -6 again
  });
});

describe('rawOverall — weighting', () => {
  it('uses pre-objection weights that sum to 1', () => {
    const sum = Object.values(PRE_OBJECTION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('uses post-objection weights that sum to 1', () => {
    const sum = Object.values(POST_OBJECTION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('computes the initial overall from initial metrics (pre-objection)', () => {
    // 40*.25 + 45*.22 + 50*.17 + 45*.22 + 40*.14 = 43.9 → 44
    expect(rawOverall(BASE, false)).toBe(44);
  });

  it('changes the overall when objection weighting activates', () => {
    const pre = rawOverall(BASE, false);
    const post = rawOverall(BASE, true);
    expect(pre).not.toBe(post);
  });
});

describe('smoothVisible — smoothing & movement cap', () => {
  it('caps upward movement at the maximum per turn', () => {
    expect(smoothVisible(40, 80)).toBe(40 + MAX_VISIBLE_MOVEMENT);
  });

  it('caps downward movement at the maximum per turn', () => {
    expect(smoothVisible(40, 0)).toBe(40 - MAX_VISIBLE_MOVEMENT);
  });

  it('moves exactly to target within the cap', () => {
    expect(smoothVisible(40, 45)).toBe(45);
  });

  it('clamps the visible score to 0–100', () => {
    expect(clamp(smoothVisible(2, -50))).toBeGreaterThanOrEqual(0);
  });
});
