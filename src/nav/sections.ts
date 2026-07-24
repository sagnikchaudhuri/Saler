// ============================================================================
// SALER information architecture.
//
// The five letters are five VIEWPOINTS into one shared application, not five
// pages. This module only names them; App owns the single source of truth for
// conversation, evaluation, and persistence. Navigation never restarts state.
// ============================================================================

export type SectionId = 'S' | 'A' | 'L' | 'E' | 'R';

export interface SectionDef {
  id: SectionId;
  letter: string;
  /** Short word shown under the carousel letter. */
  label: string;
  /** Longer name for accessible button labels. */
  name: string;
}

export const SECTIONS: SectionDef[] = [
  { id: 'S', letter: 'S', label: 'Scenario', name: 'Scenario' },
  { id: 'A', letter: 'A', label: 'Ask', name: 'Ask — the conversation' },
  { id: 'L', letter: 'L', label: 'Live', name: 'Live readings' },
  { id: 'E', letter: 'E', label: 'Evaluation', name: 'Evaluation' },
  { id: 'R', letter: 'R', label: 'Review', name: 'Review and report' },
];

export const SECTION_ORDER: SectionId[] = SECTIONS.map((s) => s.id);

/** Per-letter shadow character (see spec: each letter casts a distinct shape). */
export const LETTER_SHADOW: Record<SectionId, string> = {
  S: 'translate(0.06em, 0.16em)', // wide foundation
  A: 'translate(0.10em, 0.12em)', // opening gateway
  L: 'translate(0.03em, 0.20em)', // vertical beam
  E: 'translate(0.09em, 0.14em)', // layered
  R: 'translate(0.11em, 0.15em)', // stacked documents
};
