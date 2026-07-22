import { describe, it, expect } from 'vitest';
import { ConversationEngine } from './engine';
import { DemoConversationProvider } from './DemoConversationProvider';
import { DemoRealTimeEvaluatorProvider } from '../evaluation/DemoRealTimeEvaluatorProvider';
import type { EvaluationContext, RealTimeEvaluatorProvider } from '../evaluation/types';
import type { EvaluatorResult } from '../types';

function makeEngine(evaluator?: RealTimeEvaluatorProvider) {
  return new ConversationEngine(
    new DemoConversationProvider(),
    { scenarioId: 'test', demoMode: true, now: () => 7 },
    evaluator ?? new DemoRealTimeEvaluatorProvider(),
  );
}

class ThrowingEvaluator implements RealTimeEvaluatorProvider {
  getName() { return 'throwing'; }
  isAvailable() { return true; }
  async evaluate(_ctx: EvaluationContext): Promise<EvaluatorResult> {
    throw new Error('evaluator down');
  }
}

describe('engine ↔ scoring integration', () => {
  it('enters Evaluating before GeneratingReply', async () => {
    const engine = makeEngine();
    const seen: string[] = [];
    engine.subscribe((s) => seen.push(s.status));
    engine.start();
    await engine.submitSeller('How do you currently train new reps?');

    const evalIdx = seen.indexOf('Evaluating');
    const genIdx = seen.indexOf('GeneratingReply');
    expect(evalIdx).toBeGreaterThanOrEqual(0);
    expect(genIdx).toBeGreaterThan(evalIdx);
  });

  it('writes a score-history entry after each seller turn', async () => {
    const engine = makeEngine();
    engine.start();
    await engine.submitSeller('How do you currently onboard new reps?');
    expect(engine.getState().scoreState.history).toHaveLength(1);
    await engine.submitSeller('How long until they hit quota?');
    expect(engine.getState().scoreState.history).toHaveLength(2);
    expect(engine.getState().scoreState.history[0].sellerTurn).toBe(1);
  });

  it('still produces a customer reply after scoring', async () => {
    const engine = makeEngine();
    engine.start();
    await engine.submitSeller('How do you currently train reps?');
    const last = engine.getState().transcript.at(-1)!;
    expect(last.speaker).toBe('customer');
    expect(engine.getState().status).toBe('WaitingForSeller');
  });

  it('a failing evaluator does not end the call — it warns and continues', async () => {
    const engine = makeEngine(new ThrowingEvaluator());
    engine.start();
    await engine.submitSeller('How do you currently train reps?');
    const s = engine.getState();
    expect(s.status).toBe('WaitingForSeller');
    expect(s.evaluatorWarning).toBeTruthy();
    // Fallback wrote a history entry with no metric changes.
    expect(s.scoreState.history).toHaveLength(1);
    expect(s.scoreState.history[0].reasons).toHaveLength(0);
    // Customer still replied.
    expect(s.transcript.at(-1)!.speaker).toBe('customer');
  });

  it('activates objection weighting once an objection has been raised', async () => {
    const engine = makeEngine();
    engine.start();
    await engine.submitSeller('How do you currently onboard new reps?'); // discovery
    await engine.submitSeller('Our platform is the best — just sign up.'); // pitch → objection raised
    expect(engine.getState().objectionsRaised.length).toBeGreaterThan(0);
    await engine.submitSeller('That makes sense, let me explain the difference.'); // scored post-objection
    expect(engine.getState().scoreState.objectionActive).toBe(true);
  });

  it('preserves score history after End Call', async () => {
    const engine = makeEngine();
    engine.start();
    await engine.submitSeller('How do you currently train reps?');
    await engine.submitSeller('How long does ramp-up take today?');
    const before = engine.getState().scoreState.history.length;
    engine.endCall();
    const s = engine.getState();
    expect(s.status).toBe('Completed');
    expect(s.scoreState.history).toHaveLength(before);
    expect(before).toBeGreaterThan(0);
  });

  it('increases Discovery after an open discovery question', async () => {
    const engine = makeEngine();
    engine.start();
    const before = engine.getState().scoreState.metrics.discovery;
    await engine.submitSeller('How are you currently training your new reps?');
    expect(engine.getState().scoreState.metrics.discovery).toBeGreaterThan(before);
  });
});
