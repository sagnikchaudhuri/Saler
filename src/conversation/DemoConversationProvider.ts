import type {
  ConversationContext,
  ConversationProvider,
  ProviderReply,
} from './types';
import { OPENING_LINE, selectReply } from './persona';

/**
 * Deterministic, offline provider. Wraps the Rohan Mehta persona so the whole
 * roleplay works with no API key, no network, and no randomness — the backbone
 * of Demo Mode. An optional `delayMs` adds a realistic "typing" pause for the
 * UI; tests use the default of 0 for instant, deterministic runs.
 */
export class DemoConversationProvider implements ConversationProvider {
  constructor(private readonly delayMs = 0) {}

  getName(): string {
    return 'Demo (scripted Rohan Mehta)';
  }

  isAvailable(): boolean {
    return true;
  }

  getOpeningLine(): string {
    return OPENING_LINE;
  }

  async generateReply(ctx: ConversationContext): Promise<ProviderReply> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    return selectReply(ctx);
  }
}
