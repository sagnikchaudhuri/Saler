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
  // R is the call-log system: every completed call, kept locally.
  { id: 'R', letter: 'R', label: 'Report Logs', name: 'Report Logs' },
];

export const SECTION_ORDER: SectionId[] = SECTIONS.map((s) => s.id);

/**
 * Anything the navigation can point at. `HOME` is the Saler landing page — a
 * destination, not a section, so it has no conversation state of its own.
 */
export type NavTarget = SectionId | 'HOME';

export interface NavItem {
  id: NavTarget;
  letter: string;
  label: string;
  name: string;
}

/**
 * The compact navbar. Its leading S is Home, NOT Scenario: inside the
 * application the brand mark doubles as the way back to the landing page, and
 * Scenario is reached from there (or from the report's "Back to Briefing").
 * Overloading one letter with both meanings would make the accessible name a
 * lie in one of the two cases.
 */
export const NAV_ITEMS: NavItem[] = [
  { id: 'HOME', letter: 'S', label: 'Home', name: 'Home' },
  ...SECTIONS.filter((s) => s.id !== 'S'),
];

/** Per-letter shadow character (see spec: each letter casts a distinct shape). */
export const LETTER_SHADOW: Record<SectionId, string> = {
  S: 'translate(0.06em, 0.16em)', // wide foundation
  A: 'translate(0.10em, 0.12em)', // opening gateway
  L: 'translate(0.03em, 0.20em)', // vertical beam
  E: 'translate(0.09em, 0.14em)', // layered
  R: 'translate(0.11em, 0.15em)', // stacked documents
};
