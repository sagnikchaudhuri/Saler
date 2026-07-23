import type { ConversationProvider } from './types';
import { DemoConversationProvider } from './DemoConversationProvider';
import { LLMConversationProvider } from './LLMConversationProvider';
import { FallbackConversationProvider } from '../ai/fallback';

export interface ProviderSelection {
  provider: ConversationProvider;
  /** True when no AI customer is configured at all. */
  demoMode: boolean;
  /** Exposed so the engine can read which implementation handled each turn. */
  fallback: FallbackConversationProvider;
}

export interface CreateProviderConfig {
  /** Non-secret flag from the /api/ai-status probe. */
  llmEnabled?: boolean;
  /** Serverless endpoint path. */
  llmEndpoint?: string;
  /** Realistic typing delay for the Demo provider (0 in tests). */
  demoDelayMs?: number;
}

/**
 * Build the conversation provider.
 *
 * When AI is configured the LLM customer is tried first and the deterministic
 * persona catches any failure FOR THAT TURN — the call never breaks because a
 * model did. With no AI configured this is pure Demo Mode, exactly as before.
 */
export function createConversationProvider(
  config: CreateProviderConfig = {},
): ProviderSelection {
  const demo = new DemoConversationProvider(config.demoDelayMs ?? 0);
  const llm =
    config.llmEnabled && config.llmEndpoint
      ? new LLMConversationProvider({
          enabled: true,
          endpoint: config.llmEndpoint,
        })
      : null;

  const fallback = new FallbackConversationProvider(llm, demo);
  return { provider: fallback, demoMode: llm === null, fallback };
}
