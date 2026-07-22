import type { Scores } from '../types';

/**
 * The sales scenario the seller practises against.
 * Kept as plain data so the persona module, briefing screen, and (later) the
 * LLM prompt builder can all read from a single source of truth.
 */
export interface Scenario {
  id: string;
  product: string;
  customer: {
    name: string;
    role: string;
    companyType: string;
    teamSize: string;
    personality: string[];
  };
  mainProblem: string;
  currentProcess: string[];
  possibleObjections: string[];
  sellerObjective: string;
}

export const SALES_SCENARIO: Scenario = {
  id: 'rohan-mehta-sales-enablement',
  product: 'An AI sales-roleplay and coaching platform',
  customer: {
    name: 'Rohan Mehta',
    role: 'Sales Enablement Manager',
    companyType: 'Mid-sized B2B technology company',
    teamSize: 'Approximately 150 sales representatives',
    personality: [
      'Professional',
      'Curious',
      'Sceptical',
      'Time-conscious',
      'Resistant to vague marketing claims',
    ],
  },
  mainProblem:
    'New sales representatives take too long to become productive.',
  currentProcess: [
    'Manager-led mock calls',
    'Recorded call reviews',
    'Occasional training sessions',
  ],
  possibleObjections: [
    'We already conduct internal mock calls.',
    'How is this different from a generic AI chatbot?',
    'Our sales conversations contain sensitive information.',
    'How can we prove this improves sales performance?',
    'Will managers and representatives actually adopt it?',
    'Implementation sounds like additional work.',
  ],
  sellerObjective:
    'Discover the business problem, quantify its impact, connect the solution to the problem, address objections, and earn agreement for a product demonstration.',
};

/** Starting values for the six live metrics. */
export const INITIAL_SCORES: Scores = {
  discovery: 40,
  relevance: 45,
  clarity: 50,
  listening: 45,
  objectionHandling: 40,
  progression: 40,
};
