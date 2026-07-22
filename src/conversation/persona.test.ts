import { describe, it, expect } from 'vitest';
import {
  analyzeSeller,
  selectReply,
  pendingObjection,
  OPENING_LINE,
} from './persona';
import { DemoConversationProvider } from './DemoConversationProvider';
import { createInitialMemory, type ConversationContext, type CustomerMemory } from './types';

function ctx(
  sellerMessage: string,
  overrides: Partial<ConversationContext> = {},
): ConversationContext {
  const memory: CustomerMemory = { ...createInitialMemory(), ...(overrides.memory ?? {}) };
  return {
    scenarioId: 'test',
    transcript: [],
    stage: 'opening',
    objectionsRaised: [],
    sellerMessage,
    ...overrides,
    memory,
  };
}

describe('analyzeSeller', () => {
  it('detects a discovery question about the current process', () => {
    const s = analyzeSeller('How do you currently onboard your reps?');
    expect(s.isQuestion).toBe(true);
    expect(s.asksAboutProcess).toBe(true);
    expect(s.isDiscoveryQuestion).toBe(true);
  });

  it('detects an early pitch', () => {
    const s = analyzeSeller('Our platform is the best, trust me, just sign up.');
    expect(s.isPitch).toBe(true);
  });

  it('detects a proposed next step', () => {
    const s = analyzeSeller('Can we schedule a demo next week?');
    expect(s.proposesNextStep).toBe(true);
  });
});

describe('selectReply — scepticism and objections', () => {
  it('pushes back and raises the chatbot objection on an early pitch', () => {
    const reply = selectReply(ctx('Our platform is the best, just buy it.'));
    expect(reply.raisedObjection).toBe('generic_chatbot');
    expect(reply.receptivenessDelta ?? 0).toBeLessThan(0);
  });

  it('shares a fact on a genuine discovery question', () => {
    const reply = selectReply(ctx('How do you currently train new reps?'));
    expect(reply.message.length).toBeGreaterThan(0);
    expect(reply.rememberedFact).toBeTruthy();
    expect((reply.receptivenessDelta ?? 0)).toBeGreaterThan(0);
  });

  it('does not agree to a demo too early (stays sceptical)', () => {
    const reply = selectReply(ctx('Shall we book a demo?'));
    expect(reply.agreedToNextStep).not.toBe(true);
    expect(reply.stageHint).toBe('objection_handling');
  });

  it('agrees to a demo only once warm and an objection is addressed', () => {
    const reply = selectReply(
      ctx('Great — can we set up a demo with your team leads?', {
        memory: {
          ...createInitialMemory(),
          receptiveness: 72,
          sellerTurns: 4,
          addressedObjections: ['generic_chatbot'],
        },
      }),
    );
    expect(reply.agreedToNextStep).toBe(true);
    expect(reply.stageHint).toBe('next_step');
  });

  it('rewards addressing a pending objection', () => {
    const reply = selectReply(
      ctx(
        'Unlike a generic chatbot, this simulates your real buyer persona and coaches privately.',
        {
          objectionsRaised: ['generic_chatbot'],
          memory: { ...createInitialMemory(), sellerTurns: 2 },
        },
      ),
    );
    expect(reply.addressedObjection).toBe('generic_chatbot');
    expect((reply.receptivenessDelta ?? 0)).toBeGreaterThan(0);
  });
});

describe('pendingObjection', () => {
  it('returns the most recent unaddressed objection', () => {
    const c = ctx('...', {
      objectionsRaised: ['already_mock_calls', 'generic_chatbot'],
      memory: { ...createInitialMemory(), addressedObjections: ['already_mock_calls'] },
    });
    expect(pendingObjection(c)).toBe('generic_chatbot');
  });

  it('returns undefined when all objections are addressed', () => {
    const c = ctx('...', {
      objectionsRaised: ['generic_chatbot'],
      memory: { ...createInitialMemory(), addressedObjections: ['generic_chatbot'] },
    });
    expect(pendingObjection(c)).toBeUndefined();
  });
});

describe('DemoConversationProvider', () => {
  it('is always available and exposes the opening line', () => {
    const p = new DemoConversationProvider();
    expect(p.isAvailable()).toBe(true);
    expect(p.getOpeningLine()).toBe(OPENING_LINE);
    expect(p.getName()).toMatch(/demo/i);
  });

  it('produces a non-empty reply', async () => {
    const p = new DemoConversationProvider();
    const reply = await p.generateReply(ctx('How do you train reps today?'));
    expect(reply.message.trim().length).toBeGreaterThan(0);
  });
});
