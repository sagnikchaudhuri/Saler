import type { CapabilityMode } from '../persistence/types';

// ============================================================================
// Honest provider labelling.
//
// A configured key proves nothing about whether the model actually answered.
// These labels distinguish "configured" from "verified by a real response",
// so the UI can never imply live AI that has not happened. They expose no
// quota, billing, or secret detail.
// ============================================================================

export type CustomerStatus =
  | 'demo-only'   // no AI configured at all
  | 'configured'  // AI configured, no successful response yet
  | 'active'      // at least one successful AI response
  | 'fallback'    // configured, but every turn so far fell back
  | 'mixed';      // some AI turns, some fallbacks

export function customerStatus(aiEnabled: boolean, mode: CapabilityMode): CustomerStatus {
  if (!aiEnabled) return 'demo-only';
  if (mode === 'ai') return 'active';
  if (mode === 'mixed') return 'mixed';
  if (mode === 'demo') return 'fallback';
  return 'configured'; // 'none' — nothing has run yet
}

const LABELS: Record<CustomerStatus, string> = {
  'demo-only': 'Demo customer',
  configured: 'Configured, not yet verified',
  active: 'AI active',
  fallback: 'Demo Mode (AI unavailable)',
  mixed: 'AI with Demo fallback',
};

/** Short label for the readiness row and session details. */
export function customerStatusLabel(aiEnabled: boolean, mode: CapabilityMode): string {
  return LABELS[customerStatus(aiEnabled, mode)];
}
