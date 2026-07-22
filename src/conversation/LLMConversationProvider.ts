import type {
  ConversationContext,
  ConversationProvider,
  ProviderReply,
} from './types';
import { OPENING_LINE } from './persona';
import { ProviderUnavailableError } from './errors';

export interface LLMProviderConfig {
  /**
   * Whether a server-side LLM route is configured. This is a NON-SECRET
   * feature flag only — the actual API key lives in a server environment
   * variable and is never exposed to the browser. Until a later phase wires
   * the serverless endpoint, this stays false and the provider is disabled.
   */
  enabled?: boolean;
  /** Path to the serverless conversation endpoint (added in a later phase). */
  endpoint?: string;
}

/**
 * Real-LLM provider. Intentionally DISABLED in Phase 2 — there is no API
 * configuration yet. It implements exactly the same interface as the Demo
 * provider so the engine can switch to it later with zero changes.
 *
 * When enabled (later phase) it will POST the conversation context to a
 * server-side route that holds the key and returns a validated ProviderReply.
 */
export class LLMConversationProvider implements ConversationProvider {
  constructor(private readonly config: LLMProviderConfig = {}) {}

  getName(): string {
    return 'LLM (server-side, disabled until configured)';
  }

  isAvailable(): boolean {
    return this.config.enabled === true && typeof this.config.endpoint === 'string';
  }

  getOpeningLine(): string {
    return OPENING_LINE;
  }

  async generateReply(_ctx: ConversationContext): Promise<ProviderReply> {
    // Guard: never attempt a call while unconfigured.
    throw new ProviderUnavailableError(
      'The LLM provider is not configured yet. Running in Demo Mode.',
    );
  }
}
