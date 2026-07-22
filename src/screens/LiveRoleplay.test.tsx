import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LiveRoleplay } from './LiveRoleplay';
import { ConversationEngine, type ConversationEngineState } from '../conversation/engine';
import { DemoConversationProvider } from '../conversation/DemoConversationProvider';
import { DemoRealTimeEvaluatorProvider } from '../evaluation/DemoRealTimeEvaluatorProvider';
import type { EvaluationContext, RealTimeEvaluatorProvider } from '../evaluation/types';
import type { EvaluatorResult } from '../types';

class ThrowingEvaluator implements RealTimeEvaluatorProvider {
  getName() { return 'throwing'; }
  isAvailable() { return true; }
  async evaluate(_ctx: EvaluationContext): Promise<EvaluatorResult> {
    throw new Error('down');
  }
}

async function runEngine(messages: string[], evaluator?: RealTimeEvaluatorProvider) {
  const engine = new ConversationEngine(
    new DemoConversationProvider(0),
    { scenarioId: 't', demoMode: true, now: () => 1 },
    evaluator ?? new DemoRealTimeEvaluatorProvider(),
  );
  engine.start();
  for (const m of messages) await engine.submitSeller(m);
  return engine.getState();
}

function renderLive(state: ConversationEngineState) {
  return render(
    <LiveRoleplay
      state={state}
      evaluatorName="Demo evaluator"
      onSubmit={() => {}}
      onRetry={() => {}}
      onEndCall={() => {}}
    />,
  );
}

describe('LiveRoleplay — live scoring UI', () => {
  // The Overall value lives in the tile whose label is "Overall".
  function overallTileValue(): string {
    const tile = screen.getByText('Overall').parentElement as HTMLElement;
    // The value is the large number in the same tile.
    return within(tile).getByText(/^\d+$/).textContent ?? '';
  }

  it('shows Objection Handling as "Not yet assessed" before any objection', async () => {
    const state = await runEngine([]);
    renderLive(state);
    expect(screen.getByText('Not yet assessed')).toBeInTheDocument();
    // Initial overall computed from initial metrics.
    expect(overallTileValue()).toBe('44');
  });

  it('updates the live overall score after a seller turn', async () => {
    const s0 = await runEngine([]);
    const s1 = await runEngine(['How are you currently training your new reps?']);
    expect(s1.scoreState.visibleOverall).toBeGreaterThan(s0.scoreState.visibleOverall);

    renderLive(s1);
    expect(overallTileValue()).toBe(String(s1.scoreState.visibleOverall));
  });

  it('renders brief feedback and a recommended next move', async () => {
    const state = await runEngine(['How are you currently training your new reps?']);
    renderLive(state);
    expect(screen.getByText(/Coaching:/)).toBeInTheDocument();
    expect(screen.getByText(/Next move:/)).toBeInTheDocument();
    expect(screen.getByText(/Good discovery question/i)).toBeInTheDocument();
  });

  it('renders a non-blocking evaluator warning when the evaluator falls back', async () => {
    const state = await runEngine(['How do you train reps today?'], new ThrowingEvaluator());
    expect(state.evaluatorWarning).toBeTruthy();
    renderLive(state);
    // "temporarily unavailable" is unique to the warning banner.
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders an accessible score trend chart', async () => {
    const state = await runEngine(['How do you currently onboard reps?']);
    renderLive(state);
    const img = screen.getByRole('img');
    expect(img.getAttribute('aria-label')).toMatch(/score trend/i);
  });
});
