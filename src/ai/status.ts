// ============================================================================
// AI capability probe.
//
// The browser cannot know whether the server holds an LLM key, so it asks a
// secret-free endpoint once. This lets the UI label AI vs Demo HONESTLY from
// the start rather than claiming AI and silently degrading on first failure.
// ============================================================================

export interface AiStatus {
  enabled: boolean;
}

let cached: Promise<AiStatus> | null = null;

export async function fetchAiStatus(
  fetchImpl: typeof fetch = fetch,
  endpoint = '/api/ai-status',
): Promise<AiStatus> {
  try {
    const res = await fetchImpl(endpoint, { method: 'GET' });
    if (!res.ok) return { enabled: false };
    const body: unknown = await res.json();
    if (typeof body === 'object' && body !== null && typeof (body as { enabled?: unknown }).enabled === 'boolean') {
      return { enabled: (body as { enabled: boolean }).enabled };
    }
    return { enabled: false };
  } catch {
    // No server route (e.g. static preview) → Demo Mode. Never an error state.
    return { enabled: false };
  }
}

/** Probe once per page load. */
export function getAiStatus(): Promise<AiStatus> {
  if (!cached) cached = fetchAiStatus();
  return cached;
}

/** Test helper: clears the memoised probe. */
export function resetAiStatusCache(): void {
  cached = null;
}
