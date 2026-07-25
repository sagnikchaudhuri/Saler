import type { EvaluatorResult } from '../types';
import type { EvaluationContext, RealTimeEvaluatorProvider } from './types';
import { detectSignals } from './detect';
import {
  detectStageFromSignals,
  pickFeedback,
  pickNextMove,
} from './summarize';

/**
 * Deterministic, offline evaluator. Analyses each seller turn with keyword /
 * phrase cues, sentence structure, transcript context, the customer's latest
 * statement, the current stage, objections raised, turn length, and similarity
 * to previous turns. No randomness. Powers live scoring in Demo Mode.
 */
export class DemoRealTimeEvaluatorProvider implements RealTimeEvaluatorProvider {
  getName(): string {
    return 'Demo (deterministic evaluator)';
  }

  isAvailable(): boolean {
    return true;
  }

  async evaluate(ctx: EvaluationContext): Promise<EvaluatorResult> {
    const signals = detectSignals(ctx);
    return {
      signals,
      brief_feedback: pickFeedback(signals),
      recommended_next_move: pickNextMove(ctx, signals),
      detected_stage: detectStageFromSignals(ctx, signals),
    };
  }
}
