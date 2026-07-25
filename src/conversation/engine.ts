import type { EvaluatorResult, SalesStage, TranscriptTurn, Speaker } from '../types';
import type {
  ConversationContext,
  ConversationProvider,
  ConversationStatus,
  CustomerMemory,
  ObjectionKey,
  ProviderReply,
} from './types';
import { createInitialMemory, OBJECTIONS } from './types';
import { updateCustomerMemory } from './persona';
import { InvalidProviderResponseError } from './errors';
import type { EvaluationContext, RealTimeEvaluatorProvider } from '../evaluation/types';
import { DemoRealTimeEvaluatorProvider } from '../evaluation/DemoRealTimeEvaluatorProvider';
import { validateEvaluatorResult, safeFallbackResult } from '../evaluation/validate';
import type { ScoreState } from '../scoring/types';
import { createInitialScoreState, applyEvaluation } from '../scoring/session';
import type {
  FinalEvaluationContext,
  FinalEvaluatorProvider,
  FinalReport,
  ObjectionEvent,
} from '../final/types';
import { DemoFinalEvaluatorProvider } from '../final/DemoFinalEvaluatorProvider';
import { validateFinalReport, safeFinalFallback } from '../final/validate';
import type { CapabilityMode, StoredSession } from '../persistence/types';
import { SESSION_SCHEMA_VERSION } from '../persistence/types';

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
  /** Live scoring state (metrics, visible overall, momentum, history). */
  scoreState: ScoreState;
  /** Non-blocking warning shown when the evaluator fell back for a turn. */
  evaluatorWarning: string | null;
  /**
   * Non-blocking notice when a capability changed mid-call (e.g. the AI
   * customer became unavailable and the scripted persona took over).
   */
  capabilityWarning: string | null;
  /** Final post-call report (populated on End Call). */
  finalReport: FinalReport | null;
  /** Average visible overall across the call (populated on End Call). */
  liveAverage: number | null;
  /** The completed, persistable session (populated on End Call). */
  completedSession: StoredSession | null;
}

export interface EngineOptions {
  scenarioId: string;
  demoMode: boolean;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
  /**
   * Reports which implementation actually handled each capability, so the UI
   * and saved session can label AI vs deterministic honestly.
   */
  providerModes?: {
    customer: () => CapabilityMode;
    turnEvaluator: () => CapabilityMode;
    finalReport: () => CapabilityMode;
  };
  /** Reads a one-off "we fell back" message after a request, if any. */
  fallbackNotices?: {
    customer: () => string | null;
    turnEvaluator: () => string | null;
    finalReport: () => string | null;
  };
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
 * Owns the transcript, customer memory, current stage, objections raised, and
 * live scoring state, and drives the state machine:
 *
 *   Idle → (start) → WaitingForSeller
 *   WaitingForSeller → (submit) → Evaluating → GeneratingReply → WaitingForSeller
 *   WaitingForSeller | Evaluating | GeneratingReply | Error → (endCall) → Completed
 *   GeneratingReply → (customer failure) → Error → (retry) → GeneratingReply → …
 *
 * CALL EPOCH — every async step captures the epoch it began in and, after each
 * await, discards its result if the epoch has moved on (a new call started, the
 * call ended, or the engine was disposed). This is why End Call during an
 * in-flight turn can never append a late reply, revive a completed call, or
 * mutate score history after completion. Completed is terminal for a given
 * epoch; only start() (on a fresh engine) opens a new one.
 *
 * EXECUTION ORDER — evaluation runs SEQUENTIALLY before customer generation.
 * Rationale: the evaluator only needs the seller's turn + prior context (not
 * the new customer reply), and running it first guarantees the score reflects
 * the exact pre-reply state. Sequential ordering avoids races on shared state
 * and is trivial to reason about; both steps are local and fast. (With a
 * remote LLM this could be parallelised, since the evaluator's input doesn't
 * depend on the customer reply — but we keep it sequential for consistency.)
 *
 * SEPARATION — evaluator output is NEVER passed into the customer persona.
 * The persona receives only the transcript/context it legitimately needs; the
 * evaluator receives the seller message + latest customer statement. This is
 * why the AI customer can't be "coached" by the scorer.
 *
 * It is framework-agnostic; the React hook simply subscribes to it.
 */
export class ConversationEngine {
  private state: ConversationEngineState;
  private readonly listeners = new Set<Listener>();
  private readonly now: () => number;
  private readonly evaluator: RealTimeEvaluatorProvider;
  private readonly finalEvaluator: FinalEvaluatorProvider;
  private idCounter = 0;
  /** When each objection was raised (for final objection analysis). */
  private objectionEvents: ObjectionEvent[] = [];
  /** Fallback warnings accumulated across the whole call, saved with session. */
  private sessionWarnings: string[] = [];
  /**
   * Monotonic call generation. Bumped whenever the call's identity changes —
   * a new call starts, the call ends, or the engine is disposed. Every async
   * operation captures the epoch it began in and, after each await, discards
   * its result if the epoch has moved on. This is what stops a slow evaluator
   * or customer reply from mutating a call that has already been ended — a
   * plain AbortController is not enough, because mocked and deterministic
   * providers still resolve after an abort.
   */
  private callEpoch = 0;
  /**
   * Stable id for the current call, created once when the call starts. endCall
   * reuses it, so repeated or racing endCall calls resolve to the SAME session
   * id and the hook's save-by-id de-dupe makes persistence structurally
   * idempotent — never dependent on timestamps being unique.
   */
  private callId: string | null = null;
  /**
   * Set when a customer reply failed to generate. retry() regenerates ONLY the
   * reply from this — it never re-appends or re-scores the seller turn.
   */
  private pendingReply: { sellerMessage: string } | null = null;
  /** This turn's evaluator fallback notice, combined at the end of the turn. */
  private pendingEvaluatorNotice: string | null = null;

  constructor(
    private readonly provider: ConversationProvider,
    private readonly options: EngineOptions,
    evaluator?: RealTimeEvaluatorProvider,
    finalEvaluator?: FinalEvaluatorProvider,
  ) {
    this.now = options.now ?? Date.now;
    this.evaluator = evaluator ?? new DemoRealTimeEvaluatorProvider();
    this.finalEvaluator = finalEvaluator ?? new DemoFinalEvaluatorProvider();
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
      scoreState: createInitialScoreState(),
      evaluatorWarning: null,
      capabilityWarning: null,
      finalReport: null,
      liveAverage: null,
      completedSession: null,
    };
  }

  getState(): ConversationEngineState {
    return this.state;
  }

  getProviderName(): string {
    return this.provider.getName();
  }

  getEvaluatorName(): string {
    return this.evaluator.getName();
  }

  getFinalEvaluatorName(): string {
    return this.finalEvaluator.getName();
  }

  /**
   * Read-only view of which implementation has ACTUALLY handled each
   * capability so far. Exposed purely so the UI can label honestly; it does
   * not influence the engine.
   */
  getProviderModes(): {
    customer: CapabilityMode;
    turnEvaluator: CapabilityMode;
    finalReport: CapabilityMode;
  } {
    return {
      customer: this.options.providerModes?.customer() ?? 'demo',
      turnEvaluator: this.options.providerModes?.turnEvaluator() ?? 'demo',
      finalReport: this.options.providerModes?.finalReport() ?? 'demo',
    };
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
    // A new call: fix its identity once and open a fresh epoch.
    const startedAt = this.now();
    this.callId = makeCallId(startedAt);
    this.callEpoch += 1;
    this.pendingReply = null;
    const opening = this.makeTurn('customer', this.provider.getOpeningLine(), 'opening');
    this.setState({
      status: 'WaitingForSeller',
      transcript: [opening],
      stage: 'opening',
      startedAt,
    });
  }

  /**
   * Dispose the engine: bump the epoch so any in-flight continuation is
   * discarded. The hook calls this before replacing the engine on reset.
   */
  dispose(): void {
    this.callEpoch += 1;
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

    // The epoch this turn belongs to. If the call ends (or is disposed) while
    // we await below, the epoch moves and every continuation bails out.
    const epoch = this.callEpoch;

    // Append the seller's turn. The stage recorded is the stage the seller
    // was operating in when they spoke.
    const sellerTurn = this.makeTurn('seller', text, this.state.stage);
    const priorTranscript = this.state.transcript;
    this.setState({
      status: 'Evaluating',
      inputError: null,
      error: null,
      evaluatorWarning: null,
      transcript: [...priorTranscript, sellerTurn],
    });

    // --- 1) EVALUATE (must never block the call) ---
    await this.evaluateAndScore(text, priorTranscript, epoch);
    // End Call may have landed during evaluation: do not touch a finished call.
    if (!this.isCurrent(epoch, 'Evaluating')) return;

    // --- 2) GENERATE the customer reply ---
    await this.generateCustomerReply(text, epoch);
  }

  /**
   * Generate and apply the customer reply for a seller message. Separated from
   * submitSeller so retry() can re-run ONLY this step after a generation
   * failure — without appending or re-scoring the seller turn.
   */
  private async generateCustomerReply(sellerMessage: string, epoch: number): Promise<void> {
    this.setState({ status: 'GeneratingReply' });
    const ctx: ConversationContext = {
      scenarioId: this.options.scenarioId,
      // Persona sees the transcript BEFORE this reply, its own memory, stage,
      // and objections — but never the evaluator's signals or feedback.
      transcript: this.state.transcript,
      memory: this.state.memory,
      stage: this.state.stage,
      objectionsRaised: this.state.objectionsRaised,
      sellerMessage,
    };

    let reply: ProviderReply;
    try {
      reply = await this.provider.generateReply(ctx);
    } catch (err) {
      // The call may have ended while we were waiting; if so, stay silent.
      if (!this.isCurrent(epoch, 'GeneratingReply')) return;
      this.pendingReply = { sellerMessage };
      this.setState({ status: 'Error', error: safeErrorMessage(err) });
      return;
    }

    // A late reply for a call that has since ended must never be appended.
    if (!this.isCurrent(epoch, 'GeneratingReply')) return;

    if (!reply || typeof reply.message !== 'string' || reply.message.trim() === '') {
      this.pendingReply = { sellerMessage };
      this.setState({
        status: 'Error',
        error: new InvalidProviderResponseError().message,
      });
      return;
    }

    this.pendingReply = null;
    this.applyReply(sellerMessage, reply);
    // Capability warning reflects THIS turn only: show whichever capability
    // fell back (customer or evaluator), and clear it when both succeeded — so
    // a transient blip does not stick for the rest of the call. The permanent
    // record of every fallback still accumulates in sessionWarnings and is
    // saved with the completed session.
    const customerNotice = this.options.fallbackNotices?.customer() ?? null;
    // Record the customer fallback in the permanent history (saved with the
    // session) even though the LIVE warning below is transient.
    if (customerNotice) {
      this.sessionWarnings.push(`Turn ${this.state.memory.sellerTurns}: ${customerNotice}`);
    }
    const combined = customerNotice ?? this.pendingEvaluatorNotice ?? null;
    this.pendingEvaluatorNotice = null;
    this.setState({
      status: 'WaitingForSeller',
      capabilityWarning: combined,
    });
  }

  /**
   * True when a captured epoch is still the live one AND the engine is in the
   * status a continuation expects. Any mismatch means the call moved on (ended,
   * disposed, or restarted) and the stale result must be discarded.
   */
  private isCurrent(epoch: number, expected: ConversationStatus): boolean {
    return this.callEpoch === epoch && this.state.status === expected;
  }

  /**
   * Run the evaluator on the seller's turn and fold the result into the score
   * state. Any failure or invalid response falls back to a safe, no-op result
   * plus a non-blocking warning — the roleplay always continues.
   */
  private async evaluateAndScore(
    sellerMessage: string,
    priorTranscript: TranscriptTurn[],
    epoch: number,
  ): Promise<void> {
    const latestCustomerStatement =
      [...priorTranscript].reverse().find((t) => t.speaker === 'customer')?.message ?? null;
    const previousSellerMessages = priorTranscript
      .filter((t) => t.speaker === 'seller')
      .map((t) => t.message);

    const evalCtx: EvaluationContext = {
      sellerMessage,
      latestCustomerStatement,
      transcript: this.state.transcript,
      stage: this.state.stage,
      objectionsRaised: this.state.objectionsRaised,
      previousSellerMessages,
    };

    let result: EvaluatorResult;
    let warning: string | null = null;
    try {
      const raw = await this.evaluator.evaluate(evalCtx);
      const validated = validateEvaluatorResult(raw);
      if (validated.ok && validated.value) {
        result = validated.value;
      } else {
        result = safeFallbackResult(this.state.stage);
        warning = 'The evaluator returned an invalid response; scoring was skipped for this turn.';
      }
    } catch {
      result = safeFallbackResult(this.state.stage);
      warning = 'Evaluation is temporarily unavailable; scoring was skipped for this turn.';
    }

    // End Call may have landed while the evaluator was running. Never mutate
    // score history after completion — discard this result silently.
    if (!this.isCurrent(epoch, 'Evaluating')) return;

    // A capability downgrade (AI evaluator → deterministic) is not an error;
    // record it honestly without alarming the user.
    const evaluatorNotice = this.options.fallbackNotices?.turnEvaluator() ?? null;
    if (evaluatorNotice) {
      this.sessionWarnings.push(`Turn ${previousSellerMessages.length + 1}: ${evaluatorNotice}`);
    }
    if (warning) this.sessionWarnings.push(`Turn ${previousSellerMessages.length + 1}: ${warning}`);

    const sellerTurnNumber = previousSellerMessages.length + 1;
    const scoreState = applyEvaluation(this.state.scoreState, result, {
      sellerTurn: sellerTurnNumber,
      timestamp: this.now(),
      stage: this.state.stage,
      // Objection weighting activates once an objection has been raised in a
      // prior customer turn (tracked independently of the evaluator).
      objectionActive: this.state.objectionsRaised.length > 0,
    });

    // Remember this turn's evaluator notice so the reply step can combine it
    // with the customer notice and clear the warning if both succeeded.
    this.pendingEvaluatorNotice = evaluatorNotice;
    this.setState({
      scoreState,
      evaluatorWarning: warning,
      capabilityWarning: evaluatorNotice,
    });
  }

  private applyReply(sellerMessage: string, reply: ProviderReply): void {
    const nextStage = reply.stageHint ?? this.state.stage;

    const objectionsRaised =
      reply.raisedObjection && !this.state.objectionsRaised.includes(reply.raisedObjection)
        ? [...this.state.objectionsRaised, reply.raisedObjection]
        : this.state.objectionsRaised;

    const customerTurn = this.makeTurn('customer', reply.message, nextStage);
    const memory = updateCustomerMemory(this.state.memory, sellerMessage, reply);

    // Record WHEN each objection was raised so the final evaluator can
    // attribute the seller's later acknowledge/clarify/answer/confirm turns
    // to the correct objection.
    if (reply.raisedObjection && objectionsRaised !== this.state.objectionsRaised) {
      this.objectionEvents.push({
        key: reply.raisedObjection,
        turnRaised: memory.sellerTurns,
      });
    }

    this.setState({
      transcript: [...this.state.transcript, customerTurn],
      memory,
      stage: nextStage,
      objectionsRaised,
      agreedToNextStep: this.state.agreedToNextStep || reply.agreedToNextStep === true,
    });
  }

  /**
   * Recover from an Error.
   *
   * Retry semantics (documented): if the failure was in generating the customer
   * reply, the already-appended, already-scored seller turn is KEPT and only
   * the reply is regenerated — so retrying never adds a second seller turn and
   * never scores the same message twice. Any other Error (e.g. a start-time
   * failure with nothing pending) simply returns to accepting input.
   *
   *   Error(reply failed) → (retry) → GeneratingReply → WaitingForSeller
   *   Error(other)        → (retry) → WaitingForSeller
   */
  async retry(): Promise<void> {
    if (this.state.status !== 'Error') return;
    const pending = this.pendingReply;
    if (!pending) {
      this.setState({ status: 'WaitingForSeller', error: null });
      return;
    }
    this.setState({ error: null });
    // Regenerate ONLY the reply for the existing seller turn — no re-scoring.
    await this.generateCustomerReply(pending.sellerMessage, this.callEpoch);
  }

  /**
   * End the call and produce the final report + completed session.
   *
   * Sequence: stop accepting input (status Completed blocks submitSeller) →
   * mark completed → run the final evaluator → validate → fall back if needed
   * → compute the live average → build the completed session.
   *
   * Persisting the session is deliberately NOT done here: the engine stays
   * storage-agnostic and the hook writes it through the repository. Repeated,
   * racing, or post-completion endCall calls all return early (or resolve to
   * the same stable call id), so repeated clicks cannot duplicate a session.
   */
  async endCall(): Promise<void> {
    // Idempotent and race-proof: a completed call stays completed, and a call
    // that never started has nothing to end. Combined with the epoch bump
    // below, this guarantees one logical call yields exactly one session.
    if (this.state.status === 'Completed' || this.state.status === 'Idle') return;

    // Bump the epoch FIRST so any in-flight evaluation or reply generation is
    // discarded rather than mutating a completed call.
    this.callEpoch += 1;
    this.pendingReply = null;

    const endedAt = this.now();
    const startedAt = this.state.startedAt ?? endedAt;
    this.setState({ status: 'Completed', endedAt });

    const sellerMessages = this.state.transcript
      .filter((t) => t.speaker === 'seller')
      .map((t) => t.message);
    const history = this.state.scoreState.history;

    // Live average across the call. With no scored turns, fall back to the
    // initial visible score rather than inventing a number.
    const liveAverage =
      history.length > 0
        ? Math.round(history.reduce((sum, h) => sum + h.visibleOverall, 0) / history.length)
        : this.state.scoreState.visibleOverall;

    const finalCtx: FinalEvaluationContext = {
      transcript: this.state.transcript,
      sellerMessages,
      scoreHistory: history,
      objectionEvents: this.objectionEvents,
      addressedObjections: this.state.memory.addressedObjections,
      finalStage: this.state.stage,
      durationMs: Math.max(0, endedAt - startedAt),
      liveAverage,
      agreedToNextStep: this.state.agreedToNextStep,
      sellerTurnCount: sellerMessages.length,
    };

    let finalReport: FinalReport;
    let finalWarning: string | null = null;
    try {
      const raw = await this.finalEvaluator.evaluate(finalCtx);
      const validated = validateFinalReport(raw, {
        sellerMessages: new Set(sellerMessages),
        raisedObjectionLabels: new Set(this.objectionEvents.map((e) => OBJECTIONS[e.key])),
      });
      if (validated.ok && validated.value) {
        finalReport = validated.value;
      } else {
        finalReport = safeFinalFallback(finalCtx);
        finalWarning =
          'The final evaluation was invalid, so a safe summary based on your live scores is shown instead.';
      }
    } catch {
      finalReport = safeFinalFallback(finalCtx);
      finalWarning =
        'The final evaluation was unavailable, so a safe summary based on your live scores is shown instead.';
    }

    const finalNotice = this.options.fallbackNotices?.finalReport() ?? null;
    const fallbackWarnings = [
      ...this.sessionWarnings,
      ...(finalNotice ? [finalNotice] : []),
      ...(finalWarning ? [finalWarning] : []),
    ];

    const completedSession: StoredSession = {
      // Stable id created at start — reused here so a repeated or racing
      // endCall can only ever resolve to this same session.
      id: this.callId ?? makeCallId(startedAt),
      schemaVersion: SESSION_SCHEMA_VERSION,
      date: new Date(endedAt).toISOString(),
      startTime: startedAt,
      endTime: endedAt,
      durationMs: finalCtx.durationMs,
      scenarioId: this.options.scenarioId,
      providerNames: {
        conversation: this.provider.getName(),
        realtimeEvaluator: this.evaluator.getName(),
        finalEvaluator: this.finalEvaluator.getName(),
      },
      // Honest per-capability record of what actually ran during this call.
      providerModes: {
        customer: this.options.providerModes?.customer() ?? 'demo',
        turnEvaluator: this.options.providerModes?.turnEvaluator() ?? 'demo',
        finalReport: this.options.providerModes?.finalReport() ?? 'demo',
      },
      demoMode: this.state.demoMode,
      transcript: this.state.transcript,
      finalStage: this.state.stage,
      objectionsRaised: this.state.objectionsRaised,
      addressedObjections: this.state.memory.addressedObjections,
      scoreHistory: history,
      liveAverage,
      finalReport,
      fallbackWarnings,
      sellerTurnCount: sellerMessages.length,
    };

    this.setState({ finalReport, liveAverage, completedSession });
  }
}

/**
 * Stable call/session id, created ONCE when a call starts. Randomness is fine
 * (it is not part of scoring); the fallback avoids the collisions that a
 * timestamp-only id could produce for two calls in the same millisecond.
 */
function makeCallId(startedAt: number): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `sess-${startedAt}-${Math.floor(Math.random() * 1e9)}`;
}
