import { describe, it, expect } from 'vitest';
import { ConversationEngine } from './engine';
import { DemoConversationProvider } from './DemoConversationProvider';
import { DemoRealTimeEvaluatorProvider } from '../evaluation/DemoRealTimeEvaluatorProvider';
import { DemoFinalEvaluatorProvider } from '../final/DemoFinalEvaluatorProvider';

// A customer capability that falls back on the FIRST turn (returns a notice)
// and succeeds afterwards (returns null). This models a transient blip.
function transientCustomerNotice() {
  let turn = 0;
  return () => {
    turn += 1;
    return turn === 1 ? 'Rohan is now scripted (the AI customer was unavailable).' : null;
  };
}

function makeEngine(customerNotice: () => string | null) {
  return new ConversationEngine(
    new DemoConversationProvider(0),
    {
      scenarioId: 'warn',
      demoMode: true,
      fallbackNotices: {
        customer: customerNotice,
        turnEvaluator: () => null,
        finalReport: () => null,
      },
    },
    new DemoRealTimeEvaluatorProvider(),
    new DemoFinalEvaluatorProvider(),
  );
}

describe('capability warning lifecycle', () => {
  it('shows a transient fallback warning, then clears it when the capability recovers', async () => {
    const engine = makeEngine(transientCustomerNotice());
    engine.start();

    await engine.submitSeller('How are new reps onboarded today?');
    // First turn fell back → warning is visible.
    expect(engine.getState().capabilityWarning).toMatch(/scripted/i);

    await engine.submitSeller('How long until a rep is productive?');
    // Second turn succeeded → the transient warning has cleared.
    expect(engine.getState().capabilityWarning).toBeNull();
  });

  it('keeps a persistent fallback warning while the capability keeps failing', async () => {
    const engine = makeEngine(() => 'Rohan is scripted (AI customer unavailable).');
    engine.start();
    await engine.submitSeller('How are new reps onboarded today?');
    await engine.submitSeller('What does slow ramp cost you?');
    expect(engine.getState().capabilityWarning).toMatch(/scripted/i);
  });

  it('preserves the full fallback history in the completed session', async () => {
    const engine = makeEngine(transientCustomerNotice());
    engine.start();
    await engine.submitSeller('How are new reps onboarded today?');
    await engine.submitSeller('How long until a rep is productive?');
    await engine.endCall();

    const warnings = engine.getState().completedSession!.fallbackWarnings;
    // The live warning cleared, but the historical record of the blip remains.
    expect(engine.getState().capabilityWarning).toBeNull();
    expect(warnings.some((w) => /scripted/i.test(w))).toBe(true);
  });
});
