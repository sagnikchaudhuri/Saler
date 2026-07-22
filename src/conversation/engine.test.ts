import { describe, it, expect } from 'vitest';
import { ConversationEngine, MAX_INPUT_LENGTH } from './engine';
import type {
  ConversationContext,
  ConversationProvider,
  ProviderReply,
} from './types';
import { DemoConversationProvider } from './DemoConversationProvider';
import { ProviderUnavailableError } from './errors';

// Deterministic clock for stable timestamps.
function fixedNow() {
  let t = 1_000;
  return () => (t += 1);
}

function makeEngine(provider: ConversationProvider) {
  return new ConversationEngine(provider, {
    scenarioId: 'test',
    demoMode: true,
    now: fixedNow(),
  });
}

class FailingProvider implements ConversationProvider {
  getName() { return 'fail'; }
  isAvailable() { return true; }
  getOpeningLine() { return 'Hi.'; }
  async generateReply(): Promise<ProviderReply> {
    throw new Error('network exploded');
  }
}

class InvalidProvider implements ConversationProvider {
  getName() { return 'invalid'; }
  isAvailable() { return true; }
  getOpeningLine() { return 'Hi.'; }
  async generateReply(): Promise<ProviderReply> {
    return { message: '   ' }; // blank message = invalid
  }
}

class UnavailableProvider implements ConversationProvider {
  getName() { return 'down'; }
  isAvailable() { return false; }
  getOpeningLine() { return 'Hi.'; }
  async generateReply(_ctx: ConversationContext): Promise<ProviderReply> {
    throw new ProviderUnavailableError();
  }
}

describe('ConversationEngine — lifecycle', () => {
  it('starts Idle and moves to WaitingForSeller with an opening customer turn', () => {
    const engine = makeEngine(new DemoConversationProvider());
    expect(engine.getState().status).toBe('Idle');

    engine.start();
    const s = engine.getState();
    expect(s.status).toBe('WaitingForSeller');
    expect(s.transcript).toHaveLength(1);
    expect(s.transcript[0].speaker).toBe('customer');
    expect(s.transcript[0].stage).toBe('opening');
    expect(s.startedAt).not.toBeNull();
  });

  it('does not start twice', () => {
    const engine = makeEngine(new DemoConversationProvider());
    engine.start();
    engine.start();
    expect(engine.getState().transcript).toHaveLength(1);
  });

  it('errors on start when the provider is unavailable', () => {
    const engine = makeEngine(new UnavailableProvider());
    engine.start();
    expect(engine.getState().status).toBe('Error');
  });
});

describe('ConversationEngine — transcript creation', () => {
  it('creates strongly-typed turns with id, speaker, message, stage, timestamp', async () => {
    const engine = makeEngine(new DemoConversationProvider());
    engine.start();
    await engine.submitSeller('How do you currently train your new reps?');

    const turn = engine.getState().transcript.at(-1)!;
    expect(turn).toMatchObject({
      id: expect.stringMatching(/^turn-\d+$/),
      speaker: 'customer',
      message: expect.any(String),
      stage: expect.any(String),
      timestamp: expect.any(Number),
    });
  });

  it('appends both a seller and a customer turn per exchange', async () => {
    const engine = makeEngine(new DemoConversationProvider());
    engine.start();
    await engine.submitSeller('Tell me about your current onboarding process.');
    const t = engine.getState().transcript;
    expect(t).toHaveLength(3); // opening + seller + customer
    expect(t[1].speaker).toBe('seller');
    expect(t[2].speaker).toBe('customer');
  });
});

describe('ConversationEngine — state transitions', () => {
  it('passes through GeneratingReply and Evaluating before WaitingForSeller', async () => {
    const engine = makeEngine(new DemoConversationProvider());
    const seen: string[] = [];
    engine.subscribe((s) => seen.push(s.status));
    engine.start();
    await engine.submitSeller('What does your ramp process look like today?');

    expect(seen).toContain('GeneratingReply');
    expect(seen).toContain('Evaluating');
    expect(engine.getState().status).toBe('WaitingForSeller');
  });

  it('advances the sales stage as discovery happens', async () => {
    const engine = makeEngine(new DemoConversationProvider());
    engine.start();
    expect(engine.getState().stage).toBe('opening');
    await engine.submitSeller('How do you currently onboard and train new reps?');
    expect(engine.getState().stage).not.toBe('opening');
  });
});

describe('ConversationEngine — input validation', () => {
  it('rejects empty input without changing status or transcript', async () => {
    const engine = makeEngine(new DemoConversationProvider());
    engine.start();
    const before = engine.getState().transcript.length;
    await engine.submitSeller('    ');
    const s = engine.getState();
    expect(s.status).toBe('WaitingForSeller');
    expect(s.inputError).toBeTruthy();
    expect(s.transcript).toHaveLength(before);
  });

  it('rejects over-long input', async () => {
    const engine = makeEngine(new DemoConversationProvider());
    engine.start();
    await engine.submitSeller('x'.repeat(MAX_INPUT_LENGTH + 1));
    expect(engine.getState().inputError).toBeTruthy();
    expect(engine.getState().transcript).toHaveLength(1);
  });

  it('ignores submissions when not waiting for the seller', async () => {
    const engine = makeEngine(new DemoConversationProvider());
    // status is Idle (not started)
    await engine.submitSeller('hello?');
    expect(engine.getState().transcript).toHaveLength(0);
  });
});

describe('ConversationEngine — error handling', () => {
  it('enters Error on provider failure and recovers via retry', async () => {
    const engine = makeEngine(new FailingProvider());
    engine.start();
    await engine.submitSeller('How do you train reps today?');
    expect(engine.getState().status).toBe('Error');
    expect(engine.getState().error).toBeTruthy();

    engine.retry();
    expect(engine.getState().status).toBe('WaitingForSeller');
    expect(engine.getState().error).toBeNull();
  });

  it('treats a blank provider message as an invalid response', async () => {
    const engine = makeEngine(new InvalidProvider());
    engine.start();
    await engine.submitSeller('How do you train reps today?');
    expect(engine.getState().status).toBe('Error');
    expect(engine.getState().error).toMatch(/invalid/i);
  });
});

describe('ConversationEngine — end call', () => {
  it('transitions to Completed and records endedAt', async () => {
    const engine = makeEngine(new DemoConversationProvider());
    engine.start();
    await engine.submitSeller('How do you onboard new reps?');
    engine.endCall();
    const s = engine.getState();
    expect(s.status).toBe('Completed');
    expect(s.endedAt).not.toBeNull();
  });

  it('is idempotent once completed', () => {
    const engine = makeEngine(new DemoConversationProvider());
    engine.start();
    engine.endCall();
    const first = engine.getState().endedAt;
    engine.endCall();
    expect(engine.getState().endedAt).toBe(first);
  });
});
