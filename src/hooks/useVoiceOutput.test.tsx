import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoiceOutput } from './useVoiceOutput';
import { MockVoiceProvider } from '../voice/testing/MockVoiceProvider';
import { SilentVoiceProvider } from '../voice/SilentVoiceProvider';
import { FallbackVoiceProvider } from '../voice/FallbackVoiceProvider';
import { VoiceProviderError } from '../voice/errors';
import { createMediaCoordinator } from '../media/MediaCoordinator';
import type { TranscriptTurn } from '../types';

function turn(id: string, speaker: TranscriptTurn['speaker'] = 'customer'): TranscriptTurn {
  return { id, speaker, message: `message ${id}`, stage: 'discovery', timestamp: 1 };
}

function setup(opts: { isLiveCall?: boolean; provider?: MockVoiceProvider } = {}) {
  const provider = opts.provider ?? new MockVoiceProvider({ autoComplete: true });
  const coordinator = createMediaCoordinator();
  const view = renderHook(
    ({ isLiveCall }: { isLiveCall: boolean }) =>
      useVoiceOutput({ coordinator, provider, isLiveCall }),
    { initialProps: { isLiveCall: opts.isLiveCall ?? true } },
  );
  return { provider, coordinator, ...view };
}

describe('useVoiceOutput — speaking new turns', () => {
  it('speaks a new customer turn exactly once', async () => {
    const { provider, result } = setup();
    await act(async () => { result.current.speakCustomerTurn(turn('t1')); });
    expect(provider.spokenTexts).toEqual(['message t1']);
  });

  it('never replays the same turn id (rerender / StrictMode safe)', async () => {
    const { provider, result } = setup();
    await act(async () => { result.current.speakCustomerTurn(turn('t1')); });
    await act(async () => { result.current.speakCustomerTurn(turn('t1')); });
    await act(async () => { result.current.speakCustomerTurn(turn('t1')); });
    expect(provider.spokenTexts).toHaveLength(1);
  });

  it('speaks each distinct new turn', async () => {
    const { provider, result } = setup();
    await act(async () => { result.current.speakCustomerTurn(turn('t1')); });
    await act(async () => { result.current.speakCustomerTurn(turn('t2')); });
    expect(provider.spokenTexts).toEqual(['message t1', 'message t2']);
  });

  it('ignores seller turns', async () => {
    const { provider, result } = setup();
    await act(async () => { result.current.speakCustomerTurn(turn('s1', 'seller')); });
    expect(provider.spokenTexts).toEqual([]);
  });

  it('does not speak when the call is not live (history / report / completed)', async () => {
    const { provider, result } = setup({ isLiveCall: false });
    await act(async () => { result.current.speakCustomerTurn(turn('t1')); });
    expect(provider.spokenTexts).toEqual([]);
  });

  it('stops audio when the call stops being live', async () => {
    const provider = new MockVoiceProvider();
    const { result, rerender } = setup({ provider });
    await act(async () => { result.current.speakCustomerTurn(turn('t1')); });
    await act(async () => { rerender({ isLiveCall: false }); });
    expect(provider.stopCalls).toBeGreaterThan(0);
  });
});

describe('useVoiceOutput — controls', () => {
  it('stop() halts playback', async () => {
    const provider = new MockVoiceProvider();
    const { result } = setup({ provider });
    await act(async () => { result.current.speakCustomerTurn(turn('t1')); });
    act(() => { result.current.stop(); });
    expect(provider.stopCalls).toBeGreaterThan(0);
  });

  it('turning voice off prevents playback and stops current audio', async () => {
    const provider = new MockVoiceProvider({ autoComplete: true });
    const { result } = setup({ provider });
    act(() => { result.current.setVoiceEnabled(false); });
    expect(result.current.isVoiceEnabled).toBe(false);

    await act(async () => { result.current.speakCustomerTurn(turn('t1')); });
    expect(provider.spokenTexts).toEqual([]);
    expect(provider.stopCalls).toBeGreaterThan(0);
  });

  it('re-enabling voice allows subsequent turns', async () => {
    const provider = new MockVoiceProvider({ autoComplete: true });
    const { result } = setup({ provider });
    act(() => { result.current.setVoiceEnabled(false); });
    await act(async () => { result.current.speakCustomerTurn(turn('t1')); });
    act(() => { result.current.setVoiceEnabled(true); });
    await act(async () => { result.current.speakCustomerTurn(turn('t2')); });
    expect(provider.spokenTexts).toEqual(['message t2']);
  });

  it('cancels previous audio before a new turn', async () => {
    const provider = new MockVoiceProvider();
    const { result } = setup({ provider });
    await act(async () => { result.current.speakCustomerTurn(turn('t1')); });
    await act(async () => { result.current.speakCustomerTurn(turn('t2')); });
    expect(provider.stopCalls).toBeGreaterThan(0);
  });

  it('stops audio on unmount', async () => {
    const provider = new MockVoiceProvider();
    const { result, unmount } = setup({ provider });
    await act(async () => { result.current.speakCustomerTurn(turn('t1')); });
    unmount();
    expect(provider.stopCalls).toBeGreaterThan(0);
  });
});

describe('useVoiceOutput — autoplay and failure', () => {
  it('offers manual playback when autoplay is blocked', async () => {
    const provider = new MockVoiceProvider({
      failWith: new VoiceProviderError('blocked', 'autoplay-blocked'),
    });
    const { result } = setup({ provider });
    await act(async () => { result.current.speakCustomerTurn(turn('t1')); });

    expect(result.current.awaitingUserPlay).toBe(true);
    expect(result.current.warning).toMatch(/Play customer response/i);
  });

  it('retryLast replays the blocked turn on explicit user action', async () => {
    const provider = new MockVoiceProvider({
      failWith: new VoiceProviderError('blocked', 'autoplay-blocked'),
    });
    const { result } = setup({ provider });
    await act(async () => { result.current.speakCustomerTurn(turn('t1')); });
    await act(async () => { result.current.retryLast(); });
    // Dedup does not block an explicit retry.
    expect(provider.spokenTexts).toHaveLength(2);
  });

  it('explains Silent Mode even though speak() succeeded', async () => {
    // The chain resolves silently: honest labelling requires a notice.
    const silent = new SilentVoiceProvider();
    const coordinator = createMediaCoordinator();
    const { result } = renderHook(() =>
      useVoiceOutput({ coordinator, provider: silent, isLiveCall: true }),
    );
    await act(async () => { result.current.speakCustomerTurn(turn('t1')); });

    expect(result.current.providerName).toBe('Silent Mode');
    expect(result.current.warning).toMatch(/still available in the transcript/i);
  });

  it('says so when a downgrade to the browser voice occurred', async () => {
    const premium = new MockVoiceProvider({
      name: 'ElevenLabs Voice',
      failWith: new VoiceProviderError('quota', 'quota'),
    });
    const browser = new MockVoiceProvider({ name: 'Browser Voice', autoComplete: true });
    const chain = new FallbackVoiceProvider([premium, browser]);
    const coordinator = createMediaCoordinator();

    const { result } = renderHook(() =>
      useVoiceOutput({ coordinator, provider: chain, isLiveCall: true }),
    );
    await act(async () => { result.current.speakCustomerTurn(turn('t1')); });

    expect(result.current.providerName).toBe('Browser Voice');
    expect(result.current.warning).toMatch(/browser’s built-in voice|browser's built-in voice/i);
  });

  it('shows a non-blocking notice when every provider fails', async () => {
    const provider = new MockVoiceProvider({
      failWith: new VoiceProviderError('nope', 'unavailable'),
    });
    const { result } = setup({ provider });
    await act(async () => { result.current.speakCustomerTurn(turn('t1')); });
    expect(result.current.warning).toMatch(/still available in the transcript/i);
  });
});

describe('useVoiceOutput — media exclusivity', () => {
  it('stops recognition through the coordinator before speaking', async () => {
    const provider = new MockVoiceProvider({ autoComplete: true });
    const coordinator = createMediaCoordinator();
    let active = true;
    let stopped = false;
    coordinator.registerRecognition({
      stop: () => { stopped = true; active = false; },
      isActive: () => active,
    });

    const { result } = renderHook(() =>
      useVoiceOutput({ coordinator, provider, isLiveCall: true }),
    );
    await act(async () => { result.current.speakCustomerTurn(turn('t1')); });

    expect(stopped).toBe(true);
  });

  it('registers itself so other controllers can stop output', async () => {
    const provider = new MockVoiceProvider();
    const { coordinator, result } = setup({ provider });
    await act(async () => { result.current.speakCustomerTurn(turn('t1')); });
    act(() => { coordinator.stopOutput(); });
    expect(provider.stopCalls).toBeGreaterThan(0);
  });

  it('stopAll() stops both directions', async () => {
    const provider = new MockVoiceProvider();
    const coordinator = createMediaCoordinator();
    let recognitionActive = true;
    coordinator.registerRecognition({
      stop: () => { recognitionActive = false; },
      isActive: () => recognitionActive,
    });
    const { result } = renderHook(() =>
      useVoiceOutput({ coordinator, provider, isLiveCall: true }),
    );
    await act(async () => { result.current.speakCustomerTurn(turn('t1')); });

    act(() => { coordinator.stopAll(); });
    expect(provider.stopCalls).toBeGreaterThan(0);
    expect(recognitionActive).toBe(false);
  });
});
