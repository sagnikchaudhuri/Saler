import type { EvaluatorSignals, SalesStage } from '../types';
import type { ObjectionKey } from '../conversation/types';

// ============================================================================
// Labelled calibration dataset for the deterministic signal detector.
//
// Every case is hand-labelled with the signals a competent sales coach would
// expect. `knownMiss` records signals a human WOULD expect but the keyword
// detector provably does not catch — these are documented gaps, not passes.
// Keeping them in the dataset means the limitation is visible and measurable
// rather than hidden.
//
// This measures agreement with our own labels. It says nothing about
// real-world sales effectiveness.
// ============================================================================

export type SignalKey = keyof EvaluatorSignals;

export interface CalibrationCase {
  id: string;
  group: 'positive' | 'negative' | 'ambiguous' | 'adversarial';
  seller: string;
  latestCustomer?: string;
  stage?: SalesStage;
  objections?: ObjectionKey[];
  previous?: string[];
  /** Signals that must be detected. */
  expectTrue: SignalKey[];
  /** Signals that must NOT be detected. */
  expectFalse: SignalKey[];
  /** Signals a human would expect but the detector misses today. */
  knownMiss?: SignalKey[];
  why: string;
}

/** Filler of a given word count with no substantive cue words. */
function filler(words: number): string {
  const base = [
    'anyway', 'basically', 'obviously', 'clearly', 'honestly', 'generally',
    'typically', 'usually', 'certainly', 'naturally',
  ];
  return Array.from({ length: words }, (_, i) => base[i % base.length]).join(' ');
}

// A long, genuinely substantive answer to a security objection (~110 words).
const LONG_RELEVANT_ANSWER =
  'That is a fair concern to raise and I want to answer it properly rather ' +
  'than brush past it, because the way we handle conversation data is ' +
  'genuinely different from a general purpose assistant. Every practice ' +
  'call your representatives run is processed inside your own tenant, the ' +
  'recordings are never retained after scoring completes, and the coaching ' +
  'summary that your enablement managers read contains only the behavioural ' +
  'signals rather than the raw wording of the conversation itself. Your ' +
  'security reviewers can inspect exactly what is stored and for how long, ' +
  'and we are happy to walk your team through that retention policy line by ' +
  'line before anything is switched on for real representatives.';

// The same length, but empty of substance (~110 words).
const LONG_IRRELEVANT = filler(110);

export const CALIBRATION_CASES: CalibrationCase[] = [
  // ---------------------------------------------------------------- positive
  {
    id: 'P01', group: 'positive',
    seller: 'How are you currently training new sales representatives?',
    expectTrue: ['asked_open_question', 'explored_current_process'],
    expectFalse: ['made_unsupported_claim', 'pitched_too_early'],
    why: 'Textbook open discovery question about the current process.',
  },
  {
    id: 'P02', group: 'positive',
    seller: 'What does your onboarding process look like today?',
    expectTrue: ['asked_open_question', 'explored_current_process'],
    expectFalse: ['asked_closed_question'],
    why: 'Open question naming the existing process.',
  },
  {
    id: 'P03', group: 'positive',
    seller: 'How is your current process working?',
    expectTrue: ['asked_open_question', 'explored_current_process'],
    expectFalse: ['made_unsupported_claim'],
    why: 'Short but genuine current-process discovery, not filler.',
  },
  {
    id: 'P04', group: 'positive',
    seller: 'It sounds like slow ramp-up is a real problem for the team.',
    expectTrue: ['identified_pain'],
    expectFalse: ['made_unsupported_claim'],
    why: 'Names the business problem explicitly.',
  },
  {
    id: 'P05', group: 'positive',
    seller: 'What effect does the slow ramp-up have on quota attainment?',
    expectTrue: ['asked_open_question', 'identified_pain'],
    expectFalse: ['made_unsupported_claim'],
    why: 'Impact question tying the pain to a business outcome.',
  },
  {
    id: 'P06', group: 'positive',
    seller: 'How many hours per week do managers spend on mock calls?',
    expectTrue: ['asked_open_question', 'quantified_impact'],
    expectFalse: ['made_unsupported_claim'],
    why: 'Asks for a number against a cost context — quantified impact.',
  },
  {
    id: 'P07', group: 'positive',
    seller: 'So roughly three months before a rep is fully productive?',
    expectTrue: ['quantified_impact'],
    expectFalse: ['made_unsupported_claim'],
    why: 'Puts a figure on ramp time.',
  },
  {
    id: 'P08', group: 'positive',
    seller: 'When do you need this in place by?',
    expectTrue: ['explored_timeline'],
    expectFalse: ['made_unsupported_claim'],
    why: 'Direct timeline discovery.',
  },
  {
    id: 'P09', group: 'positive',
    seller: 'What timeline are you working toward for fixing this?',
    expectTrue: ['asked_open_question', 'explored_timeline'],
    expectFalse: ['made_unsupported_claim'],
    why: 'Timeline discovery phrased as an open question.',
  },
  {
    id: 'P10', group: 'positive',
    seller: 'Who else is involved in the buying decision?',
    expectTrue: ['explored_decision_process'],
    expectFalse: ['made_unsupported_claim'],
    why: 'Decision-process discovery.',
  },
  {
    id: 'P11', group: 'positive',
    seller: 'Who decides on tooling like this, and who signs off on budget?',
    expectTrue: ['explored_decision_process'],
    expectFalse: ['made_unsupported_claim'],
    why: 'Decision-maker and budget authority.',
  },
  {
    id: 'P12', group: 'positive',
    seller: 'You mentioned managers already run mock calls.',
    expectTrue: ['referenced_customer_context'],
    expectFalse: ['made_unsupported_claim'],
    why: 'Explicitly builds on what the customer said.',
  },
  {
    id: 'P13', group: 'positive',
    seller: 'You said ramp-up takes three to four months for a new rep.',
    expectTrue: ['referenced_customer_context', 'quantified_impact'],
    expectFalse: ['made_unsupported_claim'],
    why: 'Reflects the customer’s own number back to them.',
  },
  {
    id: 'P14', group: 'positive',
    seller: 'How long do those mock calls take each week?',
    latestCustomer: 'Onboarding is manager-led mock calls and recorded call reviews.',
    expectTrue: ['asked_relevant_follow_up'],
    expectFalse: ['ignored_customer_statement'],
    why: 'Follow-up that clearly builds on the previous customer turn.',
  },
  {
    id: 'P15', group: 'positive',
    seller: 'That makes sense — you already invest a lot of manager time in practice.',
    objections: ['generic_chatbot'],
    expectTrue: ['acknowledged_objection'],
    expectFalse: ['ignored_customer_statement'],
    why: 'Acknowledges the objection before answering.',
  },
  {
    id: 'P16', group: 'positive',
    seller: 'Is your concern mainly around data storage or access control?',
    objections: ['sensitive_info'],
    expectTrue: ['clarified_objection'],
    expectFalse: ['ignored_customer_statement'],
    why: 'Clarifies the objection rather than assuming it.',
  },
  {
    id: 'P17', group: 'positive',
    seller:
      'Unlike a generic chatbot, this replays your own buyer persona because it is trained on your scenarios.',
    objections: ['generic_chatbot'],
    expectTrue: ['answered_objection'],
    expectFalse: ['ignored_customer_statement'],
    why: 'Substantive differentiation answer.',
  },
  {
    id: 'P18', group: 'positive',
    seller: 'Does that address your concern about where the data sits?',
    objections: ['sensitive_info'],
    expectTrue: ['confirmed_objection_resolution'],
    expectFalse: ['made_unsupported_claim'],
    why: 'Checks the objection is actually resolved.',
  },
  {
    id: 'P19', group: 'positive',
    seller: 'Would it make sense to schedule a demonstration with your enablement team?',
    expectTrue: ['proposed_next_step'],
    expectFalse: ['made_unsupported_claim'],
    why: 'Concrete next step with the right stakeholders.',
  },
  {
    id: 'P20', group: 'positive',
    seller: 'Shall we book a short pilot with two of your reps?',
    expectTrue: ['proposed_next_step'],
    expectFalse: ['made_unsupported_claim'],
    why: 'Proposes a bounded next step.',
  },
  {
    id: 'P21', group: 'positive',
    seller: 'Why is ramp-up taking so long today?',
    expectTrue: ['asked_open_question', 'identified_pain', 'explored_current_process'],
    expectFalse: ['made_unsupported_claim'],
    why: 'Open question probing the cause of the pain.',
  },
  {
    id: 'P22', group: 'positive',
    seller: 'Tell me how you currently onboard new reps.',
    expectTrue: ['asked_open_question', 'explored_current_process'],
    expectFalse: ['made_unsupported_claim'],
    why: 'Invitational discovery of the current process.',
  },
  {
    id: 'P23', group: 'positive',
    seller: 'What does that cost you in manager hours each month?',
    expectTrue: ['asked_open_question', 'quantified_impact'],
    expectFalse: ['made_unsupported_claim'],
    why: 'Converts the pain into a measurable cost.',
  },
  {
    id: 'P24', group: 'positive',
    seller: 'Who signs off on this, and by when would you need it live?',
    expectTrue: ['explored_decision_process', 'explored_timeline'],
    expectFalse: ['made_unsupported_claim'],
    why: 'Decision authority plus timeline in one turn.',
  },
  {
    id: 'P25', group: 'positive',
    seller: 'You mentioned recorded call reviews — how often do those actually happen?',
    latestCustomer: 'We run recorded call reviews occasionally, when managers have time.',
    expectTrue: ['referenced_customer_context', 'asked_relevant_follow_up'],
    expectFalse: ['ignored_customer_statement'],
    why: 'Listens, then probes deeper on the same thread.',
  },

  // ---------------------------------------------------------------- negative
  {
    id: 'N01', group: 'negative',
    seller: 'Our platform is the ideal solution for onboarding.',
    stage: 'opening',
    expectTrue: ['pitched_too_early'],
    expectFalse: ['identified_pain'],
    why: 'Pitches before understanding anything.',
  },
  {
    id: 'N02', group: 'negative',
    seller: 'Our software offers dashboards, analytics and reporting modules.',
    stage: 'opening',
    expectTrue: ['pitched_too_early'],
    expectFalse: ['referenced_customer_context'],
    why: 'Generic feature dump with no discovery.',
  },
  {
    id: 'N03', group: 'negative',
    seller: 'We guarantee a 40% revenue increase.',
    stage: 'value_mapping',
    expectTrue: ['made_unsupported_claim'],
    expectFalse: ['quantified_impact'],
    why: 'Unsupported guarantee — must not count as quantifying impact.',
  },
  {
    id: 'N04', group: 'negative',
    seller: 'This is guaranteed to work for your team.',
    stage: 'value_mapping',
    expectTrue: ['made_unsupported_claim'],
    expectFalse: ['identified_pain'],
    why: 'Absolute promise with no evidence.',
  },
  {
    id: 'N05', group: 'negative',
    seller: 'Honestly it is completely risk-free for you.',
    stage: 'value_mapping',
    expectTrue: ['made_unsupported_claim'],
    expectFalse: ['quantified_impact'],
    why: 'Risk-free is an unsupported absolute.',
  },
  {
    id: 'N06', group: 'negative',
    seller: 'We are the best on the market for this.',
    stage: 'value_mapping',
    expectTrue: ['made_unsupported_claim'],
    expectFalse: ['identified_pain'],
    why: 'Superlative marketing claim.',
  },
  {
    id: 'N07', group: 'negative',
    seller: 'You will double your close rate with this.',
    stage: 'value_mapping',
    expectTrue: ['made_unsupported_claim'],
    expectFalse: ['quantified_impact'],
    why: 'Invented multiplier.',
  },
  {
    id: 'N08', group: 'negative',
    seller: 'Let me tell you about our pricing tiers and packaging options.',
    latestCustomer: 'Where does our sensitive customer data end up?',
    objections: ['sensitive_info'],
    expectTrue: ['ignored_customer_statement'],
    expectFalse: ['answered_objection', 'acknowledged_objection'],
    why: 'Changes the subject while an objection is open.',
  },
  {
    id: 'N09', group: 'negative',
    seller: 'How are you currently training your new sales representatives?',
    previous: ['How are you currently training your new sales reps?'],
    expectTrue: ['was_repetitive'],
    expectFalse: ['made_unsupported_claim'],
    why: 'Near-identical repeat of an earlier question.',
  },
  {
    id: 'N10', group: 'negative',
    seller: filler(95),
    expectTrue: ['was_too_long'],
    expectFalse: ['identified_pain', 'answered_objection'],
    why: 'Long turn with no substance — rambling.',
  },
  {
    id: 'N11', group: 'negative',
    seller: 'Shall we schedule a demo tomorrow?',
    stage: 'opening',
    expectTrue: ['proposed_next_step'],
    expectFalse: ['identified_pain', 'quantified_impact'],
    why: 'Premature close: a next step with no discovered problem. The live '
      + 'signal is neutral; the final Closing category penalises the timing.',
  },
  {
    id: 'N12', group: 'negative',
    seller: 'Right. Moving on to something else entirely.',
    latestCustomer: 'Our conversations contain sensitive customer information.',
    objections: ['sensitive_info'],
    expectTrue: ['ignored_customer_statement'],
    expectFalse: ['answered_objection'],
    why: 'Explicitly skips the objection.',
  },
  {
    id: 'N13', group: 'negative',
    seller: 'We will boost revenue by 50% within a quarter.',
    stage: 'value_mapping',
    expectTrue: ['made_unsupported_claim'],
    expectFalse: ['quantified_impact'],
    why: 'Percentage promise, not a discovered figure.',
  },
  {
    id: 'N14', group: 'negative',
    seller: 'Just sign up and you will see the value straight away.',
    stage: 'discovery',
    expectTrue: ['pitched_too_early'],
    expectFalse: ['explored_current_process'],
    why: 'Pushes signup before any discovery.',
  },
  {
    id: 'N15', group: 'negative',
    seller: 'You will see results overnight.',
    stage: 'value_mapping',
    expectTrue: ['made_unsupported_claim'],
    expectFalse: ['quantified_impact'],
    why: 'Unsupported speed claim.',
  },
  {
    id: 'N16', group: 'negative',
    seller: 'There is no risk at all in trying this out.',
    stage: 'value_mapping',
    expectTrue: ['made_unsupported_claim'],
    expectFalse: ['identified_pain'],
    why: 'Genuine "no risk" claim — the negation guard must not suppress it.',
  },
  {
    id: 'N17', group: 'negative',
    seller: 'Anyway, the weather has been great this week.',
    latestCustomer: 'How is this different from a generic AI chatbot?',
    objections: ['generic_chatbot'],
    expectTrue: ['ignored_customer_statement'],
    expectFalse: ['answered_objection', 'asked_relevant_follow_up'],
    why: 'Completely irrelevant response to an open objection.',
  },
  {
    id: 'N18', group: 'negative',
    seller: 'How do you currently train your representatives?',
    previous: ['How do you currently train your reps?'],
    expectTrue: ['was_repetitive'],
    expectFalse: ['made_unsupported_claim'],
    why: 'Same question, trivially reworded.',
  },
  {
    id: 'N19', group: 'negative',
    seller: LONG_IRRELEVANT,
    objections: ['sensitive_info'],
    expectTrue: ['was_too_long', 'ignored_customer_statement'],
    expectFalse: ['answered_objection'],
    why: 'Long AND empty while an objection is open — the worst case.',
  },
  {
    id: 'N20', group: 'negative',
    seller: 'This will triple your pipeline in weeks.',
    stage: 'value_mapping',
    expectTrue: ['made_unsupported_claim'],
    expectFalse: ['quantified_impact'],
    why: 'Invented multiplier dressed as a metric.',
  },

  // --------------------------------------------------------------- ambiguous
  {
    id: 'A01', group: 'ambiguous',
    seller: 'Walk me through what happens when a new rep joins.',
    expectTrue: ['asked_open_question'],
    expectFalse: [],
    knownMiss: ['explored_current_process'],
    why: 'A process question with no process keyword — detector misses it.',
  },
  {
    id: 'A02', group: 'ambiguous',
    seller: 'What is your approach to getting people productive quickly?',
    expectTrue: ['asked_open_question'],
    expectFalse: ['made_unsupported_claim'],
    knownMiss: ['explored_current_process'],
    why: 'Paraphrased process discovery without the trigger vocabulary.',
  },
  {
    id: 'A03', group: 'ambiguous',
    seller: 'How long until someone is fully ramped?',
    expectTrue: ['asked_open_question', 'explored_current_process'],
    expectFalse: ['made_unsupported_claim'],
    why: '"Ramped" is caught by the process vocabulary.',
  },
  {
    id: 'A04', group: 'ambiguous',
    seller: 'Is training handled entirely by the managers?',
    expectTrue: ['asked_closed_question', 'explored_current_process'],
    expectFalse: ['asked_open_question'],
    why: 'Closed but still genuine process discovery.',
  },
  {
    id: 'A05', group: 'ambiguous',
    seller: 'Could you describe the review process you use?',
    expectTrue: ['asked_closed_question', 'explored_current_process'],
    expectFalse: ['asked_open_question'],
    why: 'Reads as open to a human but starts with a closed auxiliary.',
  },
  {
    id: 'A06', group: 'ambiguous',
    seller: 'So the bottleneck is really manager availability?',
    expectTrue: ['identified_pain'],
    expectFalse: ['made_unsupported_claim'],
    why: 'Names the constraint as a bottleneck.',
  },
  {
    id: 'A07', group: 'ambiguous',
    seller: 'That sounds expensive in terms of senior time.',
    expectTrue: [],
    expectFalse: ['made_unsupported_claim', 'quantified_impact'],
    knownMiss: ['identified_pain'],
    why: '"Expensive" implies pain but is not in the pain vocabulary.',
  },
  {
    id: 'A08', group: 'ambiguous',
    seller: "You're right that mock calls consume manager time.",
    expectTrue: ['referenced_customer_context'],
    expectFalse: ['made_unsupported_claim'],
    why: 'Agreement phrasing still references customer context.',
  },
  {
    id: 'A09', group: 'ambiguous',
    seller: 'Earlier you said ramp takes months for most new reps.',
    expectTrue: ['referenced_customer_context', 'quantified_impact'],
    expectFalse: ['made_unsupported_claim'],
    why: 'Recall plus an implicit figure.',
  },
  {
    id: 'A10', group: 'ambiguous',
    seller: 'What would success look like six months after rollout?',
    expectTrue: ['asked_open_question', 'quantified_impact'],
    expectFalse: ['made_unsupported_claim'],
    knownMiss: ['explored_timeline'],
    why: 'Success-criteria question; reads as timeline to a human but the '
      + 'timeline vocabulary does not match.',
  },
  {
    id: 'A11', group: 'ambiguous',
    seller: 'Fair point.',
    objections: ['generic_chatbot'],
    expectTrue: ['acknowledged_objection'],
    expectFalse: ['answered_objection'],
    why: 'Acknowledgement only — correctly not counted as an answer.',
  },
  {
    id: 'A12', group: 'ambiguous',
    seller:
      'I understand the concern, and your data never leaves your tenant because processing happens inside your own environment.',
    objections: ['sensitive_info'],
    expectTrue: ['acknowledged_objection', 'answered_objection'],
    expectFalse: ['ignored_customer_statement'],
    why: 'Acknowledges and substantively answers in one turn.',
  },
  {
    id: 'A13', group: 'ambiguous',
    seller: 'Let us get your security team on a call next week.',
    expectTrue: [],
    expectFalse: ['made_unsupported_claim'],
    knownMiss: ['proposed_next_step'],
    why: 'A real next step phrased without the next-step vocabulary.',
  },
  {
    id: 'A14', group: 'ambiguous',
    seller: 'How many reps do you have on the team?',
    expectTrue: ['asked_open_question'],
    expectFalse: ['quantified_impact'],
    why: 'Asks for a count but with no impact context — correctly not '
      + 'counted as quantifying impact.',
  },
  {
    id: 'A15', group: 'ambiguous',
    seller: 'What is slowing them down the most?',
    expectTrue: ['asked_open_question', 'identified_pain'],
    expectFalse: ['made_unsupported_claim'],
    why: '"Slowing" surfaces the pain.',
  },

  // ------------------------------------------------------------- adversarial
  {
    id: 'X01', group: 'adversarial',
    seller: 'I am not going to guarantee a 40% increase.',
    stage: 'value_mapping',
    expectTrue: [],
    expectFalse: ['made_unsupported_claim'],
    why: 'REFUSING to over-promise is the opposite of an unsupported claim.',
  },
  {
    id: 'X02', group: 'adversarial',
    seller: 'You said managers run mock calls, correct?',
    expectTrue: ['referenced_customer_context'],
    expectFalse: ['made_unsupported_claim'],
    why: 'Context reference phrased as a confirmation question.',
  },
  {
    id: 'X03', group: 'adversarial',
    seller: 'How is your current process working?',
    expectTrue: ['asked_open_question', 'explored_current_process'],
    expectFalse: ['was_too_long'],
    why: 'Short question that must not be dismissed as filler.',
  },
  {
    id: 'X04', group: 'adversarial',
    seller: 'How do you currently train new representatives?',
    previous: ['How do you currently train new reps?'],
    expectTrue: ['was_repetitive'],
    expectFalse: ['made_unsupported_claim'],
    why: 'Reworded repeat — stemming should still catch it.',
  },
  {
    id: 'X05', group: 'adversarial',
    seller: LONG_RELEVANT_ANSWER,
    objections: ['sensitive_info'],
    expectTrue: ['answered_objection'],
    expectFalse: ['was_too_long', 'ignored_customer_statement'],
    why: 'Long BUT substantive: must not be penalised as rambling.',
  },
  {
    id: 'X06', group: 'adversarial',
    seller: LONG_IRRELEVANT,
    expectTrue: ['was_too_long'],
    expectFalse: ['answered_objection'],
    why: 'Same length, no substance — the penalty must still apply.',
  },
  {
    id: 'X07', group: 'adversarial',
    seller: 'We cannot promise 100% uptime, but here is our actual SLA.',
    stage: 'value_mapping',
    expectTrue: [],
    expectFalse: ['made_unsupported_claim'],
    why: 'Explicitly declines an absolute claim.',
  },
  {
    id: 'X08', group: 'adversarial',
    seller: 'Our platform replays those exact mock-call scenarios.',
    stage: 'value_mapping',
    previous: ['How do you currently train new reps today?'],
    expectTrue: [],
    expectFalse: ['pitched_too_early'],
    why: 'Pitching AFTER discovery is legitimate value-mapping, not early.',
  },
  {
    id: 'X09', group: 'adversarial',
    seller: 'That is not a guarantee — it is what similar teams have seen.',
    stage: 'value_mapping',
    expectTrue: [],
    expectFalse: ['made_unsupported_claim'],
    why: 'Explicitly disclaims the guarantee.',
  },
  {
    id: 'X10', group: 'adversarial',
    seller: 'Is it more the storage or the access side that worries you?',
    objections: ['sensitive_info'],
    expectTrue: ['clarified_objection'],
    expectFalse: ['ignored_customer_statement', 'made_unsupported_claim'],
    why: 'Clarifying question that never uses the word "concern".',
  },
];
