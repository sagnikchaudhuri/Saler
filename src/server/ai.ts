import { callLlmJson, isLlmConfigured, LlmError, type LlmConfig } from './llm';
import {
  CUSTOMER_SYSTEM_PROMPT,
  FINAL_EVALUATOR_SYSTEM_PROMPT,
  TURN_EVALUATOR_SYSTEM_PROMPT,
} from './prompts';
import { validateEvaluatorResult } from '../evaluation/validate';
import { validateFinalReport } from '../final/validate';

// ============================================================================
// Secure AI routes: /api/conversation, /api/evaluate-turn, /api/evaluate-final
// and a secret-free /api/ai-status capability probe.
//
// All are framework-agnostic so the Vercel adapters and the Vite dev
// middleware share the same logic. Prompts stay on the server; upstream bodies
// and keys never reach the browser.
// ============================================================================

export const MAX_TRANSCRIPT_TURNS = 40;
export const MAX_MESSAGE_LENGTH = 1_000;
export const MAX_TOTAL_TRANSCRIPT_CHARS = 12_000;
export const MAX_CUSTOMER_REPLY_CHARS = 600;

export type AiErrorCode = 'METHOD_NOT_ALLOWED' | 'INVALID_REQUEST' | 'AI_NOT_CONFIGURED' | 'AI_UNAVAILABLE';

export interface AiErrorBody {
  error: { code: AiErrorCode; message: string };
}

export interface JsonResult<T = unknown> {
  status: number;
  body: T | AiErrorBody;
}

export interface AiRequestLike {
  method?: string;
  rawBody?: string;
  contentType?: string;
}

const GENERIC_UNAVAILABLE = 'The AI service is temporarily unavailable.';

function err(status: number, code: AiErrorCode, message: string): JsonResult {
  return { status, body: { error: { code, message } } };
}

function reasonToResult(e: unknown): JsonResult {
  if (e instanceof LlmError) {
    if (e.reason === 'not-configured') return err(503, 'AI_NOT_CONFIGURED', GENERIC_UNAVAILABLE);
    if (e.reason === 'quota') return err(429, 'AI_UNAVAILABLE', GENERIC_UNAVAILABLE);
    if (e.reason === 'timeout') return err(504, 'AI_UNAVAILABLE', GENERIC_UNAVAILABLE);
  }
  return err(502, 'AI_UNAVAILABLE', GENERIC_UNAVAILABLE);
}

/** Shared method/content-type/JSON parsing for every AI route. */
function parseRequest(req: AiRequestLike): { ok: true; value: Record<string, unknown> } | { ok: false; result: JsonResult } {
  if ((req.method ?? '').toUpperCase() !== 'POST') {
    return { ok: false, result: err(405, 'METHOD_NOT_ALLOWED', 'Use POST.') };
  }
  const contentType = (req.contentType ?? '').toLowerCase();
  if (contentType && !contentType.includes('application/json')) {
    return { ok: false, result: err(415, 'INVALID_REQUEST', 'Send JSON.') };
  }
  if ((req.rawBody?.length ?? 0) > 64 * 1024) {
    return { ok: false, result: err(413, 'INVALID_REQUEST', 'Request body is too large.') };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(req.rawBody ?? '');
  } catch {
    return { ok: false, result: err(400, 'INVALID_REQUEST', 'Malformed request body.') };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, result: err(400, 'INVALID_REQUEST', 'Malformed request body.') };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

export interface WireTurn {
  speaker: 'seller' | 'customer';
  message: string;
}

/** Validate and bound the transcript. Keeps prompt size (and cost) in check. */
function readTranscript(value: unknown): { ok: true; turns: WireTurn[] } | { ok: false; result: JsonResult } {
  if (!Array.isArray(value)) {
    return { ok: false, result: err(400, 'INVALID_REQUEST', 'transcript must be an array.') };
  }
  if (value.length > MAX_TRANSCRIPT_TURNS) {
    return { ok: false, result: err(413, 'INVALID_REQUEST', 'Transcript is too long.') };
  }
  const turns: WireTurn[] = [];
  let total = 0;
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) {
      return { ok: false, result: err(400, 'INVALID_REQUEST', 'Malformed transcript entry.') };
    }
    const t = raw as Record<string, unknown>;
    if ((t.speaker !== 'seller' && t.speaker !== 'customer') || typeof t.message !== 'string') {
      return { ok: false, result: err(400, 'INVALID_REQUEST', 'Malformed transcript entry.') };
    }
    if (t.message.length > MAX_MESSAGE_LENGTH) {
      return { ok: false, result: err(413, 'INVALID_REQUEST', 'A transcript message is too long.') };
    }
    total += t.message.length;
    if (total > MAX_TOTAL_TRANSCRIPT_CHARS) {
      return { ok: false, result: err(413, 'INVALID_REQUEST', 'Transcript is too long.') };
    }
    turns.push({ speaker: t.speaker, message: t.message });
  }
  return { ok: true, turns };
}

function renderTranscript(turns: WireTurn[]): string {
  return turns
    .map((t) => `${t.speaker === 'seller' ? 'SELLER' : 'ROHAN'}: ${t.message}`)
    .join('\n');
}

// --- capability probe -------------------------------------------------------

/** Secret-free: reports only whether AI is configured. */
export function handleAiStatus(config: Pick<LlmConfig, 'apiKey'>): JsonResult<{ enabled: boolean }> {
  return { status: 200, body: { enabled: isLlmConfigured(config) } };
}

// --- customer conversation --------------------------------------------------

const STAGES = ['opening', 'discovery', 'impact', 'value_mapping', 'objection_handling', 'next_step'];
const OBJECTION_TYPES = ['existing_process', 'differentiation', 'security', 'roi', 'adoption', 'implementation', 'none'];
const SENTIMENTS = ['resistant', 'neutral', 'interested', 'receptive'];

export interface CustomerReplyPayload {
  customer_reply: string;
  current_stage: string;
  objection_raised: { raised: boolean; type: string };
  customer_sentiment: string;
  conversation_should_end: boolean;
}

/** Strict validation of the model's customer reply. */
export function validateCustomerPayload(x: unknown): CustomerReplyPayload | null {
  if (typeof x !== 'object' || x === null) return null;
  const o = x as Record<string, unknown>;

  const reply = o.customer_reply;
  if (typeof reply !== 'string' || reply.trim().length === 0) return null;
  if (reply.length > MAX_CUSTOMER_REPLY_CHARS) return null;
  // Reject markdown / stage directions leaking into dialogue.
  if (/[*_`#]|^\s*[-•]\s/m.test(reply)) return null;

  if (typeof o.current_stage !== 'string' || !STAGES.includes(o.current_stage)) return null;
  if (typeof o.customer_sentiment !== 'string' || !SENTIMENTS.includes(o.customer_sentiment)) return null;
  if (typeof o.conversation_should_end !== 'boolean') return null;

  const obj = o.objection_raised;
  if (typeof obj !== 'object' || obj === null) return null;
  const ob = obj as Record<string, unknown>;
  if (typeof ob.raised !== 'boolean') return null;
  if (typeof ob.type !== 'string' || !OBJECTION_TYPES.includes(ob.type)) return null;

  return {
    customer_reply: reply.trim(),
    current_stage: o.current_stage,
    objection_raised: { raised: ob.raised, type: ob.type },
    customer_sentiment: o.customer_sentiment,
    conversation_should_end: o.conversation_should_end,
  };
}

export async function handleConversationRequest(
  req: AiRequestLike,
  config: LlmConfig,
): Promise<JsonResult> {
  const parsed = parseRequest(req);
  if (!parsed.ok) return parsed.result;

  const sellerMessage = parsed.value.sellerMessage;
  if (typeof sellerMessage !== 'string' || sellerMessage.trim().length === 0) {
    return err(400, 'INVALID_REQUEST', 'sellerMessage is required.');
  }
  if (sellerMessage.length > MAX_MESSAGE_LENGTH) {
    return err(413, 'INVALID_REQUEST', 'sellerMessage is too long.');
  }
  const transcript = readTranscript(parsed.value.transcript ?? []);
  if (!transcript.ok) return transcript.result;

  const alreadyRaised = Array.isArray(parsed.value.objectionsRaised)
    ? (parsed.value.objectionsRaised as unknown[]).filter((v): v is string => typeof v === 'string').slice(0, 10)
    : [];

  const user = [
    `Conversation so far:\n${renderTranscript(transcript.turns) || '(none)'}`,
    `Objections you have already raised: ${alreadyRaised.length ? alreadyRaised.join(', ') : 'none'}`,
    `The seller just said: "${sellerMessage.trim()}"`,
    'Reply as Rohan in JSON.',
  ].join('\n\n');

  try {
    const raw = await callLlmJson(
      { system: CUSTOMER_SYSTEM_PROMPT, user, maxOutputTokens: 220, temperature: 0.8 },
      config,
    );
    const valid = validateCustomerPayload(raw);
    if (!valid) return err(502, 'AI_UNAVAILABLE', GENERIC_UNAVAILABLE);
    return { status: 200, body: valid };
  } catch (e) {
    return reasonToResult(e);
  }
}

// --- real-time turn evaluation ---------------------------------------------

export async function handleEvaluateTurnRequest(
  req: AiRequestLike,
  config: LlmConfig,
): Promise<JsonResult> {
  const parsed = parseRequest(req);
  if (!parsed.ok) return parsed.result;

  const sellerMessage = parsed.value.sellerMessage;
  if (typeof sellerMessage !== 'string' || sellerMessage.trim().length === 0) {
    return err(400, 'INVALID_REQUEST', 'sellerMessage is required.');
  }
  if (sellerMessage.length > MAX_MESSAGE_LENGTH) {
    return err(413, 'INVALID_REQUEST', 'sellerMessage is too long.');
  }
  const transcript = readTranscript(parsed.value.transcript ?? []);
  if (!transcript.ok) return transcript.result;

  const latestCustomer =
    typeof parsed.value.latestCustomerStatement === 'string'
      ? parsed.value.latestCustomerStatement.slice(0, MAX_MESSAGE_LENGTH)
      : '';
  const stage = typeof parsed.value.stage === 'string' && STAGES.includes(parsed.value.stage)
    ? parsed.value.stage
    : 'opening';

  const user = [
    `Recent conversation:\n${renderTranscript(transcript.turns.slice(-8)) || '(none)'}`,
    `Rohan's last statement: "${latestCustomer || '(none)'}"`,
    `Current stage: ${stage}`,
    `Evaluate ONLY this seller turn: "${sellerMessage.trim()}"`,
  ].join('\n\n');

  try {
    const raw = await callLlmJson(
      { system: TURN_EVALUATOR_SYSTEM_PROMPT, user, maxOutputTokens: 320, temperature: 0 },
      config,
    );
    // Reuse the exact same validator the deterministic evaluator is held to.
    const validated = validateEvaluatorResult(raw);
    if (!validated.ok || !validated.value) return err(502, 'AI_UNAVAILABLE', GENERIC_UNAVAILABLE);
    return { status: 200, body: validated.value };
  } catch (e) {
    return reasonToResult(e);
  }
}

// --- final transcript evaluation -------------------------------------------

export async function handleEvaluateFinalRequest(
  req: AiRequestLike,
  config: LlmConfig,
): Promise<JsonResult> {
  const parsed = parseRequest(req);
  if (!parsed.ok) return parsed.result;

  const transcript = readTranscript(parsed.value.transcript ?? []);
  if (!transcript.ok) return transcript.result;

  const objectionLabels = Array.isArray(parsed.value.objectionLabels)
    ? (parsed.value.objectionLabels as unknown[]).filter((v): v is string => typeof v === 'string').slice(0, 10)
    : [];
  const liveAverage = typeof parsed.value.liveAverage === 'number' ? parsed.value.liveAverage : 0;
  const finalStage = typeof parsed.value.finalStage === 'string' ? parsed.value.finalStage : 'opening';

  const sellerMessages = transcript.turns.filter((t) => t.speaker === 'seller').map((t) => t.message);

  const user = [
    `Full transcript:\n${renderTranscript(transcript.turns) || '(none)'}`,
    `Objections actually raised: ${objectionLabels.length ? objectionLabels.join(' | ') : 'none'}`,
    `Final stage reached: ${finalStage}. Live average score: ${Math.round(liveAverage)}.`,
    'Produce the coaching report JSON.',
  ].join('\n\n');

  try {
    const raw = await callLlmJson(
      { system: FINAL_EVALUATOR_SYSTEM_PROMPT, user, maxOutputTokens: 900, temperature: 0.2 },
      config,
    );
    // Enforce "no invented statements / objections" on the server too.
    const validated = validateFinalReport(raw, {
      sellerMessages: new Set(sellerMessages),
      raisedObjectionLabels: new Set(objectionLabels),
    });
    if (!validated.ok || !validated.value) return err(502, 'AI_UNAVAILABLE', GENERIC_UNAVAILABLE);
    return { status: 200, body: validated.value };
  } catch (e) {
    return reasonToResult(e);
  }
}
