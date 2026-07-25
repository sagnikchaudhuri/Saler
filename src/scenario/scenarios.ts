import type { ObjectionKey } from '../conversation/types';
import { SALES_SCENARIO } from '../data/scenario';

// ============================================================================
// Curated scenario library — the ONE source of truth for the five calls.
//
// Rohan Mehta is the customer in every scenario (his identity comes from the
// existing SALES_SCENARIO, so it is never duplicated). What varies is the
// business situation, the immutable facts, and which concerns are in play.
// Scenario 1 intentionally mirrors the original single scenario so nothing that
// depended on it changes meaning.
// ============================================================================

/** The concern vocabulary a scenario may put in play. */
export type Concern =
  | 'differentiation'
  | 'adoption'
  | 'security'
  | 'implementation'
  | 'manager_time'
  | 'roi';

/** Public difficulty label shown to the seller. */
export type Difficulty = 'Core' | 'Advanced';

export interface ScenarioDef {
  id: string;
  title: string;
  /** One-line briefing shown before the call. */
  briefing: string;
  customerRole: string;
  companyContext: string;
  sellerObjective: string;
  /** Facts Rohan must stay consistent with; never contradicted. */
  immutableFacts: string[];
  /** Exactly the concerns Rohan may raise in this scenario. */
  allowedConcerns: Concern[];
  /** What a strong outcome looks like (public). */
  successCriteria: string[];
  /** Rohan's opening line for this scenario. */
  defaultOpening: string;
  difficulty: Difficulty;
}

/** Each concern maps to one of the six canonical objection lines. */
export const CONCERN_TO_OBJECTION: Record<Concern, ObjectionKey> = {
  differentiation: 'generic_chatbot',
  adoption: 'adoption',
  security: 'sensitive_info',
  implementation: 'implementation_work',
  manager_time: 'already_mock_calls',
  roi: 'prove_performance',
};

/** Human-readable concern names (for the AI prompt only — never shown to seller). */
export const CONCERN_LABEL: Record<Concern, string> = {
  differentiation: 'how this differs from a generic AI chatbot',
  adoption: 'whether managers and reps will actually adopt it',
  security: 'the security and privacy of sensitive sales data',
  implementation: 'the implementation effort to roll it out',
  manager_time: 'the manager time consumed by the current approach',
  roi: 'proving measurable ROI to leadership',
};

const R = SALES_SCENARIO.customer; // Rohan's shared identity

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'enablement-platform',
    title: 'Sales Enablement Platform',
    briefing:
      'Divika runs enablement for ~150 reps and relies on manager-led mock calls and inconsistent coaching.',
    customerRole: R.role,
    companyContext: `${R.companyType}, ${R.teamSize.toLowerCase()}`,
    sellerObjective:
      'Uncover the coaching-consistency problem, quantify its cost, and earn a demo.',
    immutableFacts: [
      'New reps take three to four months to become fully productive.',
      'Onboarding today is manager-led mock calls, recorded-call reviews, and occasional training.',
      'There are about 150 sales representatives.',
    ],
    allowedConcerns: ['differentiation', 'adoption'],
    successCriteria: ['improve rep consistency', 'reduce coaching load'],
    defaultOpening:
      "Hi, this is Divika Mishra. I've got about ten minutes before my next meeting — what can I do for you?",
    difficulty: 'Core',
  },
  {
    id: 'security-review',
    title: 'Enterprise Security Review',
    briefing:
      'Divika is interested but any AI tool must clear internal IT, privacy, and security review first.',
    customerRole: R.role,
    companyContext: `${R.companyType}, with a formal IT and security review process`,
    sellerObjective:
      'Address security and rollout requirements credibly and earn stakeholder approval to proceed.',
    immutableFacts: [
      'Any new tool must pass internal IT, privacy, and security review.',
      'Sales conversations contain sensitive customer information.',
      'There are about 150 sales representatives.',
    ],
    allowedConcerns: ['security', 'implementation'],
    successCriteria: ['secure rollout', 'gain stakeholder approval'],
    defaultOpening:
      "Divika here. I'll be honest — I like the idea, but anything touching our sales data has to clear security review. Where do you want to start?",
    difficulty: 'Advanced',
  },
  {
    id: 'onboarding-expansion',
    title: 'Sales Onboarding Expansion',
    briefing:
      'The team is growing fast and needs to shorten ramp time without overloading frontline managers.',
    customerRole: R.role,
    companyContext: `${R.companyType}, hiring quickly`,
    sellerObjective:
      'Connect faster ramp and less manager load to a concrete next step.',
    immutableFacts: [
      'Headcount is growing quickly, straining onboarding.',
      'Frontline managers are already stretched thin on coaching.',
      'New reps take three to four months to ramp.',
    ],
    allowedConcerns: ['manager_time', 'adoption'],
    successCriteria: ['reduce ramp time', 'increase manager visibility'],
    defaultOpening:
      "Hi — Divika. We're hiring fast and my managers are drowning in coaching. Tell me why I should spend time on this.",
    difficulty: 'Core',
  },
  {
    id: 'renewal-risk',
    title: 'Low-Usage Renewal Risk',
    briefing:
      'The company already pays for a sales-training tool, but adoption is weak and leadership questions the ROI.',
    customerRole: R.role,
    companyContext: `${R.companyType}, already using another sales-training tool`,
    sellerObjective:
      'Improve usage and prove measurable value against an incumbent tool.',
    immutableFacts: [
      'The company already licenses another sales-training tool.',
      'Adoption of the current tool is weak and usage is low.',
      'Leadership is questioning the ROI of tools like this.',
    ],
    allowedConcerns: ['roi', 'adoption'],
    successCriteria: ['improve usage', 'prove measurable value'],
    defaultOpening:
      "Divika. Frankly, we already pay for a tool like this and barely use it — so leadership is sceptical. Why would this be different?",
    difficulty: 'Advanced',
  },
  {
    id: 'vendor-evaluation',
    title: 'Competitive Vendor Evaluation',
    briefing:
      'Divika is comparing several AI sales-training vendors and is sceptical of generic AI claims.',
    customerRole: R.role,
    companyContext: `${R.companyType}, evaluating multiple vendors`,
    sellerObjective:
      'Establish credible differentiation and justify a next-step evaluation.',
    immutableFacts: [
      'Divika is actively comparing several AI sales-training vendors.',
      'He has heard the same generic AI pitch from multiple vendors.',
      'There are about 150 sales representatives.',
    ],
    allowedConcerns: ['differentiation', 'roi'],
    successCriteria: ['identify credible differentiation', 'justify a next-step evaluation'],
    defaultOpening:
      "Divika Mishra. I'm talking to a few vendors this week and you all sound the same so far. What actually makes you different?",
    difficulty: 'Advanced',
  },
];

/** Resolve a scenario by id; falls back to the first scenario for old records. */
export function getScenario(id: string | undefined): ScenarioDef {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}

/** The objection keys a scenario permits, in the profile's chosen order. */
export function objectionKeysFor(order: Concern[]): ObjectionKey[] {
  return order.map((c) => CONCERN_TO_OBJECTION[c]);
}
