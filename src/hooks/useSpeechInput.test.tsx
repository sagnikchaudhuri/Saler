import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpeechInput, appendRecognised } from './useSpeechInput';
import { MockSpeechRecognitionProvider } from '../speech/MockSpeechRecognitionProvider';

function setup(opts: { supported?: boolean; acceptsInput?: boolean } = {}) {
  const provider = new MockSpeechRecognitionProvider({ supported: opts.supported ?? true });
  const view = renderHook(
    ({ acceptsInput }: { acceptsInput: boolean }) =>
      useSpeechInput({ provider, conversationAcceptsInput: acceptsInput }),
    { initialProps: { acceptsInput: opts.acceptsInput ?? true } },
  );
  return { provider, ...view };
}

describe('appendRecognised', () => {
  it('normalises whitespace without stripping punctuation', () => {
    expect(appendRecognised('', '  How   are you?  ')).toBe('How are you?');
  });

  it('appends to manually typed text rather than replacing it', () => {
    expect(appendRecognised('I typed this.', 'And this.')).toBe('I typed this. And this.');
  });

  it('ignores empty additions', () => {
    expect(appendRecognised('keep me', '   ')).toBe('keep me');
  });
});

describe('useSpeechInput — listening lifecycle', () => {
  it('starts and stops a session', async () => {
    const { provider, result } = setup();
    await act(async () => { result.current.startListening(); });
    expect(result.current.isListening).toBe(true);
    expect(provider.startCalls).toBe(1);

    act(() => { result.current.stopListening(); });
    expect(result.current.isListening).toBe(false);
    expect(result.current.state).toBe('stopped');
  });

  it('does not start a second session while listening', async () => {
    const { provider, result } = setup();
    await act(async () => { result.current.startListening(); });
    await act(async () => { result.current.startListening(); });
    expect(provider.startCalls).toBe(1);
  });

  it('shows interim text while listening and clears it when stopped', async () => {
    const { provider, result } = setup();
    await act(async () => { result.current.startListening(); });
    act(() => { provider.emitInterim('how are you currently'); });
    expect(result.current.interim).toBe('how are you currently');

    act(() => { provider.emitFinal('How are you currently training reps?'); });
    act(() => { provider.finish(); });
    expect(result.current.interim).toBe('');
  });

  it('puts final text into the editable draft and never auto-submits', async () => {
    const { provider, result } = setup();
    await act(async () => { result.current.startListening(); });
    act(() => { provider.emitFinal('How do you train reps?'); });

    expect(result.current.draft).toBe('How do you train reps?');
    // The draft is the ONLY destination — nothing is submitted automatically.
    expect(result.current.isListening).toBe(true);
  });

  it('preserves manually typed text when recognition appends', async () => {
    const { provider, result } = setup();
    act(() => { result.current.setDraft('Before speaking.'); });
    await act(async () => { result.current.startListening(); });
    act(() => { provider.emitFinal('After speaking.'); });

    expect(result.current.draft).toBe('Before speaking. After speaking.');
  });

  it('cancel discards interim but keeps the draft', async () => {
    const { provider, result } = setup();
    act(() => { result.current.setDraft('typed words'); });
    await act(async () => { result.current.startListening(); });
    act(() => { provider.emitInterim('partial'); });

    act(() => { result.current.cancelListening(); });
    expect(result.current.interim).toBe('');
    expect(result.current.draft).toBe('typed words');
    expect(result.current.error).toBeNull();
  });

  it('clearDraft empties the draft only when asked', async () => {
    const { result } = setup();
    act(() => { result.current.setDraft('some text'); });
    act(() => { result.current.clearDraft(); });
    expect(result.current.draft).toBe('');
  });
});

describe('useSpeechInput — errors and permissions', () => {
  it('surfaces a permission denial and blocks re-prompting', async () => {
    const { provider, result } = setup();
    await act(async () => { result.current.startListening(); });
    act(() => { provider.emitError('not-allowed'); });

    expect(result.current.error?.code).toBe('not-allowed');
    expect(result.current.permissionBlocked).toBe(true);
    expect(result.current.media.canStartListening).toBe(false);

    // Further start attempts must not re-open the prompt.
    const before = provider.startCalls;
    await act(async () => { result.current.startListening(); });
    expect(provider.startCalls).toBe(before);
  });

  it('keeps the typed draft when recognition fails', async () => {
    const { provider, result } = setup();
    act(() => { result.current.setDraft('typed before failure'); });
    await act(async () => { result.current.startListening(); });
    act(() => { provider.emitError('network'); });

    expect(result.current.draft).toBe('typed before failure');
  });

  it('allows a retry after no-speech and clears the old error', async () => {
    const { provider, result } = setup();
    await act(async () => { result.current.startListening(); });
    act(() => { provider.emitError('no-speech'); });
    expect(result.current.error?.code).toBe('no-speech');
    expect(result.current.permissionBlocked).toBe(false);

    await act(async () => { result.current.startListening(); });
    expect(result.current.error).toBeNull();
    expect(provider.startCalls).toBe(2);
  });

  it('does not raise an error for an intentional cancel', async () => {
    const { result } = setup();
    await act(async () => { result.current.startListening(); });
    act(() => { result.current.cancelListening(); });
    expect(result.current.error).toBeNull();
  });

  it('reports unsupported browsers and refuses to start', async () => {
    const { provider, result } = setup({ supported: false });
    expect(result.current.isSupported).toBe(false);
    expect(result.current.media.canStartListening).toBe(false);
    await act(async () => { result.current.startListening(); });
    expect(provider.startCalls).toBe(0);
  });
});

describe('useSpeechInput — conversation coordination', () => {
  it('cannot start while the conversation is busy', async () => {
    const { provider, result } = setup({ acceptsInput: false });
    expect(result.current.media.canStartListening).toBe(false);
    await act(async () => { result.current.startListening(); });
    expect(provider.startCalls).toBe(0);
  });

  it('aborts an active session when the conversation stops accepting input', async () => {
    const { provider, result, rerender } = setup({ acceptsInput: true });
    await act(async () => { result.current.startListening(); });
    expect(result.current.isListening).toBe(true);

    // e.g. Evaluating / GeneratingReply / End Call
    await act(async () => { rerender({ acceptsInput: false }); });
    expect(provider.abortCalls).toBeGreaterThan(0);
    expect(result.current.isListening).toBe(false);
  });

  it('prepareForSubmit stops recognition and clears interim', async () => {
    const { provider, result } = setup();
    await act(async () => { result.current.startListening(); });
    act(() => { provider.emitInterim('partial text'); });

    act(() => { result.current.prepareForSubmit(); });
    expect(provider.abortCalls).toBeGreaterThan(0);
    expect(result.current.interim).toBe('');
  });

  it('aborts recognition on unmount', async () => {
    const { provider, result, unmount } = setup();
    await act(async () => { result.current.startListening(); });
    unmount();
    expect(provider.abortCalls).toBeGreaterThan(0);
  });
});
