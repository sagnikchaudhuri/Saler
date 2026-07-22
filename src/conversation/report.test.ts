import { describe, it, expect } from 'vitest';
import { ConversationEngine } from './engine';
import { DemoConversationProvider } from './DemoConversationProvider';
import { buildDemoReport } from './report';

async function runShortCall() {
  const engine = new ConversationEngine(new DemoConversationProvider(), {
    scenarioId: 'test',
    demoMode: true,
    now: () => 42,
  });
  engine.start();
  await engine.submitSeller('How do you currently onboard and train new reps?');
  await engine.submitSeller('How long until a new rep is fully productive today?');
  await engine.submitSeller('That is a lot of manager hours — what does that cost you?');
  engine.endCall();
  return engine;
}

describe('buildDemoReport (End Call flow)', () => {
  it('produces a deterministic placeholder report after End Call', async () => {
    const engine = await runShortCall();
    const report = buildDemoReport(engine.getState());

    expect(report.placeholder).toBe(true);
    expect(report.demoMode).toBe(true);
    expect(report.strengths).toHaveLength(3);
    expect(report.missedOpportunities).toHaveLength(3);
  });

  it('clamps all headline and category scores to 0–100', async () => {
    const engine = await runShortCall();
    const r = buildDemoReport(engine.getState());
    const values = [
      r.overallFinal,
      r.liveAverage,
      r.transcriptEval,
      ...Object.values(r.categoryScores),
    ];
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('maps raised objections and their handled status', async () => {
    const engine = await runShortCall();
    const r = buildDemoReport(engine.getState());
    // Every reported objection was actually raised in the conversation.
    for (const o of r.objections) {
      expect(engine.getState().objectionsRaised).toContain(o.key);
      expect(typeof o.handled).toBe('boolean');
    }
  });

  it('is deterministic: identical calls produce identical reports', async () => {
    const a = buildDemoReport((await runShortCall()).getState());
    const b = buildDemoReport((await runShortCall()).getState());
    expect(a).toEqual(b);
  });
});
