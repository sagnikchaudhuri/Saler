import { BrowserSpeechRecognitionProvider } from './BrowserSpeechRecognitionProvider';
import type { SpeechRecognitionProvider } from './types';

export interface SpeechProviderSelection {
  provider: SpeechRecognitionProvider;
  supported: boolean;
}

/**
 * Create the speech provider for the running environment. The browser provider
 * reports `isSupported() === false` where the API is missing (e.g. Firefox) or
 * the page is not a secure context, and the UI degrades to typed input.
 */
export function createSpeechProvider(): SpeechProviderSelection {
  const provider = new BrowserSpeechRecognitionProvider();
  return { provider, supported: provider.isSupported() };
}
