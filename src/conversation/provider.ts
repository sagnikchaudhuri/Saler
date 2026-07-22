import type { ConversationProvider } from './types';
import { DemoConversationProvider } from './DemoConversationProvider';
import { LLMConversationProvider } from './LLMConversationProvider';

export interface ProviderSelection {
  provider: ConversationProvider;
  /** True when the active provider is the offline Demo persona. */
  demoMode: boolean;
}

export interface CreateProviderConfig {
  /** Non-secret flag: is a server-side LLM route configured? Default false. */
  llmEnabled?: boolean;
  /** Serverless endpoint path for the LLM route (later phase). */
  llmEndpoint?: string;
  /** Realistic typing delay for the Demo provider (0 in tests). */
  demoDelayMs?: number;
}

/**
 * Choose a provider. Prefers the LLM provider when it is genuinely available;
 * otherwise falls back to the always-available Demo provider. This is the one
 * place provider switching happens, which keeps it easy to test.
 */
export function createConversationProvider(
  config: CreateProviderConfig = {},
): ProviderSelection {
  const llm = new LLMConversationProvider({
    enabled: config.llmEnabled,
    endpoint: config.llmEndpoint,
  });
  if (llm.isAvailable()) {
    return { provider: llm, demoMode: false };
  }
  return {
    provider: new DemoConversationProvider(config.demoDelayMs ?? 0),
    demoMode: true,
  };
}
