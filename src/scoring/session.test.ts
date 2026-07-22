import { describe, it, expect } from 'vitest';
import { createInitialScoreState, applyEvaluation } from './session';
import { emptySignals } from '../evaluation/validate';
import type { EvaluatorResult } from '../types';

function result(signals = emptySignals()): EvaluatorResult {
  return {
    signals,
    turn_quality: 50,
    brief_feedback: 'fb',
    recommended_next_move: 'next',
    detected_stage: 'discovery',
  };
}

describe('createInitialScoreState', () => {
  it('starts from the initial metrics with a computed visible overall', () => {
    const s = createInitialScoreState();
    expect(s.metrics.discovery).toBe(40);
    expect(s.visibleOverall).toBe(44); // pre-objection weighted initial
    expect(s.history).toHaveLength(0);
    expect(s.objectionActive).toBe(false);
  });
});

describe('applyEvaluation', () => {
  it('writes a history entry with previous and updated metrics and reasons', () => {
    const s0 = createInitialScoreState();
    const s1 = applyEvaluation(s0, result(emptySignals()), {
      sellerTurn: 1, timestamp: 100, stage: 'discovery', objectionActive: false,
    });
    expect(s1.history).toHaveLength(1);
    const entry = s1.history[0];
    expect(entry.sellerTurn).toBe(1);
    expect(entry.timestamp).toBe(100);
    expect(entry.previousMetrics).toEqual(s0.metrics);
    expect(entry.updatedMetrics).toEqual(s1.metrics);
    expect(entry.briefFeedback).toBe('fb');
    expect(entry.recommendedNextMove).toBe('next');
    expect(Array.isArray(entry.reasons)).toBe(true);
  });

  it('does not mutate the previous state (immutable)', () => {
    const s0 = createInitialScoreState();
    const before = JSON.parse(JSON.stringify(s0));
    applyEvaluation(s0, result(), { sellerTurn: 1, timestamp: 1, stage: 'opening', objectionActive: false });
    expect(s0).toEqual(before);
  });

  it('activates objection weighting and keeps it active', () => {
    const s0 = createInitialScoreState();
    const s1 = applyEvaluation(s0, result(), { sellerTurn: 1, timestamp: 1, stage: 'objection_handling', objectionActive: true });
    expect(s1.objectionActive).toBe(true);
    const s2 = applyEvaluation(s1, result(), { sellerTurn: 2, timestamp: 2, stage: 'discovery', objectionActive: false });
    expect(s2.objectionActive).toBe(true); // stays active once triggered
  });

  it('records score-change reasons when signals fire', () => {
    const s0 = createInitialScoreState();
    const s1 = applyEvaluation(
      s0,
      result(emptySignals()),
      { sellerTurn: 1, timestamp: 1, stage: 'discovery', objectionActive: false },
    );
    // No signals → no reasons.
    expect(s1.history[0].reasons).toHaveLength(0);

    const s2 = applyEvaluation(
      s1,
      result({ ...emptySignals(), identified_pain: true }),
      { sellerTurn: 2, timestamp: 2, stage: 'discovery', objectionActive: false },
    );
    expect(s2.history[1].reasons.length).toBeGreaterThan(0);
    expect(s2.metrics.discovery).toBeGreaterThan(s1.metrics.discovery);
  });
});
