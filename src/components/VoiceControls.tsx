import { Badge } from './ui';
import type { UseVoiceOutput } from '../hooks/useVoiceOutput';

/**
 * Compact voice-output controls: which provider is actually speaking, the
 * current state, a stop control, a mute toggle, and a manual play action when
 * the browser blocks autoplay. Deliberately minimal — no waveform, equaliser,
 * voice picker, or volume mixer. The transcript remains the source of truth.
 */
export function VoiceControls({ voice }: { voice: UseVoiceOutput }) {
  const statusText = voice.isPreparing
    ? 'Preparing voice…'
    : voice.isSpeaking
      ? 'Rohan is speaking…'
      : null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
      {/* Which voice the user is ACTUALLY hearing. */}
      <Badge tone={voice.providerName === 'Silent Mode' ? 'neutral' : 'accent'}>
        {voice.providerName}
      </Badge>

      {/* State is text, never colour alone. */}
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-secondary" aria-live="polite">
        {(voice.isSpeaking || voice.isPreparing) && (
          <span
            aria-hidden
            className="h-2 w-2 animate-pulse-soft rounded-full bg-accent motion-reduce:animate-none"
          />
        )}
        {statusText ?? (voice.isVoiceEnabled ? 'Voice ready' : 'Voice off')}
      </span>

      {(voice.isSpeaking || voice.isPreparing) && (
        <button
          type="button"
          className="btn-ghost"
          onClick={voice.stop}
          aria-label="Stop the customer voice playback"
        >
          Stop Speaking
        </button>
      )}

      {voice.awaitingUserPlay && (
        <button
          type="button"
          className="btn-primary"
          onClick={voice.retryLast}
          aria-label="Play the customer response"
        >
          ▶ Play customer response
        </button>
      )}

      <button
        type="button"
        className="btn-ghost ml-auto"
        onClick={() => voice.setVoiceEnabled(!voice.isVoiceEnabled)}
        aria-pressed={voice.isVoiceEnabled}
        aria-label={voice.isVoiceEnabled ? 'Turn customer voice off' : 'Turn customer voice on'}
      >
        {voice.isVoiceEnabled ? '🔊 Voice On' : '🔇 Voice Off'}
      </button>

      {voice.warning && (
        <p role="status" className="w-full text-xs text-caution">
          {voice.warning}
        </p>
      )}
    </div>
  );
}
