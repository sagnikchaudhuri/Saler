import type { SalesStage, TranscriptTurn, Speaker } from '../types';
import type {
  ConversationContext,
  ConversationProvider,
  ConversationStatus,
  CustomerMemory,
  ObjectionKey,
  ProviderReply,
} from './types';
import { createInitialMemory } from './types';
import { updateCustomerMemory } from './persona';
import { InvalidProviderResponseError } from './errors';

/** Maximum characters accepted from the seller in one turn. */
export const MAX_INPUT_LENGTH = 1000;

/** The complete, serialisable state of a conversation. */
export interface ConversationEngineState {
  status: ConversationStatus;
  transcript: TranscriptTurn[];
  memory: CustomerMemory;
  stage: SalesStage;
  objectionsRaised: ObjectionKey[];
  /** True when Rohan has agreed to a demo (the win condition). */
  agreedToNextStep: boolean;
  /** System error message (safe for display), or null. */
  error: string | null;
  /** Validation message for the current input (e.g. empty), or null. */
  inputError: string | null;
  startedAt: number | null;
  endedAt: number | null;
  demoMode: boolean;
}

export interface EngineOptions {
  scenarioId: string;
  demoMode: boolean;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

type Listener = (state: ConversationEngineState) => void;

/** Trim a raw error into a safe, user-facing string. Never leaks internals. */
function safeErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong. Please try again.';
}

/**
 * The Conversation Engine.
 *
 * Owns the transcript, customer memory, current stage, and objections raised,
 * and drives the state machine:
 *
 *   Idle → (start) → WaitingForSeller
 *   WaitingForSeller → (submit) → GeneratingReply → Evaluating → WaitingForSeller
 *   any → (endCall) → Completed
 *   GeneratingReply → (failure) → Error → (retry) → WaitingForSeller
 *
 * It is framework-agnostic; the React hook simply subscribes to it.
 */
export class ConversationEngine {
  private state: ConversationEngineState;
  private readonly listeners = new Set<Listener>();
  private readonly now: () => number;
  private idCounter = 0;

  constructor(
    private readonly provider: ConversationProvider,
    private readonly options: EngineOptions,
  ) {
    this.now = options.now ?? Date.now;
    this.state = {
      status: 'Idle',
      transcript: [],
      memory: createInitialMemory(),
      stage: 'opening',
      objectionsRaised: [],
      agreedToNextStep: false,
      error: null,
      inputError: null,
      startedAt: null,
      endedAt: null,
      demoMode: options.demoMode,
    };
  }

  getState(): ConversationEngineState {
    return this.state;
  }

  getProviderName(): string {
    return this.provider.getName();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(patch: Partial<ConversationEngineState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  private makeTurn(speaker: Speaker, message: string, stage: SalesStage): TranscriptTurn {
    this.idCounter += 1;
    return {
      id: `turn-${this.idCounter}`,
      speaker,
      message,
      stage,
      timestamp: this.now(),
    };
  }

  /** Begin the call: play the customer's opening line. */
  start(): void {
    if (this.state.status !== 'Idle') return;
    if (!this.provider.isAvailable()) {
      this.setState({
        status: 'Error',
        error: 'The conversation service is unavailable.',
      });
      return;
    }
    const opening = this.makeTurn('customer', this.provider.getOpeningLine(), 'opening');
    this.setState({
      status: 'WaitingForSeller',
      transcript: [opening],
      stage: 'opening',
      startedAt: this.now(),
    });
  }

  /** Submit a seller message and generate the customer's reply. */
  async submitSeller(raw: string): Promise<void> {
    if (this.state.status !== 'WaitingForSeller') return;

    // --- input validation (not a system error; stay in WaitingForSeller) ---
    const text = raw.trim();
    if (text.length === 0) {
      this.setState({ inputError: 'Please type a message before sending.' });
      return;
    }
    if (text.length > MAX_INPUT_LENGTH) {
      this.setState({
        inputError: `Message is too long (max ${MAX_INPUT_LENGTH} characters).`,
      });
      return;
    }

    // Append the seller's turn and move to GeneratingReply.
    const sellerTurn = this.makeTurn('seller', text, this.state.stage);
    this.setState({
      status: 'GeneratingReply',
      inputError: null,
      error: null,
      transcript: [...this.state.transcript, sellerTurn],
    });

    // Build the context snapshot the provider needs.
    const ctx: ConversationContext = {
      scenarioId: this.options.scenarioId,
      transcript: this.state.transcript,
      memory: this.state.memory,
      stage: this.state.stage,
      objectionsRaised: this.state.objectionsRaised,
      sellerMessage: text,
    };

    let reply: ProviderReply;
    try {
      reply = await this.provider.generateReply(ctx);
    } catch (err) {
      this.setState({ status: 'Error', error: safeErrorMessage(err) });
      return;
    }

    // Validate the provider response before trusting it.
    if (!reply || typeof reply.message !== 'string' || reply.message.trim() === '') {
      this.setState({
        status: 'Error',
        error: new InvalidProviderResponseError().message,
      });
      return;
    }

    // Evaluating: the engine applies memory/stage/objection updates. (In a
    // later phase this is where the real evaluator runs.)
    this.setState({ status: 'Evaluating' });
    this.applyReply(text, reply);
    this.setState({ status: 'WaitingForSeller' });
  }

  private applyReply(sellerMessage: string, reply: ProviderReply): void {
    const nextStage = reply.stageHint ?? this.state.stage;

    const objectionsRaised =
      reply.raisedObjection && !this.state.objectionsRaised.includes(reply.raisedObjection)
        ? [...this.state.objectionsRaised, reply.raisedObjection]
        : this.state.objectionsRaised;

    const customerTurn = this.makeTurn('customer', reply.message, nextStage);
    const memory = updateCustomerMemory(this.state.memory, sellerMessage, reply);

    this.setState({
      transcript: [...this.state.transcript, customerTurn],
      memory,
      stage: nextStage,
      objectionsRaised,
      agreedToNextStep: this.state.agreedToNextStep || reply.agreedToNextStep === true,
    });
  }

  /** Recover from an Error back to accepting seller input. */
  retry(): void {
    if (this.state.status !== 'Error') return;
    this.setState({ status: 'WaitingForSeller', error: null });
  }

  /** End the call. Transitions to Completed. */
  endCall(): void {
    if (this.state.status === 'Completed') return;
    this.setState({ status: 'Completed', endedAt: this.now() });
  }
}
