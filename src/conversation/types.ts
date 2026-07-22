import type { SalesStage, TranscriptTurn } from '../types';

// ============================================================================
// Conversation domain types.
//
// These describe the "backbone" of a roleplay: the state machine, the customer
// memory, and the provider abstraction that both the Demo and (future) LLM
// providers implement. Kept UI-framework-agnostic so the engine is unit
// testable without React.
// ============================================================================

/** The conversation state machine. No speech states yet (added in Phase 5). */
export type ConversationStatus =
  | 'Idle'
  | 'GeneratingReply'
  | 'WaitingForSeller'
  | 'Evaluating'
  | 'Completed'
  | 'Error';

/**
 * The six objections Rohan can raise, keyed for de-duplication.
 * The value is the natural-language line shown in reports.
 */
export const OBJECTIONS = {
  already_mock_calls: 'We already conduct internal mock calls.',
  generic_chatbot: 'How is this different from a generic AI chatbot?',
  sensitive_info: 'Our sales conversations contain sensitive information.',
  prove_performance: 'How can we prove this improves sales performance?',
  adoption: 'Will managers and representatives actually adopt it?',
  implementation_work: 'Implementation sounds like additional work.',
} as const;

export type ObjectionKey = keyof typeof OBJECTIONS;

/**
 * What the customer "remembers" across the call. The engine owns this and
 * updates it after every seller turn; the persona reads it to stay consistent
 * and avoid repeating himself.
 */
export interface CustomerMemory {
  /** How many messages the seller has sent. */
  sellerTurns: number;
  /** 0–100 warmth. Starts low; only rises when the seller performs well. */
  receptiveness: number;
  /** Notable things the seller has said, so Rohan can reference them later. */
  facts: string[];
  /** True once the seller has genuinely explored the current process. */
  askedAboutProcess: boolean;
  /** True once the seller has quantified impact (numbers, time, cost). */
  quantifiedValue: boolean;
  /** Objections the seller has made a real attempt to answer. */
  addressedObjections: ObjectionKey[];
}

/** Everything a provider needs to generate the next customer reply. */
export interface ConversationContext {
  scenarioId: string;
  transcript: TranscriptTurn[];
  memory: CustomerMemory;
  stage: SalesStage;
  objectionsRaised: ObjectionKey[];
  sellerMessage: string;
}

/**
 * The structured result a provider returns. Only `message` is required; the
 * other fields let the engine update memory, stage, and objection tracking
 * deterministically.
 */
export interface ProviderReply {
  message: string;
  /** A new objection raised this turn (must not already be in context). */
  raisedObjection?: ObjectionKey;
  /** An objection the seller successfully addressed this turn. */
  addressedObjection?: ObjectionKey;
  /** Change to apply to receptiveness (clamped 0–100 by the engine). */
  receptivenessDelta?: number;
  /** The stage the conversation has moved into, if it changed. */
  stageHint?: SalesStage;
  /** A fact worth remembering (stored in customer memory). */
  rememberedFact?: string;
  /** True when Rohan agrees to a product demo (the seller's win condition). */
  agreedToNextStep?: boolean;
}

/**
 * The provider abstraction. DemoConversationProvider and
 * LLMConversationProvider implement exactly this interface, so the engine and
 * UI never care which one is active.
 */
export interface ConversationProvider {
  getName(): string;
  /** Whether this provider can currently be used. */
  isAvailable(): boolean;
  /** The customer's opening line when the call starts. */
  getOpeningLine(): string;
  /** Generate the customer's next reply for the given context. */
  generateReply(ctx: ConversationContext): Promise<ProviderReply>;
}

/** Starting memory for a fresh call. Rohan begins sceptical (low warmth). */
export function createInitialMemory(): CustomerMemory {
  return {
    sellerTurns: 0,
    receptiveness: 30,
    facts: [],
    askedAboutProcess: false,
    quantifiedValue: false,
    addressedObjections: [],
  };
}
