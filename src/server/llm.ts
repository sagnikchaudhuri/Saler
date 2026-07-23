// ============================================================================
// Shared LLM client for the secure server routes.
//
// OpenAI-compatible chat-completions with JSON output. Kept framework-agnostic
// and dependency-injected so the Vercel functions, the Vite dev middleware, and
// unit tests all share identical logic.
//
// SECURITY: the API key is supplied by the adapter (which reads the server
// environment). It is never returned, logged, echoed, or interpolated into an
// error. Upstream response bodies are never forwarded to the browser, and
// system prompts never leave the server.
// ============================================================================

export const DEFAULT_LLM_MODEL = 'gpt-4o-mini';
export const LLM_TIMEOUT_MS = 20_000;

export type LlmFailureReason =
  | 'not-configured'
  | 'auth'
  | 'quota'
  | 'timeout'
  | 'network'
  | 'invalid-response';

export class LlmError extends Error {
  constructor(
    readonly reason: LlmFailureReason,
    message = 'The AI service is temporarily unavailable.',
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export interface LlmConfig {
  apiKey?: string;
  /** Allows OpenAI-compatible gateways; defaults to OpenAI. */
  baseUrl?: string;
  model?: string;
  fetchImpl: typeof fetch;
  timeoutMs?: number;
  /** Server-side diagnostic: receives ONLY a numeric status. */
  onUpstreamStatus?: (status: number) => void;
  /**
   * Server-side diagnostic receiving ONLY the provider's short error
   * classification (e.g. "insufficient_quota", "rate_limit_exceeded"). Never
   * the message, never the key, and never forwarded to the browser. Lets an
   * operator tell "out of credit" from "too fast" without leaking anything.
   */
  onUpstreamErrorCode?: (code: string) => void;
}

export interface LlmRequest {
  /** Server-owned instructions. Never sent to or returned to the browser. */
  system: string;
  user: string;
  /** Hard cap on generated tokens — the main cost control. */
  maxOutputTokens: number;
  temperature?: number;
}

export function isLlmConfigured(config: Pick<LlmConfig, 'apiKey'>): boolean {
  return typeof config.apiKey === 'string' && config.apiKey.trim().length > 0;
}

/**
 * Strip a markdown code fence if the model wrapped its JSON in one.
 * Deliberately conservative: it only unwraps a fence, it does not attempt to
 * repair broken JSON (a permissive parser would risk accepting junk).
 */
export function extractJsonText(raw: string): string {
  const text = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  return (fenced ? fenced[1] : text).trim();
}

/** Parse model output into an unknown object, or throw an LlmError. */
export function parseModelJson(raw: string): unknown {
  const text = extractJsonText(raw);
  if (!text.startsWith('{')) {
    throw new LlmError('invalid-response');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new LlmError('invalid-response');
  }
}

interface ChatCompletionShape {
  choices?: { message?: { content?: unknown } }[];
}

/**
 * Call the model and return the parsed JSON object. Callers must still
 * validate the shape against their own schema.
 */
export async function callLlmJson(
  request: LlmRequest,
  config: LlmConfig,
): Promise<unknown> {
  const apiKey = config.apiKey?.trim();
  if (!apiKey) throw new LlmError('not-configured');

  const baseUrl = (config.baseUrl?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = config.model?.trim() || DEFAULT_LLM_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? LLM_TIMEOUT_MS);

  let response: Response;
  try {
    response = await config.fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxOutputTokens,
        // Structured-output capability: ask for guaranteed JSON.
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
      }),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    throw new LlmError(controller.signal.aborted ? 'timeout' : 'network');
  }
  clearTimeout(timer);

  if (!response.ok) {
    config.onUpstreamStatus?.(response.status);
    // Extract ONLY the short error classification for server-side diagnosis.
    if (config.onUpstreamErrorCode) {
      try {
        const body: unknown = await response.json();
        const e = (body as { error?: { code?: unknown; type?: unknown } })?.error;
        const code = typeof e?.code === 'string' ? e.code : typeof e?.type === 'string' ? e.type : 'unknown';
        // Guard against a provider echoing something unexpected/large.
        config.onUpstreamErrorCode(code.slice(0, 40));
      } catch {
        config.onUpstreamErrorCode('unreadable');
      }
    }
    if (response.status === 401 || response.status === 403) throw new LlmError('auth');
    if (response.status === 402 || response.status === 429) throw new LlmError('quota');
    throw new LlmError('network');
  }

  let payload: ChatCompletionShape;
  try {
    payload = (await response.json()) as ChatCompletionShape;
  } catch {
    throw new LlmError('invalid-response');
  }

  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new LlmError('invalid-response');
  }
  return parseModelJson(content);
}
