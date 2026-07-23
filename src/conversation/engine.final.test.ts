import { describe, it, expect } from 'vitest';
import { ConversationEngine } from './engine';
import { DemoConversationProvider } from './DemoConversationProvider';
import { DemoRealTimeEvaluatorProvider } from '../evaluation/DemoRealTimeEvaluatorProvider';
import { DemoFinalEvaluatorProvider } from '../final/DemoFinalEvaluatorProvider';
import { validateFinalReport } from '../final/validate';
import { SESSION_SCHEMA_VERSION } from '../persistence/types';
import type { FinalEvaluationContext, FinalEvaluatorProvider, FinalReport } from '../final/types';

class ThrowingFinalEvaluator implements FinalEvaluatorProvider {
  getName() { return 'throwing-final'; }
  isAvailable() { return true; }
  async evaluate(_ctx: FinalEvaluationContext): Promise<FinalReport> {
    throw new Error('final evaluator down');
  }
}

class InvalidFinalEvaluator implements FinalEvaluatorProvider {
  getName() { return 'invalid-final'; }
  isAvailable() { return true; }
  async evaluate(_ctx: FinalEvaluationContext): Promise<FinalReport> {
    // Only two strengths — violates the "exactly 3" rule.
    return { strengths: ['a', 'b'] } as unknown as FinalReport;
  }
}

function makeEngine(finalEvaluator?: FinalEvaluatorProvider) {
  let t = 1000;
  return new ConversationEngine(
    new DemoConversationProvider(0),
    { scenarioId: 'test', demoMode: true, now: () => (t += 1000) },
    new DemoRealTimeEvaluatorProvider(),
    finalEvaluator ?? new DemoFinalEvaluatorProvider(),
  );
}

async function runCall(engine: ConversationEngine, messages: string[]) {
  engine.start();
  for (const m of messages) await engine.submitSeller(m);
  await engine.endCall();
  return engine.getState();
}

describe('End Call — final evaluation flow', () => {
  it('runs the final evaluator and produces a valid report', async () => {
    const s = await runCall(makeEngine(), [
      'How are you currently training new reps?',
      'How many hours per week does that cost your managers?',
    ]);
    expect(s.status).toBe('Completed');
    expect(s.finalReport).not.toBeNull();
    expect(validateFinalReport(s.finalReport).ok).toBe(true);
  });

  it('computes the live average and builds a completed session', async () => {
    const s = await runCall(makeEngine(), ['How do you currently train reps?']);
    const session = s.completedSession!;
    expect(session).toBeTruthy();
    expect(session.schemaVersion).toBe(SESSION_SCHEMA_VERSION);
    expect(session.sellerTurnCount).toBe(1);
    expect(session.liveAverage).toBe(s.liveAverage);
    expect(session.scoreHistory).toHaveLength(1);
    expect(session.transcript.length).toBeGreaterThan(1);
    expect(session.providerNames.finalEvaluator).toMatch(/final/i);
  });

  it('stops accepting seller input once completed', async () => {
    const engine = makeEngine();
    const s = await runCall(engine, ['How do you train reps?']);
    const before = s.transcript.length;
    await engine.submitSeller('one more question?');
    expect(engine.getState().transcript).toHaveLength(before);
  });

  it('is idempotent — a second End Call cannot create a second session', async () => {
    const engine = makeEngine();
    await runCall(engine, ['How do you train reps?']);
    const first = engine.getState().completedSession;
    await engine.endCall();
    expect(engine.getState().completedSession).toBe(first);
  });

  it('uses a fallback report and warns when final evaluation throws', async () => {
    const s = await runCall(makeEngine(new ThrowingFinalEvaluator()), [
      'How do you currently train reps?',
    ]);
    expect(s.status).toBe('Completed');
    expect(validateFinalReport(s.finalReport).ok).toBe(true);
    expect(s.completedSession!.fallbackWarnings.some((w) => /unavailable/i.test(w))).toBe(true);
    // Nothing is lost.
    expect(s.completedSession!.transcript.length).toBeGreaterThan(1);
    expect(s.completedSession!.scoreHistory).toHaveLength(1);
  });

  it('uses a fallback report when the final result fails validation', async () => {
    const s = await runCall(makeEngine(new InvalidFinalEvaluator()), [
      'How do you currently train reps?',
    ]);
    expect(validateFinalReport(s.finalReport).ok).toBe(true);
    expect(s.completedSession!.fallbackWarnings.some((w) => /invalid/i.test(w))).toBe(true);
  });
});

describe('End Call — short calls', () => {
  it('produces a valid session when the call is ended immediately', async () => {
    const s = await runCall(makeEngine(), []);
    expect(s.status).toBe('Completed');
    const session = s.completedSession!;
    expect(session.sellerTurnCount).toBe(0);
    expect(session.scoreHistory).toHaveLength(0);
    expect(validateFinalReport(session.finalReport).ok).toBe(true);
    expect(session.finalReport.strongest_statement).toBe('');
    expect(session.finalReport.weakest_statement).toBe('');
  });

  it('handles a single-turn call without duplicating statements', async () => {
    const s = await runCall(makeEngine(), ['How are you currently training reps?']);
    const r = s.completedSession!.finalReport;
    expect(r.strongest_statement).not.toBe('');
    expect(r.weakest_statement).toBe('');
  });
});

describe('End Call — objections in the final report', () => {
  it('only includes objections that were actually raised', async () => {
    const engine = makeEngine();
    const s = await runCall(engine, [
      'How are you currently onboarding new reps?',
      'Our platform is the best on the market — just sign up.', // triggers objection
      'That makes sense. Unlike a generic chatbot, it is trained on your scenarios.',
    ]);
    const raised = s.objectionsRaised;
    expect(raised.length).toBeGreaterThan(0);
    const results = s.completedSession!.finalReport.objection_results;
    expect(results).toHaveLength(raised.length);
    expect(
      validateFinalReport(s.completedSession!.finalReport, {
        sellerMessages: new Set(s.transcript.filter((t) => t.speaker === 'seller').map((t) => t.message)),
        raisedObjectionLabels: new Set(results.map((r) => r.objection)),
      }).ok,
    ).toBe(true);
  });

  it('reports no objections for a clean discovery-only call', async () => {
    const s = await runCall(makeEngine(), [
      'How are you currently training new reps?',
      'How long until a new rep is productive?',
    ]);
    expect(s.objectionsRaised).toHaveLength(0);
    expect(s.completedSession!.finalReport.objection_results).toHaveLength(0);
  });
});
