import type { EvaluatorSignals } from '../types';
import type { EvaluationContext } from './types';

// ============================================================================
// Deterministic signal detection.
//
// Pure functions only — no randomness, no clocks. Given the same context they
// always return the same signals. This is what makes live scoring explainable
// and unit-testable. Detection uses keyword/phrase cues, sentence structure
// (question vs statement), transcript context, the customer's latest
// statement, the current stage, objections raised, turn length, and
// similarity to previous seller turns.
// ============================================================================

const STOP = new Set([
  'the', 'and', 'you', 'your', 'that', 'this', 'with', 'for', 'are', 'our',
  'have', 'has', 'was', 'were', 'their', 'they', 'them', 'from', 'into', 'about',
  'what', 'how', 'why', 'who', 'can', 'could', 'would', 'will', 'does', 'did',
  'about', 'just', 'like', 'here', 'there', 'been', 'more',
]);

/** Crude suffix stripper: enough to align obvious morphological variants. */
function stem(word: string): string {
  return word.replace(/(ings|ing|ed|es|s)$/, '');
}

/**
 * Domain abbreviations that mean the same thing to a salesperson. Without
 * this, "reps" and "representatives" look like different topics and a
 * reworded repeat of the same question slips past the similarity check.
 */
const ALIASES: Record<string, string> = {
  representative: 'rep',
  representatives: 'rep',
  // The stemmer strips "es" before "s", so this is the form it actually
  // produces for "representatives".
  representativ: 'rep',
  demonstration: 'demo',
  demonstrations: 'demo',
  organisation: 'org',
  organization: 'org',
};

/** Alias first on the raw word, then again after stemming. */
function normalise(word: string): string {
  const direct = ALIASES[word];
  if (direct) return direct;
  const stemmed = stem(word);
  return ALIASES[stemmed] ?? stemmed;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map(normalise);
}

function jaccard(a: string, b: string): number {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

function overlapCount(a: string, b: string): number {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter;
}

const has = (t: string, arr: string[]) => arr.some((n) => t.includes(n));

const OPEN_STARTERS = ['how', 'what', 'why', 'which', 'where', 'who', 'tell me', 'walk me', 'describe', 'help me understand'];
const CLOSED_STARTERS = ['do ', 'does ', 'did ', 'is ', 'are ', 'was ', 'were ', 'can ', 'could ', 'would ', 'will ', 'have ', 'has ', 'should ', 'shall '];

const CONTEXT_REF = ['you mentioned', 'you said', 'you told', 'you noted', 'as you said', 'like you said', "you're right", 'you already', 'earlier you', 'you pointed out', 'you brought up'];
const PAIN = ['problem', 'struggle', 'struggl', 'challenge', 'challeng', 'slow', 'difficult', 'bottleneck', 'too long', 'takes long', 'hard to', 'painful', 'pain point', 'issue', 'frustrat', 'ramp-up', 'ramp up', 'not productive', 'lose', 'losing', 'waste', 'inefficien'];
const PROCESS = ['current', 'currently', 'today', 'right now', 'existing', 'process', 'how do you', 'onboard', 'train', 'ramp'];
const DECISION = ['who decides', 'who signs', 'decision', 'decision-maker', 'decision maker', 'budget', 'approve', 'approval', 'sign off', 'signs off', 'sign-off', 'stakeholder', 'buying process', 'procurement', 'who else'];
const TIMELINE = ['timeline', 'timeframe', 'time frame', 'how soon', 'by when', 'when do you', 'deadline', 'this quarter', 'next quarter'];
const PITCH = ['our platform', 'our product', 'our solution', 'our ai', 'our tool', 'our software', 'we offer', 'we provide', 'best on the market', 'sign up', 'just buy', 'improve your sales', 'boost your', 'increase your sales'];
const NEXTSTEP = ['demo', 'demonstration', 'next step', 'schedule', 'set up a', 'book a', 'trial', 'pilot', 'walk you through', 'show you'];
const ACK = ['that makes sense', 'makes sense', 'fair point', 'i understand', 'i hear you', 'totally understand', 'i get that', 'good point', 'valid concern', "that's fair", 'understandable', 'i see why'];
const CLARIFY = ['your concern', 'concern', 'do you mean', 'are you worried', 'is it more', 'mainly around', 'worried about', 'what specifically', 'which part'];
const SUBSTANCE = ['because', 'unlike', 'since', 'which means', 'so that', 'the difference', 'we handle', 'data stays', 'on-device', 'on device', 'encrypted', 'private', 'without', 'instead of', 'rather than', 'in fact'];
const CONFIRM = ['does that address', 'did that answer', 'does that help', 'are you comfortable', 'does that make sense now', 'resolve your concern', 'does that resolve', 'have i addressed'];

const QUANTITY_RE = /\b(hours?|weeks?|months?|days?|percent)\b/;
const IMPACT_CONTEXT = ['hour', 'week', 'month', 'quota', 'revenue', 'productiv', 'ramp', 'cost', 'deal', 'pipeline', 'rep'];

function startsWithAny(t: string, arr: string[]): boolean {
  return arr.some((p) => t.startsWith(p));
}

const CLAIM_TERMS = [
  'guarantee', 'guaranteed', 'no risk', 'risk-free', 'risk free', '100%',
  'best on the market', 'double your', 'triple your', 'overnight',
];

/**
 * Explicit refusals only. Deliberately excludes a bare "no" so that phrases
 * like "no risk" are not treated as negating themselves.
 */
const NEGATION_CUES = [
  "not", "won't", 'wont', 'cannot', "can't", 'cant', 'never',
  "don't", 'dont', "isn't", 'isnt', "wouldn't", 'wouldnt', "shouldn't",
];

/** True when an explicit negation appears shortly before the claim phrase. */
function isNegatedBefore(text: string, term: string): boolean {
  const idx = text.indexOf(term);
  if (idx < 0) return false;
  const window = text.slice(Math.max(0, idx - 60), idx);
  return NEGATION_CUES.some((cue) => window.includes(cue));
}

function detectUnsupportedClaim(t: string): boolean {
  // "I'm not going to guarantee a 40% increase" REFUSES to over-promise — the
  // opposite of an unsupported claim — so negated claims are not flagged.
  for (const term of CLAIM_TERMS) {
    if (t.includes(term) && !isNegatedBefore(t, term)) return true;
  }
  const pct = /\d+\s?%/.exec(t);
  if (pct && has(t, ['increase', 'boost', 'improve', 'revenue', 'growth', 'roi', 'more sales'])) {
    return !isNegatedBefore(t, pct[0]);
  }
  return false;
}

/** Whether a single message looks like discovery (used for pitch timing). */
function looksLikeDiscovery(m: string): boolean {
  const t = m.toLowerCase();
  const q = t.includes('?') || startsWithAny(t, OPEN_STARTERS);
  return (q && has(t, PROCESS)) || has(t, PAIN);
}

/**
 * Detect all 19 behavioural signals for one seller turn. Pure & deterministic.
 */
export function detectSignals(ctx: EvaluationContext): EvaluatorSignals {
  const raw = ctx.sellerMessage;
  const t = raw.toLowerCase().trim();
  const tokens = t.length === 0 ? [] : t.split(/\s+/);
  const wordCount = tokens.length;

  const isQuestion = t.includes('?') || startsWithAny(t, OPEN_STARTERS) || startsWithAny(t, CLOSED_STARTERS);
  const asked_open_question = isQuestion && startsWithAny(t, OPEN_STARTERS);
  const asked_closed_question = isQuestion && !asked_open_question;

  const made_unsupported_claim = detectUnsupportedClaim(t);

  const identified_pain = has(t, PAIN);
  const hasQuantity = /\d/.test(t) || QUANTITY_RE.test(t);
  const quantified_impact = hasQuantity && has(t, IMPACT_CONTEXT) && !made_unsupported_claim;

  const explored_current_process = isQuestion && has(t, PROCESS);
  const explored_decision_process = isQuestion && has(t, DECISION);
  const explored_timeline = isQuestion && (has(t, TIMELINE) || t.startsWith('when'));

  const referenced_customer_context = has(t, CONTEXT_REF);

  const isPitch = has(t, PITCH);
  const discoveryDoneBefore = ctx.previousSellerMessages.some(looksLikeDiscovery);
  const pitched_too_early =
    isPitch &&
    (ctx.stage === 'opening' || ctx.stage === 'discovery') &&
    !discoveryDoneBefore &&
    !made_unsupported_claim;

  const proposed_next_step = has(t, NEXTSTEP);

  // --- objection-related (only meaningful once an objection exists) ---
  const objectionActive = ctx.objectionsRaised.length > 0;
  const hasAck = has(t, ACK);
  const acknowledged_objection = objectionActive && hasAck;
  const clarified_objection = objectionActive && isQuestion && has(t, CLARIFY);
  const answered_objection =
    objectionActive &&
    !clarified_objection &&
    wordCount >= 8 &&
    has(t, SUBSTANCE) &&
    !(hasAck && wordCount < 12);
  const confirmed_objection_resolution = has(t, CONFIRM);

  // --- listening ---
  const asked_relevant_follow_up =
    isQuestion &&
    ctx.latestCustomerStatement !== null &&
    overlapCount(raw, ctx.latestCustomerStatement) >= 2;

  // Only flag "ignored" when the customer actually needs a response — i.e. an
  // objection is on the table — and the seller neither engages it nor shares
  // any content with it. Gating on objectionActive avoids false positives on
  // the generic opener ("what can I do for you?") and rhetorical questions.
  const ignored_customer_statement =
    objectionActive &&
    !referenced_customer_context &&
    !acknowledged_objection &&
    !clarified_objection &&
    !answered_objection &&
    !asked_relevant_follow_up &&
    (ctx.latestCustomerStatement === null || overlapCount(raw, ctx.latestCustomerStatement) < 1);

  const was_repetitive = ctx.previousSellerMessages.some((m) => jaccard(m, raw) >= 0.6);

  // Rambling is length WITHOUT substance. A genuinely substantive turn (a real
  // objection answer, a quantified impact, a reference to what the customer
  // said) earns more room before it is penalised as rambling.
  const substantive =
    answered_objection || quantified_impact || referenced_customer_context || identified_pain;
  const was_too_long = wordCount > (substantive ? 120 : 80);

  return {
    asked_open_question,
    asked_closed_question,
    identified_pain,
    quantified_impact,
    explored_current_process,
    explored_decision_process,
    explored_timeline,
    referenced_customer_context,
    acknowledged_objection,
    clarified_objection,
    answered_objection,
    confirmed_objection_resolution,
    asked_relevant_follow_up,
    proposed_next_step,
    pitched_too_early,
    ignored_customer_statement,
    was_repetitive,
    was_too_long,
    made_unsupported_claim,
  };
}
