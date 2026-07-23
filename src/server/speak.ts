// ============================================================================
// Core logic for POST /api/speak.
//
// Deliberately framework-agnostic and dependency-injected so it can be unit
// tested without a server, and so the SAME logic serves both the Vercel
// function and the Vite dev middleware.
//
// SECURITY: the API key is passed in by the adapter (which reads it from the
// server environment). It is never returned, logged, interpolated into an
// error, or echoed back in any form. Upstream response bodies are never
// forwarded to the client.
// ============================================================================

/** Max characters accepted. Roleplay replies are short by design (credits!). */
export const MAX_SPEAK_TEXT_LENGTH = 600;

/** Upstream request timeout. */
export const SPEAK_TIMEOUT_MS = 15_000;

export type SpeakErrorCode =
  | 'METHOD_NOT_ALLOWED'
  | 'INVALID_REQUEST'
  | 'VOICE_NOT_CONFIGURED'
  | 'VOICE_UNAVAILABLE';

export interface SpeakErrorBody {
  error: { code: SpeakErrorCode; message: string };
}

export interface SpeakResult {
  status: number;
  /** Audio payload when successful. */
  audio?: ArrayBuffer;
  contentType?: string;
  /** Safe JSON error body when unsuccessful. */
  body?: SpeakErrorBody;
}

export interface SpeakRequestLike {
  method?: string;
  /** Raw request body text (already read by the adapter). */
  rawBody?: string;
  contentType?: string;
}

export interface SpeakDeps {
  apiKey?: string;
  voiceId?: string;
  fetchImpl: typeof fetch;
  timeoutMs?: number;
  /** Injectable for deterministic tests. */
  now?: () => number;
  /**
   * Optional server-side diagnostic receiving ONLY the upstream numeric status.
   * Never receives the key or the response body.
   */
  onUpstreamStatus?: (status: number) => void;
}

function errorResult(status: number, code: SpeakErrorCode, message: string): SpeakResult {
  return { status, body: { error: { code, message } } };
}

/** Generic message — never reveals whether a particular secret exists. */
const GENERIC_UNAVAILABLE = 'Voice output is temporarily unavailable.';

export async function handleSpeakRequest(
  req: SpeakRequestLike,
  deps: SpeakDeps,
): Promise<SpeakResult> {
  // --- method ---
  if ((req.method ?? '').toUpperCase() !== 'POST') {
    return errorResult(405, 'METHOD_NOT_ALLOWED', 'Use POST.');
  }

  // --- content type (advisory; some clients omit it) ---
  const contentType = (req.contentType ?? '').toLowerCase();
  if (contentType && !contentType.includes('application/json')) {
    return errorResult(415, 'INVALID_REQUEST', 'Send JSON.');
  }

  // --- body ---
  let parsed: unknown;
  try {
    parsed = JSON.parse(req.rawBody ?? '');
  } catch {
    return errorResult(400, 'INVALID_REQUEST', 'Malformed request body.');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return errorResult(400, 'INVALID_REQUEST', 'Malformed request body.');
  }

  const rawText = (parsed as { text?: unknown }).text;
  if (typeof rawText !== 'string') {
    return errorResult(400, 'INVALID_REQUEST', 'A text field is required.');
  }
  const text = rawText.trim();
  if (text.length === 0) {
    return errorResult(400, 'INVALID_REQUEST', 'Text must not be empty.');
  }
  if (text.length > MAX_SPEAK_TEXT_LENGTH) {
    return errorResult(
      413,
      'INVALID_REQUEST',
      `Text must be ${MAX_SPEAK_TEXT_LENGTH} characters or fewer.`,
    );
  }

  // --- server configuration ---
  // The voice ID is taken from server configuration, NOT from the client, so a
  // caller can never point us at an arbitrary voice.
  const apiKey = deps.apiKey?.trim();
  const voiceId = deps.voiceId?.trim();
  if (!apiKey || !voiceId) {
    // One generic code for either missing value: never disclose which.
    return errorResult(503, 'VOICE_NOT_CONFIGURED', GENERIC_UNAVAILABLE);
  }

  // --- upstream call ---
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), deps.timeoutMs ?? SPEAK_TIMEOUT_MS);

  try {
    const response = await deps.fetchImpl(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      // Server-side diagnostic ONLY: the numeric status, never the key and
      // never the upstream body. Helps operators tell "bad key" from "bad
      // voice id" without leaking anything.
      deps.onUpstreamStatus?.(response.status);
      // Map upstream status to a safe, generic client error. The upstream body
      // is deliberately NOT read or forwarded.
      // 402 (payment required / out of credits) and 429 (rate limit) are both
      // "quota" conditions: recoverable, and the client should fall back for
      // this utterance without disabling the provider permanently.
      const isQuota = response.status === 402 || response.status === 429;
      return errorResult(isQuota ? 429 : 502, 'VOICE_UNAVAILABLE', GENERIC_UNAVAILABLE);
    }

    const upstreamType = response.headers.get('content-type') ?? '';
    if (!upstreamType.toLowerCase().startsWith('audio/')) {
      return errorResult(502, 'VOICE_UNAVAILABLE', GENERIC_UNAVAILABLE);
    }

    const audio = await response.arrayBuffer();
    if (!audio || audio.byteLength === 0) {
      return errorResult(502, 'VOICE_UNAVAILABLE', GENERIC_UNAVAILABLE);
    }

    return { status: 200, audio, contentType: 'audio/mpeg' };
  } catch {
    // Timeout, abort, DNS failure, TLS failure — all surface identically.
    return errorResult(504, 'VOICE_UNAVAILABLE', GENERIC_UNAVAILABLE);
  } finally {
    clearTimeout(timeout);
  }
}
