import type { Momentum } from '../types';

// ============================================================================
// Deterministic momentum.
//
// RULE (documented): momentum compares the current visible overall score to
// the visible score from two turns earlier — a 3-sample window. If it rose by
// at least MOMENTUM_THRESHOLD points → Improving; fell by at least that →
// Declining; otherwise Stable. Fewer than 3 samples → Stable ("insufficient
// history"). The threshold (3) is > 1 so a single-point fluctuation never
// flips momentum. Momentum is NEVER asked of the evaluator model.
// ============================================================================

export const MOMENTUM_THRESHOLD = 3;
export const MOMENTUM_WINDOW = 3;

/**
 * Compute momentum from the ordered list of visible overall scores
 * (oldest → newest). The newest entry is the current turn.
 */
export function computeMomentum(visibleHistory: number[]): Momentum {
  if (visibleHistory.length < MOMENTUM_WINDOW) return 'Stable';
  const window = visibleHistory.slice(-MOMENTUM_WINDOW);
  const change = window[window.length - 1] - window[0];
  if (change >= MOMENTUM_THRESHOLD) return 'Improving';
  if (change <= -MOMENTUM_THRESHOLD) return 'Declining';
  return 'Stable';
}
