import type { SalesStage } from '../types';
import type {
  ConversationContext,
  CustomerMemory,
  ObjectionKey,
  ProviderReply,
} from './types';

// ============================================================================
// Divika Mishra — deterministic sales persona.
//
// This module holds ALL of Divika's behaviour as pure functions so it can be
// unit-tested without React, timers, or randomness. Given the same context it
// always produces the same reply. The Demo provider is a thin wrapper around
// `selectReply`; the real LLM provider (later) will replace the wrapper, not
// this logic.
//
// Behaviour rules honoured here:
//   - stays in character, never coaches the seller
//   - remembers context and does not repeat himself
//   - reveals objections naturally, one at a time, never all at once
//   - stays sceptical; only warms up (agrees to a demo) when the seller earns it
// ============================================================================

export const OPENING_LINE =
  "Hi, this is Divika Mishra. I've got about ten minutes before my next meeting — what can I do for you?";

// --- keyword vocabularies ---------------------------------------------------
const PROCESS_WORDS = [
  'current', 'currently', 'process', 'today', 'onboard', 'onboarding',
  'ramp', 'train', 'training', 'how do you', 'right now', 'existing',
];
const IMPACT_WORDS = [
  'cost', 'impact', 'affect', 'lose', 'losing', 'expensive', 'productivity',
  'slow', 'time it takes', 'how long', 'bottleneck',
];
const TIME_WORDS = ['how long', 'how many', 'weeks', 'months', 'quota', 'productive'];
const PITCH_WORDS = [
  'our platform', 'our product', 'we offer', 'we provide', 'best', 'leading',
  'guarantee', 'revolutionary', 'cutting-edge', 'game-chang', 'world-class',
  'trust me', 'sign up', 'purchase', 'buy',
];
const QUANTIFY_WORDS = [
  'hours', 'weeks', 'months', 'percent', '%', 'revenue', 'quota', 'dollars',
  '$', 'roi', 'ramp time', 'per week', 'per month',
];
const DATA_WORDS = [
  'secure', 'security', 'privacy', 'private', 'confidential', 'compliance',
  'encrypt', 'gdpr', 'data stays', 'your data',
];
const PROOF_WORDS = [
  'prove', 'proof', 'results', 'metrics', 'measure', 'evidence',
  'case study', 'benchmark', 'improvement', 'track',
];
const ADOPTION_WORDS = ['adopt', 'adoption', 'buy-in', 'engagement', 'actually use'];
const NEXTSTEP_WORDS = [
  'demo', 'demonstration', 'next step', 'schedule', 'set up a', 'book',
  'trial', 'pilot', 'walk you through', 'show you',
];

function contains(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

// --- seller-message analysis ------------------------------------------------

/** Structured read of a single seller message. Deterministic and pure. */
export interface SellerSignals {
  isQuestion: boolean;
  asksAboutProcess: boolean;
  asksAboutImpact: boolean;
  asksAboutTime: boolean;
  isDiscoveryQuestion: boolean;
  isPitch: boolean;
  quantifies: boolean;
  mentionsData: boolean;
  mentionsProof: boolean;
  mentionsAdoption: boolean;
  proposesNextStep: boolean;
  wordCount: number;
  tooLong: boolean;
}

export function analyzeSeller(message: string): SellerSignals {
  const text = message.toLowerCase().trim();
  const wordCount = text.length === 0 ? 0 : text.split(/\s+/).length;
  const isQuestion = text.includes('?') || /^(how|what|why|when|where|who|do|does|can|could|would|tell me|walk me)\b/.test(text);
  const asksAboutProcess = contains(text, PROCESS_WORDS);
  const asksAboutImpact = contains(text, IMPACT_WORDS);
  const asksAboutTime = contains(text, TIME_WORDS);

  return {
    isQuestion,
    asksAboutProcess,
    asksAboutImpact,
    asksAboutTime,
    isDiscoveryQuestion: isQuestion && (asksAboutProcess || asksAboutImpact || asksAboutTime),
    isPitch: contains(text, PITCH_WORDS),
    quantifies: contains(text, QUANTIFY_WORDS),
    mentionsData: contains(text, DATA_WORDS),
    mentionsProof: contains(text, PROOF_WORDS),
    mentionsAdoption: contains(text, ADOPTION_WORDS),
    proposesNextStep: contains(text, NEXTSTEP_WORDS),
    wordCount,
    tooLong: wordCount > 90,
  };
}

// --- objection handling -----------------------------------------------------

const OBJECTION_LINES: Record<ObjectionKey, string> = {
  already_mock_calls:
    "Here's my hesitation — we already run internal mock calls with our managers. Why would we need software for that?",
  generic_chatbot:
    'Be honest with me: how is this actually different from pointing my reps at a generic AI chatbot?',
  sensitive_info:
    'One concern — our sales conversations touch on sensitive customer information. Where does that data end up?',
  prove_performance:
    'And how would I actually prove to leadership that this moves the needle on sales performance?',
  adoption:
    "Even if it works, will my managers and reps genuinely use it? Adoption is usually where these things die.",
  implementation_work:
    "This also sounds like a lift to roll out. I don't have spare cycles for a heavy implementation.",
};

/** The last raised objection the seller has not yet addressed, if any. */
export function pendingObjection(ctx: ConversationContext): ObjectionKey | undefined {
  for (let i = ctx.objectionsRaised.length - 1; i >= 0; i--) {
    const key = ctx.objectionsRaised[i];
    if (!ctx.memory.addressedObjections.includes(key)) return key;
  }
  return undefined;
}

/**
 * Choose the next objection to reveal, if the moment is natural. Returns
 * undefined when nothing should be raised (so Rohan doesn't dump every
 * objection at once). Never returns an already-raised objection.
 */
function pickObjectionToRaise(
  ctx: ConversationContext,
  s: SellerSignals,
): ObjectionKey | undefined {
  const raised = (k: ObjectionKey) => ctx.objectionsRaised.includes(k);
  const turns = ctx.memory.sellerTurns;

  // Context-triggered objections take priority.
  if (s.isPitch && !raised('generic_chatbot') && turns >= 1) return 'generic_chatbot';
  if (s.mentionsData && !raised('sensitive_info')) return 'sensitive_info';
  if ((s.mentionsProof || s.quantifies) && !raised('prove_performance') && turns >= 2)
    return 'prove_performance';
  if (s.mentionsAdoption && !raised('adoption')) return 'adoption';

  // Natural discovery-driven reveal: the first objection surfaces once the
  // seller has explored the process a little.
  if (s.asksAboutProcess && !raised('already_mock_calls') && turns >= 1)
    return 'already_mock_calls';

  return undefined;
}

// --- stage detection --------------------------------------------------------

/** Deterministically infer the sales stage from context + the latest signals. */
export function detectStage(
  ctx: ConversationContext,
  s: SellerSignals,
  raisedObjection: ObjectionKey | undefined,
  agreed: boolean,
): SalesStage {
  if (agreed) return 'next_step';
  if (raisedObjection || pendingObjection(ctx)) return 'objection_handling';
  if (s.proposesNextStep) return 'next_step';
  if (s.quantifies || ctx.memory.quantifiedValue || s.asksAboutImpact) return 'impact';
  if (s.isPitch) return 'value_mapping';
  if (s.isDiscoveryQuestion || ctx.memory.askedAboutProcess) return 'discovery';
  return ctx.stage === 'opening' ? 'opening' : ctx.stage;
}

// --- fact selection (memory) ------------------------------------------------

function pickFact(s: SellerSignals): string {
  if (s.asksAboutTime)
    return "Honestly, a new rep takes a good three to four months before they're pulling their weight.";
  if (s.asksAboutImpact)
    return 'The real cost is manager time — my team leads spend hours each week running mock calls instead of selling.';
  if (s.asksAboutProcess)
    return 'Right now onboarding is manager-led mock calls, some recorded-call reviews, and the occasional training session.';
  return "We've got around 150 reps, so anything manager-led doesn't scale well.";
}

// --- the decision function --------------------------------------------------

const ACK_LINES = [
  "Okay — that's a fairer point than I expected.",
  'Alright, I can see the logic there.',
  "Hm. That actually addresses part of my worry.",
];

/**
 * The core persona brain: given the full context, produce Rohan's next reply.
 * Pure and deterministic — no randomness, no clocks.
 */
export function selectReply(ctx: ConversationContext): ProviderReply {
  const s = analyzeSeller(ctx.sellerMessage);
  const pending = pendingObjection(ctx);
  const lastCustomer = [...ctx.transcript]
    .reverse()
    .find((t) => t.speaker === 'customer');

  // 1) Seller proposes a next step (demo). Rohan only agrees once he's warm
  //    enough AND has had at least one objection genuinely addressed.
  if (s.proposesNextStep) {
    const warmEnough = ctx.memory.receptiveness >= 60;
    const earned = ctx.memory.addressedObjections.length >= 1 && ctx.memory.sellerTurns >= 3;
    if (warmEnough && earned) {
      return {
        message:
          "Alright — you've actually addressed my main concerns. Set up a short demo with two of my team leads and I'll take a proper look.",
        agreedToNextStep: true,
        receptivenessDelta: 5,
        stageHint: 'next_step',
      };
    }
    // Deflect: too early. Raise a late-stage objection if one remains.
    const late = pickObjectionToRaise(ctx, { ...s, isPitch: false }) ??
      (['implementation_work', 'adoption', 'prove_performance'] as ObjectionKey[]).find(
        (k) => !ctx.objectionsRaised.includes(k),
      );
    if (late) {
      return {
        message: `A demo feels premature. ${OBJECTION_LINES[late]}`,
        raisedObjection: late,
        receptivenessDelta: -2,
        stageHint: 'objection_handling',
      };
    }
    return {
      message:
        "A demo feels premature — I still don't see how this beats what we already do. Convince me first.",
      receptivenessDelta: -3,
      stageHint: 'objection_handling',
    };
  }

  // 2) There's an unaddressed objection on the table. Treat a substantive
  //    reply as an attempt to answer it; a thin reply gets a nudge back.
  if (pending) {
    const looksLikeAnswer = s.wordCount >= 6 && !s.tooLong;
    if (looksLikeAnswer) {
      const ack = ACK_LINES[ctx.memory.addressedObjections.length % ACK_LINES.length];
      // Occasionally follow a handled objection with a fresh, relevant one.
      const next = pickObjectionToRaise(ctx, s);
      const follow = next ? ` ${OBJECTION_LINES[next]}` : ' What else should I know?';
      return {
        message: `${ack}${follow}`,
        addressedObjection: pending,
        raisedObjection: next,
        receptivenessDelta: 9,
        stageHint: 'objection_handling',
      };
    }
    return {
      message:
        "I don't think you answered my question. Can you be more specific?",
      receptivenessDelta: -4,
      stageHint: 'objection_handling',
    };
  }

  // 3) Seller pitches. Rohan is sceptical of claims — a pitch invites the
  //    "how is this different?" objection, and pitching before any discovery
  //    earns a sharper push-back.
  if (s.isPitch) {
    const early = ctx.memory.sellerTurns < 2 && !ctx.memory.askedAboutProcess;
    const obj = ctx.objectionsRaised.includes('generic_chatbot')
      ? undefined
      : ('generic_chatbot' as ObjectionKey);
    if (obj) {
      return {
        message: early
          ? `You're already pitching, but you don't know how we operate yet. ${OBJECTION_LINES[obj]}`
          : `That's a bold claim. ${OBJECTION_LINES[obj]}`,
        raisedObjection: obj,
        receptivenessDelta: -4,
        stageHint: early ? 'value_mapping' : 'objection_handling',
      };
    }
    return {
      message:
        "You're pitching hard, but I still don't see how this is different for my team specifically.",
      receptivenessDelta: -3,
      stageHint: 'value_mapping',
    };
  }

  // 4) Genuine discovery question. Share a relevant fact; occasionally surface
  //    the first objection naturally.
  if (s.isDiscoveryQuestion || (s.isQuestion && s.asksAboutProcess)) {
    const fact = pickFact(s);
    const obj = pickObjectionToRaise(ctx, s);
    const stage = detectStage(ctx, s, obj, false);
    const message = obj ? `${fact} ${OBJECTION_LINES[obj]}` : fact;
    // Avoid repeating the exact previous line.
    if (lastCustomer && lastCustomer.message === message) {
      return {
        message: `${fact} Anything else you want to dig into?`,
        rememberedFact: fact,
        receptivenessDelta: 4,
        stageHint: stage,
      };
    }
    return {
      message,
      rememberedFact: fact,
      raisedObjection: obj,
      receptivenessDelta: 6,
      stageHint: stage,
    };
  }

  // 5) Fallback — polite but unconvinced.
  return {
    message:
      "I'm not quite following — what exactly are you proposing, and how does it help my team?",
    receptivenessDelta: 0,
    stageHint: detectStage(ctx, s, undefined, false),
  };
}

/**
 * Update customer memory after a seller turn, given the reply the persona
 * produced. Pure: returns a new memory object, never mutates the input.
 */
export function updateCustomerMemory(
  prev: CustomerMemory,
  sellerMessage: string,
  reply: ProviderReply,
): CustomerMemory {
  const s = analyzeSeller(sellerMessage);
  const receptiveness = Math.max(
    0,
    Math.min(100, prev.receptiveness + (reply.receptivenessDelta ?? 0)),
  );
  return {
    sellerTurns: prev.sellerTurns + 1,
    receptiveness,
    facts: reply.rememberedFact ? [...prev.facts, reply.rememberedFact] : prev.facts,
    askedAboutProcess: prev.askedAboutProcess || s.asksAboutProcess,
    quantifiedValue: prev.quantifiedValue || s.quantifies,
    addressedObjections: reply.addressedObjection
      ? [...prev.addressedObjections, reply.addressedObjection]
      : prev.addressedObjections,
  };
}
