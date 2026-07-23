import { BrowserSpeechSynthesisProvider } from './BrowserSpeechSynthesisProvider';
import { SilentVoiceProvider } from './SilentVoiceProvider';
import { FallbackVoiceProvider } from './FallbackVoiceProvider';
import type { VoiceProvider } from './types';

export interface CreateVoiceProviderConfig {
  /**
   * Optional premium provider to try FIRST (ElevenLabs). Supplied only once a
   * server voice route is configured; until then the chain starts at the
   * browser voice. MockVoiceProvider is test-only and is never used here.
   */
  primary?: VoiceProvider;
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
  if (config.primary) chain.push(config.primary);
  chain.push(new BrowserSpeechSynthesisProvider());
  chain.push(new SilentVoiceProvider());
  return new FallbackVoiceProvider(chain);
}
