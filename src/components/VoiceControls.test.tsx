import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceControls } from './VoiceControls';
import type { UseVoiceOutput } from '../hooks/useVoiceOutput';

function makeVoice(over: Partial<UseVoiceOutput> = {}): UseVoiceOutput {
  return {
    providerName: 'Browser Voice',
    state: 'idle',
    isPreparing: false,
    isSpeaking: false,
    warning: null,
    speakCustomerTurn: vi.fn(),
    stop: vi.fn(),
    retryLast: vi.fn(),
    awaitingUserPlay: false,
    isVoiceEnabled: true,
    setVoiceEnabled: vi.fn(),
    ...over,
  };
}

describe('VoiceControls', () => {
  it('shows which provider is actually being heard', () => {
    render(<VoiceControls voice={makeVoice({ providerName: 'ElevenLabs Voice' })} />);
    expect(screen.getByText('ElevenLabs Voice')).toBeInTheDocument();
  });

  it('labels Silent Mode honestly', () => {
    render(<VoiceControls voice={makeVoice({ providerName: 'Silent Mode' })} />);
    expect(screen.getByText('Silent Mode')).toBeInTheDocument();
  });

  it('shows the preparing state', () => {
    render(<VoiceControls voice={makeVoice({ isPreparing: true, state: 'preparing' })} />);
    expect(screen.getByText('Preparing voice…')).toBeInTheDocument();
  });

  it('shows the speaking state with a stop control', () => {
    const stop = vi.fn();
    render(<VoiceControls voice={makeVoice({ isSpeaking: true, state: 'speaking', stop })} />);
    expect(screen.getByText('Rohan is speaking…')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /stop the customer voice/i }));
    expect(stop).toHaveBeenCalled();
  });

  it('hides the stop control when nothing is playing', () => {
    render(<VoiceControls voice={makeVoice()} />);
    expect(screen.queryByRole('button', { name: /stop the customer voice/i })).toBeNull();
  });

  it('toggles voice on and off', () => {
    const setVoiceEnabled = vi.fn();
    const { rerender } = render(<VoiceControls voice={makeVoice({ setVoiceEnabled })} />);
    fireEvent.click(screen.getByRole('button', { name: /turn customer voice off/i }));
    expect(setVoiceEnabled).toHaveBeenCalledWith(false);

    rerender(<VoiceControls voice={makeVoice({ isVoiceEnabled: false, setVoiceEnabled })} />);
    expect(screen.getByText('Voice off')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /turn customer voice on/i }));
    expect(setVoiceEnabled).toHaveBeenCalledWith(true);
  });

  it('offers manual playback when autoplay was blocked', () => {
    const retryLast = vi.fn();
    render(
      <VoiceControls
        voice={makeVoice({
          awaitingUserPlay: true,
          warning: 'Your browser blocked automatic audio.',
          retryLast,
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /play the customer response/i }));
    expect(retryLast).toHaveBeenCalled();
  });

  it('shows a non-blocking fallback warning', () => {
    render(
      <VoiceControls
        voice={makeVoice({
          providerName: 'Silent Mode',
          warning: 'Voice output is unavailable. The customer response is still available in the transcript.',
        })}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/still available in the transcript/i);
  });
});
