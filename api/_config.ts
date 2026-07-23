import type { LlmConfig } from '../src/server/llm';

/**
 * Reads LLM credentials from the SERVER environment only. Never imported by
 * client code, never exposed through a VITE_ variable.
 */
export function llmConfigFromEnv(): LlmConfig {
  return {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL,
    model: process.env.LLM_MODEL,
    fetchImpl: fetch,
  };
}
