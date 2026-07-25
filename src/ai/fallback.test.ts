import { describe, it, expect } from 'vitest';
import {
  FallbackConversationProvider,
  FallbackFinalEvaluatorProvider,
  FallbackRealTimeEvaluatorProvider,
  SourceTracker,
} from './fallback';
import { DemoConversationProvider } from '../conversation/DemoConversationProvider';
import { DemoRealTimeEvaluatorProvider } from '../evaluation/DemoRealTimeEvaluatorProvider';
import { DemoFinalEvaluatorProvider } from '../final/DemoFinalEvaluatorProvider';
import { createInitialMemory } from '../conversation/types';
import type { ConversationContext, ConversationProvider, ProviderReply } from '../conversation/types';
import type { EvaluationContext, RealTimeEvaluatorProvider } from '../evaluation/types';
import type { FinalEvaluationContext, FinalEvaluatorProvider, FinalReport } from '../final/types';
import type { EvaluatorResult } from '../types';

function convoCtx(): ConversationContext {
  return {
    scenarioId: 't',
    transcript: [],
    memory: createInitialMemory(),
    stage: 'opening',
    objectionsRaised: [],
    sellerMessage: 'How do you currently train new reps?',
  };
}

function evalCtx(): EvaluationContext {
  return {
    sellerMessage: 'How do you currently train new reps?',
    latestCustomerStatement: null,
    transcript: [],
    stage: 'opening',
    objectionsRaised: [],
    previousSellerMessages: [],
  };
}

function finalCtx(): FinalEvaluationContext {
  return {
    transcript: [],
    sellerMessages: ['How do you currently train new reps?'],
    scoreHistory: [],
    objectionEvents: [],
    addressedObjections: [],
    finalStage: 'discovery',
    durationMs: 1000,
    liveAverage: 50,
    agreedToNextStep: false,
    sellerTurnCount: 1,
  };
}

class FailingConversation implements ConversationProvider {
  calls = 0;
  getName() { return 'AI Customer'; }
  isAvailable() { return true; }
  getOpeningLine() { return 'hi'; }
  async generateReply(_c: ConversationContext): Promise<ProviderReply> {
    this.calls++;
    throw new Error('model down');
  }
}

class WorkingConversation implements ConversationProvider {
  getName() { return 'AI Customer'; }
  isAvailable() { return true; }
  getOpeningLine() { return 'hi'; }
  async generateReply(): Promise<ProviderReply> {
    return { message: 'AI generated reply.' };
  }
}

class FailingEvaluator implements RealTimeEvaluatorProvider {
  getName() { return 'AI Evaluation'; }
  isAvailable() { return true; }
  async evaluate(_c: EvaluationContext): Promise<EvaluatorResult> {
    throw new Error('down');
  }
}

class FailingFinal implements FinalEvaluatorProvider {
  getName() { return 'AI Final Review'; }
  isAvailable() { return true; }
  async evaluate(_c: FinalEvaluationContext): Promise<FinalReport> {
    throw new Error('down');
  }
}

describe('SourceTracker', () => {
  it('summarises ai / demo / mixed / none', () => {
    const t = new SourceTracker();
    expect(t.summary()).toBe('none');
    t.record('ai');
    expect(t.summary()).toBe('ai');
    t.record('demo');
    expect(t.summary()).toBe('mixed');

    const d = new SourceTracker();
    d.record('demo');
    expect(d.summary()).toBe('demo');
  });
});

describe('conversation fallback', () => {
  it('uses the AI customer when it works', async () => {
    const chain = new FallbackConversationProvider(new WorkingConversation(), new DemoConversationProvider(0));
    const reply = await chain.generateReply(convoCtx());
    expect(reply.message).toBe('AI generated reply.');
    expect(chain.getName()).toBe('AI Customer');
    expect(chain.tracker.summary()).toBe('ai');
  });

  it('falls back to the scripted persona for that turn', async () => {
    const failing = new FailingConversation();
    const chain = new FallbackConversationProvider(failing, new DemoConversationProvider(0));
    const reply = await chain.generateReply(convoCtx());

    expect(reply.message.length).toBeGreaterThan(0); // the call continues
    expect(chain.getName()).toMatch(/demo/i);
    expect(chain.lastFallbackReason).toMatch(/scripted customer/i);
    expect(failing.calls).toBe(1); // exactly one attempt, no retry storm
  });

  it('reports mixed when only some turns fell back', async () => {
    const flaky: ConversationProvider = {
      getName: () => 'AI Customer',
      isAvailable: () => true,
      getOpeningLine: () => 'hi',
      generateReply: (() => {
        let n = 0;
        return async () => {
          n++;
          if (n === 1) return { message: 'AI reply.' };
          throw new Error('down');
        };
      })(),
    };
    const chain = new FallbackConversationProvider(flaky, new DemoConversationProvider(0));
    await chain.generateReply(convoCtx());
    await chain.generateReply(convoCtx());
    expect(chain.tracker.summary()).toBe('mixed');
  });

  it('is pure Demo Mode when no AI provider is supplied', async () => {
    const chain = new FallbackConversationProvider(null, new DemoConversationProvider(0));
    await chain.generateReply(convoCtx());
    expect(chain.tracker.summary()).toBe('demo');
    expect(chain.getName()).toMatch(/demo/i);
  });
});

describe('turn evaluator fallback', () => {
  it('falls back to deterministic evaluation and says so', async () => {
    const chain = new FallbackRealTimeEvaluatorProvider(
      new FailingEvaluator(),
      new DemoRealTimeEvaluatorProvider(),
    );
    const result = await chain.evaluate(evalCtx());

    // Signals still arrive, so deterministic scoring proceeds unchanged.
    expect(result.signals.asked_open_question).toBe(true);
    expect(chain.tracker.summary()).toBe('demo');
    expect(chain.lastFallbackReason).toMatch(/deterministic scoring/i);
  });

  it('uses AI evaluation when available', async () => {
    const working: RealTimeEvaluatorProvider = {
      getName: () => 'AI Evaluation',
      isAvailable: () => true,
      evaluate: async () => ({
        signals: { ...(await new DemoRealTimeEvaluatorProvider().evaluate(evalCtx())).signals },
        brief_feedback: 'ai feedback',
        recommended_next_move: 'ai move',
        detected_stage: 'discovery',
      }),
    };
    const chain = new FallbackRealTimeEvaluatorProvider(working, new DemoRealTimeEvaluatorProvider());
    const result = await chain.evaluate(evalCtx());
    expect(result.brief_feedback).toBe('ai feedback');
    expect(chain.tracker.summary()).toBe('ai');
  });
});

describe('final evaluator fallback', () => {
  it('still produces a report when the AI review fails', async () => {
    const chain = new FallbackFinalEvaluatorProvider(
      new FailingFinal(),
      new DemoFinalEvaluatorProvider(),
    );
    const report = await chain.evaluate(finalCtx());

    // A valid deterministic report is produced; strengths are evidence-based
    // (0–3), so an empty-history context legitimately yields none.
    expect(Array.isArray(report.strengths)).toBe(true);
    expect(report.strengths.length).toBeLessThanOrEqual(3);
    expect(chain.tracker.summary()).toBe('demo');
    expect(chain.lastFallbackReason).toMatch(/deterministic report/i);
  });
});

describe('capability independence', () => {
  it('a failing customer does not force the evaluator to fall back', async () => {
    const convo = new FallbackConversationProvider(new FailingConversation(), new DemoConversationProvider(0));
    const workingEval: RealTimeEvaluatorProvider = {
      getName: () => 'AI Evaluation',
      isAvailable: () => true,
      evaluate: async () => new DemoRealTimeEvaluatorProvider().evaluate(evalCtx()),
    };
    const evaluator = new FallbackRealTimeEvaluatorProvider(workingEval, new DemoRealTimeEvaluatorProvider());

    await convo.generateReply(convoCtx());
    await evaluator.evaluate(evalCtx());

    expect(convo.tracker.summary()).toBe('demo');
    expect(evaluator.tracker.summary()).toBe('ai'); // independent
  });
});
