import { BrowserSpeechSynthesisProvider } from './BrowserSpeechSynthesisProvider';
import { SilentVoiceProvider } from './SilentVoiceProvider';
import { FallbackVoiceProvider } from './FallbackVoiceProvider';
import { ElevenLabsVoiceProvider } from './ElevenLabsVoiceProvider';
import type { VoiceProvider } from './types';

export interface CreateVoiceProviderConfig {
  /**
   * Override the premium provider (tests). By default the real
   * ElevenLabsVoiceProvider is used, which talks only to our secure
   * `/api/speak` route. MockVoiceProvider is test-only and never used here.
   */
  primary?: VoiceProvider;
  /** Set false to skip the premium provider entirely. */
  enablePremium?: boolean;
}

/**
 * Production fallback chain:
 *
 *   ElevenLabsVoiceProvider (when configured)
 *     → BrowserSpeechSynthesisProvider
 *       → SilentVoiceProvider
 *
 * SilentVoiceProvider is always last and always available, so `speak()` can
 * never leave the roleplay in a broken state.
 */
export function createVoiceProvider(
  config: CreateVoiceProviderConfig = {},
): FallbackVoiceProvider {
  const chain: VoiceProvider[] = [];
  if (config.enablePremium !== false) {
    chain.push(config.primary ?? new ElevenLabsVoiceProvider());
  }
  chain.push(new BrowserSpeechSynthesisProvider());
  chain.push(new SilentVoiceProvider());
  return new FallbackVoiceProvider(chain);
}
