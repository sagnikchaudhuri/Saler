import { describe, it, expect } from 'vitest';
import { detectSignals } from './detect';
import type { EvaluationContext } from './types';
import { CALIBRATION_CASES, type CalibrationCase } from './calibration.fixtures';

function toContext(c: CalibrationCase): EvaluationContext {
  return {
    sellerMessage: c.seller,
    latestCustomerStatement: c.latestCustomer ?? null,
    transcript: [],
    stage: c.stage ?? 'discovery',
    objectionsRaised: c.objections ?? [],
    previousSellerMessages: c.previous ?? [],
  };
}

describe('signal calibration — labelled dataset', () => {
  it('has the required class balance', () => {
    const count = (g: CalibrationCase['group']) =>
      CALIBRATION_CASES.filter((c) => c.group === g).length;
    expect(count('positive')).toBeGreaterThanOrEqual(25);
    expect(count('negative')).toBeGreaterThanOrEqual(20);
    expect(count('ambiguous')).toBeGreaterThanOrEqual(15);
    expect(count('adversarial')).toBeGreaterThanOrEqual(10);
  });

  it('uses unique case ids', () => {
    const ids = CALIBRATION_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const c of CALIBRATION_CASES) {
    it(`${c.id} (${c.group}): ${c.why}`, () => {
      const signals = detectSignals(toContext(c));

      for (const key of c.expectTrue) {
        expect(signals[key], `${c.id}: expected ${key} to be detected`).toBe(true);
      }
      for (const key of c.expectFalse) {
        expect(signals[key], `${c.id}: expected ${key} NOT to be detected`).toBe(false);
      }
      // Documented gaps: assert they really are still missed, so the day the
      // detector improves, this test tells us to update the record.
      for (const key of c.knownMiss ?? []) {
        expect(signals[key], `${c.id}: ${key} is a documented gap`).toBe(false);
      }
    });
  }
});

describe('signal calibration — agreement summary', () => {
  it('reports fixture agreement (internal labels, not sales effectiveness)', () => {
    let truePositive = 0;
    let falseNegative = 0;
    let trueNegative = 0;
    let falsePositive = 0;
    const missed: string[] = [];

    for (const c of CALIBRATION_CASES) {
      const signals = detectSignals(toContext(c));
      for (const key of c.expectTrue) {
        if (signals[key]) truePositive++;
        else {
          falseNegative++;
          missed.push(`${c.id}:${key}`);
        }
      }
      for (const key of c.expectFalse) {
        if (!signals[key]) trueNegative++;
        else {
          falsePositive++;
          missed.push(`${c.id}:!${key}`);
        }
      }
      // knownMiss entries are counted separately as documented gaps.
      for (const key of c.knownMiss ?? []) {
        if (signals[key]) missed.push(`${c.id}:gap-closed:${key}`);
      }
    }

    const assertions = truePositive + falseNegative + trueNegative + falsePositive;
    const agreement = (truePositive + trueNegative) / assertions;

    // Surfaced in the run output for the calibration report.
    console.log(
      `[calibration] cases=${CALIBRATION_CASES.length} assertions=${assertions} ` +
        `TP=${truePositive} TN=${trueNegative} FP=${falsePositive} FN=${falseNegative} ` +
        `agreement=${(agreement * 100).toFixed(1)}% ` +
        `documentedGaps=${CALIBRATION_CASES.reduce((n, c) => n + (c.knownMiss?.length ?? 0), 0)}` +
        (missed.length ? ` unexpected=[${missed.join(', ')}]` : ''),
    );

    // Every labelled expectation must hold — the dataset is the contract.
    expect(falsePositive, `unexpected detections: ${missed.join(', ')}`).toBe(0);
    expect(falseNegative, `missed detections: ${missed.join(', ')}`).toBe(0);
  });
});
