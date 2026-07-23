import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { MockSpeechRecognitionProvider } from '../speech/MockSpeechRecognitionProvider';
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

describe('LiveRoleplay — speech input integration', () => {
  function renderWithSpeech(state: ConversationEngineState, supported = true) {
    const provider = new MockSpeechRecognitionProvider({ supported });
    const onSubmit = vi.fn();
    render(
      <LiveRoleplay
        state={state}
        evaluatorName="Demo evaluator"
        onSubmit={onSubmit}
        onRetry={() => {}}
        onEndCall={() => {}}
        speechProvider={provider}
      />,
    );
    return { provider, onSubmit };
  }

  it('routes recognised text through the same submitSeller path as typing', async () => {
    const state = await runEngine([]);
    const { provider, onSubmit } = renderWithSpeech(state);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start voice input/i }));
    });
    act(() => { provider.emitFinal('How are you currently training reps?'); });
    act(() => { provider.finish(); });

    // Nothing submitted yet — the user must review first.
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    expect(onSubmit).toHaveBeenCalledWith('How are you currently training reps?');
  });

  it('never writes recognised text into the conversation transcript before Send', async () => {
    const state = await runEngine([]);
    const { provider } = renderWithSpeech(state);
    // The transcript message list only — not the surrounding card (which also
    // contains the draft box).
    const transcriptLog = screen.getByRole('log', { name: /conversation transcript/i });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start voice input/i }));
    });
    act(() => { provider.emitFinal('Not in the transcript yet.'); });

    expect(within(transcriptLog).queryByText(/Not in the transcript yet/i)).toBeNull();
    // It lives only in the editable draft until the user sends it.
    expect(screen.getByRole('textbox', { name: /your response/i })).toHaveValue(
      'Not in the transcript yet.',
    );
  });

  it('disables the microphone while the engine is evaluating', async () => {
    const state = { ...(await runEngine([])), status: 'Evaluating' as const };
    renderWithSpeech(state);
    expect(screen.getByRole('button', { name: /start voice input/i })).toBeDisabled();
  });

  it('disables the microphone while the customer reply is generating', async () => {
    const state = { ...(await runEngine([])), status: 'GeneratingReply' as const };
    renderWithSpeech(state);
    expect(screen.getByRole('button', { name: /start voice input/i })).toBeDisabled();
  });

  it('disables the microphone once the call is completed', async () => {
    const state = { ...(await runEngine([])), status: 'Completed' as const };
    renderWithSpeech(state);
    expect(screen.getByRole('button', { name: /start voice input/i })).toBeDisabled();
  });

  it('keeps typed input working when speech is unsupported', async () => {
    const state = await runEngine([]);
    const { onSubmit } = renderWithSpeech(state, false);

    const box = screen.getByRole('textbox', { name: /your response/i });
    expect(box).not.toBeDisabled();
    fireEvent.change(box, { target: { value: 'Typed even without speech.' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    expect(onSubmit).toHaveBeenCalledWith('Typed even without speech.');
  });
});

describe('LiveRoleplay — live scoring UI', () => {
  // The live score now reads as a single "Conversation health" indicator
  // rather than one tile among six equal metric bars.
  function overallTileValue(): string {
    const block = screen.getByText('Conversation health').parentElement as HTMLElement;
    return within(block).getByText(/^\d+$/).textContent ?? '';
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
    expect(screen.getByText('Coaching')).toBeInTheDocument();
    expect(screen.getByText('Next move')).toBeInTheDocument();
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
    const img = screen.getByRole('img', { name: /score trend/i });
    expect(img.getAttribute('aria-label')).toMatch(/score trend/i);
  });
});
