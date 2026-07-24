import { describe, it, expect } from 'vitest';
import { ConversationEngine } from './engine';
import { DemoConversationProvider } from './DemoConversationProvider';
import { DemoRealTimeEvaluatorProvider } from '../evaluation/DemoRealTimeEvaluatorProvider';
import { DemoFinalEvaluatorProvider } from '../final/DemoFinalEvaluatorProvider';
import type {
  ConversationProvider,
  ProviderReply,
} from './types';
import type {
  EvaluationContext,
  RealTimeEvaluatorProvider,
} from '../evaluation/types';
import type { EvaluatorResult } from '../types';

// ============================================================================
// Call-completion race and idempotency (audit Repair Phase 1, §1–§3).
//
// The defect: End Call while submitSeller was awaiting could append a late
// customer turn, flip Completed back to WaitingForSeller, and persist a second
// session. These tests hold a provider open so End Call always lands mid-flight.
// ============================================================================

/** Customer provider whose reply we can hold open for `delayMs`. */
function slowCustomer(delayMs: number): ConversationProvider {
  return {
    getName: () => 'slow-customer',
    isAvailable: () => true,
    getOpeningLine: () => 'Hi, this is Rohan.',
    generateReply: async (): Promise<ProviderReply> => {
      await new Promise((r) => setTimeout(r, delayMs));
      return { message: 'A late reply that must never land after End Call.' };
    },
  };
}

/** Evaluator whose scoring we can hold open for `delayMs`. */
function slowEvaluator(delayMs: number): RealTimeEvaluatorProvider {
  const inner = new DemoRealTimeEvaluatorProvider();
  return {
    getName: () => 'slow-evaluator',
    isAvailable: () => true,
    evaluate: async (ctx: EvaluationContext): Promise<EvaluatorResult> => {
      await new Promise((r) => setTimeout(r, delayMs));
      return inner.evaluate(ctx);
    },
  };
}

function engineWith(
  provider: ConversationProvider,
  evaluator?: RealTimeEvaluatorProvider,
): ConversationEngine {
  return new ConversationEngine(
    provider,
    { scenarioId: 'race', demoMode: true },
    evaluator ?? new DemoRealTimeEvaluatorProvider(),
    new DemoFinalEvaluatorProvider(),
  );
}

describe('End Call during customer generation', () => {
  it('freezes the call: no late reply, no revival, one session', async () => {
    const engine = engineWith(slowCustomer(60));
    engine.start();

    const inFlight = engine.submitSeller('How do you currently train new reps?');
    await new Promise((r) => setTimeout(r, 5)); // let it reach GeneratingReply
    await engine.endCall();

    const atEnd = engine.getState();
    const frozenTranscript = atEnd.transcript.length;
    const sessionId = atEnd.completedSession?.id;
    expect(atEnd.status).toBe('Completed');
    expect(atEnd.finalReport).not.toBeNull();

    await inFlight; // the late reply resolves now

    const after = engine.getState();
    expect(after.status).toBe('Completed'); // never revived
    expect(after.transcript.length).toBe(frozenTranscript); // no late customer turn
    // The customer's late line never entered the transcript.
    expect(after.transcript.some((t) => /must never land/.test(t.message))).toBe(false);
    // The saved transcript equals the frozen transcript.
    expect(after.completedSession?.transcript.length).toBe(frozenTranscript);
    expect(after.completedSession?.id).toBe(sessionId);
  });
});

describe('End Call during real-time evaluation', () => {
  it('discards the late evaluator result and never scores after completion', async () => {
    const engine = engineWith(slowCustomer(1), slowEvaluator(60));
    engine.start();

    const inFlight = engine.submitSeller('How do you currently train new reps?');
    await new Promise((r) => setTimeout(r, 5)); // reach Evaluating
    await engine.endCall();

    const scoredAtEnd = engine.getState().scoreState.history.length;
    await inFlight;

    const after = engine.getState();
    expect(after.status).toBe('Completed');
    // The late evaluation did not append a score entry.
    expect(after.scoreState.history.length).toBe(scoredAtEnd);
    expect(after.completedSession?.scoreHistory.length).toBe(scoredAtEnd);
  });
});

describe('End Call idempotency', () => {
  it('concurrent endCall calls resolve to exactly one session', async () => {
    const engine = engineWith(new DemoConversationProvider(0));
    engine.start();
    await engine.submitSeller('How do you train reps today?');

    const [a, b, c] = [engine.endCall(), engine.endCall(), engine.endCall()];
    await Promise.all([a, b, c]);

    const s = engine.getState();
    expect(s.status).toBe('Completed');
    expect(s.completedSession).not.toBeNull();
    const first = s.completedSession;
    await engine.endCall(); // repeated click, well after completion
    expect(engine.getState().completedSession).toBe(first); // same object, same id
  });

  it('a repeated End Call after the resurrection window still yields one id', async () => {
    const engine = engineWith(slowCustomer(40));
    engine.start();
    const inFlight = engine.submitSeller('How do you train reps today?');
    await new Promise((r) => setTimeout(r, 5));
    await engine.endCall();
    const firstId = engine.getState().completedSession?.id;
    await inFlight; // would previously revive the call
    await engine.endCall(); // and this would previously mint a second session
    expect(engine.getState().completedSession?.id).toBe(firstId);
  });
});

describe('retry after a generation failure', () => {
  it('regenerates only the reply — no second seller turn, no re-score', async () => {
    let calls = 0;
    const failOnce: ConversationProvider = {
      getName: () => 'fail-once',
      isAvailable: () => true,
      getOpeningLine: () => 'Hi, this is Rohan.',
      generateReply: async () => {
        calls += 1;
        if (calls === 1) throw new Error('upstream down');
        return { message: 'Recovered reply.' };
      },
    };
    const engine = engineWith(failOnce);
    engine.start();
    await engine.submitSeller('How do you currently train new reps?');
    expect(engine.getState().status).toBe('Error');

    const sellerBefore = engine.getState().transcript.filter((t) => t.speaker === 'seller').length;
    const scoredBefore = engine.getState().scoreState.history.length;
    const countsBefore = JSON.stringify(engine.getState().scoreState.rewardedCounts);

    await engine.retry();
    const s = engine.getState();
    expect(s.status).toBe('WaitingForSeller');
    expect(s.transcript.filter((t) => t.speaker === 'seller').length).toBe(sellerBefore);
    expect(s.scoreState.history.length).toBe(scoredBefore);
    // Diminishing-reward counters are untouched by a retry.
    expect(JSON.stringify(s.scoreState.rewardedCounts)).toBe(countsBefore);
    expect(s.transcript.at(-1)!.speaker).toBe('customer');
  });
});

describe('a submit that resolves after End Call cannot double-submit', () => {
  it('ignores input once completed', async () => {
    const engine = engineWith(new DemoConversationProvider(0));
    engine.start();
    await engine.submitSeller('How do you train reps today?');
    await engine.endCall();
    const before = engine.getState().transcript.length;
    await engine.submitSeller('one more question after the call ended?');
    expect(engine.getState().transcript.length).toBe(before);
  });
});
