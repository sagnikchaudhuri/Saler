import type { LlmConfig } from '../src/server/llm';

/**
 * Reads LLM credentials from the SERVER environment only. Never imported by
 * client code, never exposed through a VITE_ variable.
 *
 * The two diagnostics below mirror what the dev middleware logs so production
 * failures are debuggable. They receive ONLY a numeric HTTP status and the
 * provider's short error classification (e.g. "insufficient_quota") — never a
 * key, never a message, never an upstream body.
 */
export function llmConfigFromEnv(): LlmConfig {
  return {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL,
    model: process.env.LLM_MODEL,
    fetchImpl: fetch,
    onUpstreamStatus: (status) => console.warn(`[api/ai] upstream responded ${status}`),
    onUpstreamErrorCode: (code) => console.warn(`[api/ai] upstream error code: ${code}`),
  };
}
