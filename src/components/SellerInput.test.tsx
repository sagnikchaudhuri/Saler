import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SellerInput } from './SellerInput';
import { MockSpeechRecognitionProvider } from '../speech/MockSpeechRecognitionProvider';

function renderInput(
  opts: { supported?: boolean; canSend?: boolean; inputError?: string | null } = {},
) {
  const provider = new MockSpeechRecognitionProvider({ supported: opts.supported ?? true });
  const onSubmit = vi.fn();
  render(
    <SellerInput
      canSend={opts.canSend ?? true}
      inputError={opts.inputError ?? null}
      onSubmit={onSubmit}
      speechProvider={provider}
    />,
  );
  return { provider, onSubmit };
}

// The mic button's accessible name reflects availability, so match either form.
const speakButton = () =>
  screen.getByRole('button', { name: /start voice input|voice input unavailable/i });
const draftBox = () => screen.getByRole('textbox', { name: /your response/i });

describe('SellerInput — typed input', () => {
  it('always allows typing and sends through the shared submit path', () => {
    const { onSubmit } = renderInput();
    fireEvent.change(draftBox(), { target: { value: 'How do you train reps?' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    expect(onSubmit).toHaveBeenCalledWith('How do you train reps?');
  });

  it('sends on Enter and keeps Shift+Enter for a new line', () => {
    const { onSubmit } = renderInput();
    fireEvent.change(draftBox(), { target: { value: 'typed' } });
    fireEvent.keyDown(draftBox(), { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(draftBox(), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('typed');
  });

  it('shows a conversation input error', () => {
    renderInput({ inputError: 'Please type a message before sending.' });
    expect(screen.getByText(/please type a message/i)).toBeInTheDocument();
  });

  it('disables input while the conversation is busy', () => {
    renderInput({ canSend: false });
    expect(draftBox()).toBeDisabled();
    expect(screen.getByRole('button', { name: /^send$/i })).toBeDisabled();
    expect(speakButton()).toBeDisabled();
  });
});

describe('SellerInput — unsupported browsers', () => {
  it('explains that voice is unavailable but typing still works', () => {
    renderInput({ supported: false });
    expect(screen.getByText(/Speech recognition is unavailable in this browser/i)).toBeInTheDocument();
    expect(speakButton()).toBeDisabled();
    // Typing is unaffected.
    expect(draftBox()).not.toBeDisabled();
  });

  it('labels the disabled microphone accessibly', () => {
    renderInput({ supported: false });
    expect(
      screen.getByRole('button', { name: /voice input unavailable in this browser/i }),
    ).toBeInTheDocument();
  });
});

describe('SellerInput — listening flow', () => {
  it('shows listening status and interim text, then an editable draft', async () => {
    const { provider } = renderInput();
    await act(async () => { fireEvent.click(speakButton()); });

    expect(screen.getByText('Listening')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /stop listening/i })).toBeInTheDocument();

    act(() => { provider.emitInterim('how are you currently'); });
    expect(screen.getByText(/Heard so far: how are you currently/i)).toBeInTheDocument();

    act(() => { provider.emitFinal('How are you currently training reps?'); });
    expect(draftBox()).toHaveValue('How are you currently training reps?');
  });

  it('never submits recognised text automatically', async () => {
    const { provider, onSubmit } = renderInput();
    await act(async () => { fireEvent.click(speakButton()); });
    act(() => { provider.emitFinal('Recognised sentence.'); });
    act(() => { provider.finish(); });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(draftBox()).toHaveValue('Recognised sentence.');
  });

  it('lets the user correct the recognised text before sending', async () => {
    const { provider, onSubmit } = renderInput();
    await act(async () => { fireEvent.click(speakButton()); });
    act(() => { provider.emitFinal('How do you train reps'); });
    act(() => { provider.finish(); });

    fireEvent.change(draftBox(), { target: { value: 'How do you train new reps?' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    expect(onSubmit).toHaveBeenCalledWith('How do you train new reps?');
  });

  it('cancel discards what was heard without submitting', async () => {
    const { provider, onSubmit } = renderInput();
    await act(async () => { fireEvent.click(speakButton()); });
    act(() => { provider.emitInterim('partial words'); });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /cancel voice input/i }));
    });
    expect(screen.queryByText(/Heard so far/i)).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(draftBox()).toHaveValue('');
  });

  it('offers a clear-draft control once there is text', async () => {
    const { provider } = renderInput();
    await act(async () => { fireEvent.click(speakButton()); });
    act(() => { provider.emitFinal('Some recognised text.'); });

    const clear = screen.getByRole('button', { name: /clear the draft/i });
    fireEvent.click(clear);
    expect(draftBox()).toHaveValue('');
  });

  it('stops the session and keeps the recognised text', async () => {
    const { provider } = renderInput();
    await act(async () => { fireEvent.click(speakButton()); });
    act(() => { provider.emitFinal('Kept text.'); });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /stop listening/i }));
    });
    expect(draftBox()).toHaveValue('Kept text.');
    expect(screen.getByText('Microphone ready')).toBeInTheDocument();
  });
});

describe('SellerInput — errors', () => {
  it('shows a friendly permission-denied message', async () => {
    const { provider } = renderInput();
    await act(async () => { fireEvent.click(speakButton()); });
    act(() => { provider.emitError('not-allowed'); });

    expect(screen.getByText(/Microphone access was blocked/i)).toBeInTheDocument();
    expect(speakButton()).toBeDisabled(); // no repeated prompting
    expect(draftBox()).not.toBeDisabled(); // typing still fine
  });

  it('lets the user retry after no-speech', async () => {
    const { provider } = renderInput();
    await act(async () => { fireEvent.click(speakButton()); });
    act(() => { provider.emitError('no-speech'); });
    expect(screen.getByText(/didn't catch anything/i)).toBeInTheDocument();
    expect(speakButton()).not.toBeDisabled();
  });

  it('does not show a scary error after an intentional cancel', async () => {
    const { provider } = renderInput();
    await act(async () => { fireEvent.click(speakButton()); });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /cancel voice input/i }));
    });
    act(() => { provider.emitError('aborted'); });
    expect(screen.queryByText(/problem/i)).toBeNull();
  });
});
