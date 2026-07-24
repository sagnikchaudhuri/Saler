import type {
  ConversationContext,
  ConversationProvider,
  ObjectionKey,
  ProviderReply,
} from './types';
import type { SalesStage } from '../types';
import { OPENING_LINE } from './persona';
import { ProviderUnavailableError, InvalidProviderResponseError } from './errors';
import { aiFetch } from '../ai/aiFetch';

export interface LLMProviderConfig {
  /**
   * Whether a server-side conversation route is available. Determined by the
   * secret-free /api/ai-status probe — never by reading a key in the browser.
   */
  enabled?: boolean;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const STAGES: SalesStage[] = [
  'opening', 'discovery', 'impact', 'value_mapping', 'objection_handling', 'next_step',
];

/** Model objection vocabulary → the app's internal objection keys. */
const OBJECTION_TYPE_MAP: Record<string, ObjectionKey> = {
  existing_process: 'already_mock_calls',
  differentiation: 'generic_chatbot',
  security: 'sensitive_info',
  roi: 'prove_performance',
  adoption: 'adoption',
  implementation: 'implementation_work',
};

interface CustomerPayload {
  customer_reply: string;
  current_stage: string;
  objection_raised: { raised: boolean; type: string };
  customer_sentiment: string;
  conversation_should_end: boolean;
}

function validate(x: unknown): CustomerPayload | null {
  if (typeof x !== 'object' || x === null) return null;
  const o = x as Record<string, unknown>;
  if (typeof o.customer_reply !== 'string' || o.customer_reply.trim() === '') return null;
  if (typeof o.current_stage !== 'string' || !STAGES.includes(o.current_stage as SalesStage)) return null;
  const obj = o.objection_raised;
  if (typeof obj !== 'object' || obj === null) return null;
  const ob = obj as Record<string, unknown>;
  if (typeof ob.raised !== 'boolean' || typeof ob.type !== 'string') return null;
  if (typeof o.customer_sentiment !== 'string') return null;
  if (typeof o.conversation_should_end !== 'boolean') return null;
  return o as unknown as CustomerPayload;
}

/**
 * AI customer. Talks ONLY to our own `/api/conversation` route — it never sees
 * a model key and never calls an external provider directly.
 *
 * On any failure it throws, and the engine falls back to the deterministic
 * Demo persona for that turn: the roleplay never breaks because a model did.
 */
export class LLMConversationProvider implements ConversationProvider {
  private readonly config: LLMProviderConfig;
  private readonly fetchImpl: typeof fetch;
  /** Cancels an in-flight request when a call ends or restarts. */
  private controller: AbortController | null = null;

  constructor(config: LLMProviderConfig = {}) {
    this.config = config;
    // Default to aiFetch so the capability token is attached to real requests;
    // tests inject their own fetchImpl and bypass it.
    this.fetchImpl = config.fetchImpl ?? aiFetch;
  }

  getName(): string {
    return 'AI Customer';
  }

  isAvailable(): boolean {
    return this.config.enabled === true && typeof this.config.endpoint === 'string';
  }

  getOpeningLine(): string {
    // The opener is fixed so the call always starts identically and costs
    // nothing — the model is only used for genuine replies.
    return OPENING_LINE;
  }

  /** Abort any in-flight generation (End Call, restart, unmount). */
  cancel(): void {
    this.controller?.abort();
    this.controller = null;
  }

  async generateReply(ctx: ConversationContext): Promise<ProviderReply> {
    if (!this.isAvailable()) {
      throw new ProviderUnavailableError('The AI customer is not configured.');
    }

    // Only one request per seller turn; a new turn cancels a stale one.
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 25_000);

    try {
      const response = await this.fetchImpl(this.config.endpoint!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerMessage: ctx.sellerMessage,
          // Bounded context: recent turns only, to control prompt cost.
          transcript: ctx.transcript.slice(-12).map((t) => ({
            speaker: t.speaker === 'seller' ? 'seller' : 'customer',
            message: t.message,
          })),
          objectionsRaised: ctx.objectionsRaised,
          stage: ctx.stage,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ProviderUnavailableError('The AI customer is unavailable.');
      }

      const payload = validate(await response.json());
      if (!payload) throw new InvalidProviderResponseError();

      const raisedKey =
        payload.objection_raised.raised && payload.objection_raised.type !== 'none'
          ? OBJECTION_TYPE_MAP[payload.objection_raised.type]
          : undefined;

      return {
        message: payload.customer_reply.trim(),
        // Only surface an objection the app actually models, and never a repeat.
        raisedObjection:
          raisedKey && !ctx.objectionsRaised.includes(raisedKey) ? raisedKey : undefined,
        stageHint: payload.current_stage as SalesStage,
        agreedToNextStep:
          payload.current_stage === 'next_step' && payload.customer_sentiment === 'receptive',
        receptivenessDelta:
          payload.customer_sentiment === 'receptive'
            ? 8
            : payload.customer_sentiment === 'interested'
              ? 4
              : payload.customer_sentiment === 'resistant'
                ? -3
                : 0,
      };
    } catch (err) {
      if (err instanceof ProviderUnavailableError || err instanceof InvalidProviderResponseError) {
        throw err;
      }
      throw new ProviderUnavailableError('The AI customer is unavailable.');
    } finally {
      clearTimeout(timer);
      if (this.controller === controller) this.controller = null;
    }
  }
}
