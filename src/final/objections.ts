import { OBJECTIONS } from '../conversation/types';
import type { FinalEvaluationContext, ObjectionResult } from './types';

// ============================================================================
// Objection analysis.
//
// For every objection ACTUALLY raised we attribute the seller's acknowledge /
// clarify / answer / confirm behaviour using the turns that occurred after that
// objection was raised and before the next one. Unraised objections are never
// included, and an objection is never marked "failed" unless it was raised.
//
// HANDLED RULE (documented):
//   - strongly handled: acknowledged AND clarified AND answered AND confirmed
//   - handled:          answered AND (acknowledged OR clarified)
//   - not handled:      ignored, or never answered
// ============================================================================

export type HandledLevel = 'strong' | 'handled' | 'partial' | 'not';

export interface ObjectionAnalysis {
  results: ObjectionResult[];
  /** Per-objection quality 0–100, feeding the objection-handling category. */
  quality: number[];
}

const QUALITY: Record<HandledLevel, number> = {
  strong: 100,
  handled: 80,
  partial: 55,
  not: 20,
};

export function analyzeObjections(ctx: FinalEvaluationContext): ObjectionAnalysis {
  const events = ctx.objectionEvents;
  const results: ObjectionResult[] = [];
  const quality: number[] = [];

  for (let i = 0; i < events.length; i++) {
    const { key, turnRaised } = events[i];
    const nextRaised = events[i + 1]?.turnRaised ?? Infinity;
    // Turns the seller took in response to THIS objection.
    const window = ctx.scoreHistory.filter(
      (h) => h.sellerTurn > turnRaised && h.sellerTurn <= nextRaised,
    );

    const acknowledged = window.some((h) => h.signals.acknowledged_objection);
    const clarified = window.some((h) => h.signals.clarified_objection);
    const answered =
      window.some((h) => h.signals.answered_objection) ||
      ctx.addressedObjections.includes(key);
    const confirmed = window.some((h) => h.signals.confirmed_objection_resolution);

    let level: HandledLevel;
    if (acknowledged && clarified && answered && confirmed) level = 'strong';
    else if (answered && (acknowledged || clarified)) level = 'handled';
    else if (answered) level = 'partial';
    else level = 'not';

    const handled = level === 'strong' || level === 'handled';

    results.push({
      objection: OBJECTIONS[key],
      handled,
      explanation: explain(level, { acknowledged, clarified, answered, confirmed }),
    });
    quality.push(QUALITY[level]);
  }

  return { results, quality };
}

function explain(
  level: HandledLevel,
  f: { acknowledged: boolean; clarified: boolean; answered: boolean; confirmed: boolean },
): string {
  switch (level) {
    case 'strong':
      return 'Fully handled: acknowledged, clarified, answered, and confirmed resolution.';
    case 'handled':
      return `Handled: ${f.acknowledged ? 'acknowledged' : 'clarified'} and gave a substantive answer${f.confirmed ? ', then confirmed' : ''}.`;
    case 'partial':
      return 'Partially handled: answered, but did not acknowledge or clarify the concern first.';
    case 'not':
    default:
      return f.answered
        ? 'Attempted but not resolved.'
        : 'Not handled: the concern was left unanswered.';
  }
}
