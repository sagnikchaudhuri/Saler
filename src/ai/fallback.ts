import type {
  ConversationContext,
  ConversationProvider,
  ProviderReply,
} from '../conversation/types';
import type { EvaluationContext, RealTimeEvaluatorProvider } from '../evaluation/types';
import type { FinalEvaluationContext, FinalEvaluatorProvider, FinalReport } from '../final/types';
import type { EvaluatorResult } from '../types';

// ============================================================================
// Per-capability fallback.
//
// AI Mode is deliberately NOT all-or-nothing: the customer, the turn evaluator,
// and the final review each fall back to their deterministic counterpart
// independently. Each composite records which implementation ACTUALLY handled
// the request so the UI and the saved session can be honest about it.
// ============================================================================

export type CapabilitySource = 'ai' | 'demo';

interface Cancellable {
  cancel?: () => void;
}

/** Tracks what handled each request for a capability. */
export class SourceTracker {
  private last: CapabilitySource | null = null;
  aiCount = 0;
  demoCount = 0;

  record(source: CapabilitySource): void {
    this.last = source;
    if (source === 'ai') this.aiCount += 1;
    else this.demoCount += 1;
  }

  getLast(): CapabilitySource | null {
    return this.last;
  }

  /** 'ai' / 'demo' / 'mixed' across the whole call. */
  summary(): CapabilitySource | 'mixed' | 'none' {
    if (this.aiCount > 0 && this.demoCount > 0) return 'mixed';
    if (this.aiCount > 0) return 'ai';
    if (this.demoCount > 0) return 'demo';
    return 'none';
  }
}

export class FallbackConversationProvider implements ConversationProvider {
  readonly tracker = new SourceTracker();
  /** Set when the most recent turn had to fall back. */
  lastFallbackReason: string | null = null;

  constructor(
    private readonly primary: (ConversationProvider & Cancellable) | null,
    private readonly demo: ConversationProvider,
  ) {}

  getName(): string {
    const last = this.tracker.getLast();
    if (last === 'ai' && this.primary) return this.primary.getName();
    if (last === 'demo') return this.demo.getName();
    return this.primary?.isAvailable() ? this.primary.getName() : this.demo.getName();
  }

  isAvailable(): boolean {
    return true; // the deterministic persona is always there
  }

  getOpeningLine(): string {
    return this.demo.getOpeningLine();
  }

  cancel(): void {
    this.primary?.cancel?.();
  }

  async generateReply(ctx: ConversationContext): Promise<ProviderReply> {
    if (this.primary?.isAvailable()) {
      try {
        const reply = await this.primary.generateReply(ctx);
        this.tracker.record('ai');
        this.lastFallbackReason = null;
        return reply;
      } catch {
        this.lastFallbackReason =
          'The AI customer was unavailable for that turn, so the scripted customer replied instead.';
      }
    }
    const reply = await this.demo.generateReply(ctx);
    this.tracker.record('demo');
    return reply;
  }
}

export class FallbackRealTimeEvaluatorProvider implements RealTimeEvaluatorProvider {
  readonly tracker = new SourceTracker();
  lastFallbackReason: string | null = null;

  constructor(
    private readonly primary: (RealTimeEvaluatorProvider & Cancellable) | null,
    private readonly demo: RealTimeEvaluatorProvider,
  ) {}

  getName(): string {
    const last = this.tracker.getLast();
    if (last === 'ai' && this.primary) return this.primary.getName();
    if (last === 'demo') return this.demo.getName();
    return this.primary?.isAvailable() ? this.primary.getName() : this.demo.getName();
  }

  isAvailable(): boolean {
    return true;
  }

  cancel(): void {
    this.primary?.cancel?.();
  }

  async evaluate(ctx: EvaluationContext): Promise<EvaluatorResult> {
    if (this.primary?.isAvailable()) {
      try {
        const result = await this.primary.evaluate(ctx);
        this.tracker.record('ai');
        this.lastFallbackReason = null;
        return result;
      } catch {
        this.lastFallbackReason =
          'AI evaluation was unavailable for that turn, so deterministic scoring was used.';
      }
    }
    const result = await this.demo.evaluate(ctx);
    this.tracker.record('demo');
    return result;
  }
}

export class FallbackFinalEvaluatorProvider implements FinalEvaluatorProvider {
  readonly tracker = new SourceTracker();
  lastFallbackReason: string | null = null;

  constructor(
    private readonly primary: (FinalEvaluatorProvider & Cancellable) | null,
    private readonly demo: FinalEvaluatorProvider,
  ) {}

  getName(): string {
    const last = this.tracker.getLast();
    if (last === 'ai' && this.primary) return this.primary.getName();
    if (last === 'demo') return this.demo.getName();
    return this.primary?.isAvailable() ? this.primary.getName() : this.demo.getName();
  }

  isAvailable(): boolean {
    return true;
  }

  cancel(): void {
    this.primary?.cancel?.();
  }

  async evaluate(ctx: FinalEvaluationContext): Promise<FinalReport> {
    if (this.primary?.isAvailable()) {
      try {
        const report = await this.primary.evaluate(ctx);
        this.tracker.record('ai');
        this.lastFallbackReason = null;
        return report;
      } catch {
        this.lastFallbackReason =
          'The AI final review was unavailable, so the deterministic report was generated instead.';
      }
    }
    const report = await this.demo.evaluate(ctx);
    this.tracker.record('demo');
    return report;
  }
}
