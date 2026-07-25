import type { LlmConfig } from '../src/server/llm';
import { isLlmConfigured } from '../src/server/llm';
import type { GuardDeps } from '../src/server/aiGuard';
import { createRateLimiter } from '../src/server/rateLimit';
import { handleAiCapability, type AiStatusConfig, type JsonResult } from '../src/server/ai';

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

// One limiter shared across all three AI routes and the capability route WITHIN
// a serverless instance. NOTE: instances are ephemeral and independent, so this
// bounds a single hot instance — it is a runaway-loop guard, not a globally
// distributed quota. Swap for a shared store to make it deployment-wide.
const aiLimiter = createRateLimiter({ limit: 40, windowMs: 60_000 });

/** Shared abuse-guard dependencies for the AI routes. */
export function aiSecurityFromEnv(): GuardDeps {
  return {
    rateLimiter: aiLimiter,
    capabilitySecret: process.env.AI_CAPABILITY_SECRET,
    // Enables the fail-closed gate: a key without a capability secret is refused.
    apiKeyConfigured: isLlmConfigured({ apiKey: process.env.OPENAI_API_KEY }),
  };
}

/** Config for the `/api/ai-status` probe (key + capability secret). */
export function aiStatusFromEnv(): AiStatusConfig {
  return {
    apiKey: process.env.OPENAI_API_KEY,
    capabilitySecret: process.env.AI_CAPABILITY_SECRET,
  };
}

/** Mint a capability token (or `{token:null}` when no secret is configured). */
export function issueCapability(now?: number): JsonResult {
  return handleAiCapability(process.env.AI_CAPABILITY_SECRET, now);
}

// One-time server-side configuration diagnostic. Never prints a secret. Warns
// exactly once per instance when a key is present but AI is fail-closed for lack
// of a capability secret, so the misconfiguration is visible in logs.
if (isLlmConfigured({ apiKey: process.env.OPENAI_API_KEY }) && !process.env.AI_CAPABILITY_SECRET) {
  console.warn(
    '[api/ai] OPENAI_API_KEY is set but AI_CAPABILITY_SECRET is missing — AI is DISABLED (fail-closed). Set AI_CAPABILITY_SECRET to enable AI.',
  );
}
