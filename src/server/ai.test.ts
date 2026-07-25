import { describe, it, expect, vi } from 'vitest';
import {
  handleAiStatus,
  handleConversationRequest,
  handleEvaluateFinalRequest,
  handleEvaluateTurnRequest,
  validateCustomerPayload,
  MAX_TRANSCRIPT_TURNS,
} from './ai';
import { extractJsonText, parseModelJson, LlmError } from './llm';
import { emptySignals } from '../evaluation/validate';

const SECRET = 'sk-proj-do-not-leak-me-abcdefghijklmnop';

/** Build a fake OpenAI-compatible chat-completions response. */
function modelResponse(content: unknown, status = 200): Response {
  const body = JSON.stringify({
    choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }],
  });
  return new Response(body, { status, headers: { 'content-type': 'application/json' } });
}

function cfg(fetchImpl: typeof fetch, over: Record<string, unknown> = {}) {
  return { apiKey: SECRET, fetchImpl, ...over };
}

function post(body: unknown) {
  return { method: 'POST', rawBody: JSON.stringify(body), contentType: 'application/json' };
}

const VALID_CUSTOMER = {
  customer_reply: 'We run manager-led mock calls today.',
  current_stage: 'discovery',
  objection_raised: { raised: false, type: 'none' },
  customer_sentiment: 'neutral',
  conversation_should_end: false,
};

describe('/api/ai-status', () => {
  const CAP = 'capability-signing-secret';

  it('reports disabled with no key and never leaks anything', () => {
    const r = handleAiStatus({ apiKey: undefined });
    expect(r.body).toEqual({ enabled: false });
  });

  it('reports DISABLED with a key but no capability secret (fail-closed)', () => {
    // A key alone must not enable AI — capability protection is mandatory.
    const r = handleAiStatus({ apiKey: SECRET });
    expect(r.body).toEqual({ enabled: false });
  });

  it('reports enabled only when key AND capability secret are present', () => {
    const r = handleAiStatus({ apiKey: SECRET, capabilitySecret: CAP });
    expect(r.body).toEqual({ enabled: true });
    const s = JSON.stringify(r.body);
    expect(s).not.toContain(SECRET);
    expect(s).not.toContain(CAP);
  });

  it('reports disabled with a capability secret but no key', () => {
    expect(handleAiStatus({ capabilitySecret: CAP }).body).toEqual({ enabled: false });
  });
});

describe('/api/conversation', () => {
  const noFetch = vi.fn() as unknown as typeof fetch;

  it('rejects non-POST', async () => {
    const r = await handleConversationRequest({ method: 'GET' }, cfg(noFetch));
    expect(r.status).toBe(405);
    expect(noFetch).not.toHaveBeenCalled();
  });

  it('rejects a malformed body', async () => {
    const r = await handleConversationRequest(
      { method: 'POST', rawBody: '{bad', contentType: 'application/json' },
      cfg(noFetch),
    );
    expect(r.status).toBe(400);
  });

  it('requires a seller message', async () => {
    expect((await handleConversationRequest(post({}), cfg(noFetch))).status).toBe(400);
  });

  it('rejects an oversized transcript before calling the model', async () => {
    const transcript = Array.from({ length: MAX_TRANSCRIPT_TURNS + 1 }, () => ({
      speaker: 'seller', message: 'x',
    }));
    const r = await handleConversationRequest(post({ sellerMessage: 'hi', transcript }), cfg(noFetch));
    expect(r.status).toBe(413);
    expect(noFetch).not.toHaveBeenCalled();
  });

  it('rejects an oversized single message', async () => {
    const r = await handleConversationRequest(
      post({ sellerMessage: 'x'.repeat(1001) }),
      cfg(noFetch),
    );
    expect(r.status).toBe(413);
  });

  it('returns a generic error when no key is configured', async () => {
    const r = await handleConversationRequest(post({ sellerMessage: 'hi' }), cfg(noFetch, { apiKey: undefined }));
    expect(r.status).toBe(503);
    expect(noFetch).not.toHaveBeenCalled();
  });

  it('returns a validated customer reply', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(modelResponse(VALID_CUSTOMER)) as unknown as typeof fetch;
    const r = await handleConversationRequest(post({ sellerMessage: 'How do you train reps?' }), cfg(fetchImpl));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ customer_reply: VALID_CUSTOMER.customer_reply });
  });

  it('never returns the key or the system prompt to the browser', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(modelResponse(VALID_CUSTOMER)) as unknown as typeof fetch;
    const r = await handleConversationRequest(post({ sellerMessage: 'hi' }), cfg(fetchImpl));
    const serialised = JSON.stringify(r.body);
    expect(serialised).not.toContain(SECRET);
    expect(serialised).not.toMatch(/You role-play Divika Mishra/i);
  });

  it('sends the key only in the Authorization header', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(modelResponse(VALID_CUSTOMER)) as unknown as typeof fetch;
    await handleConversationRequest(post({ sellerMessage: 'hi' }), cfg(fetchImpl));
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toContain(SECRET);
    expect(url).not.toContain(SECRET);
    expect(init.body).not.toContain(SECRET);
  });

  it('rejects a malformed model response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(modelResponse('not json at all')) as unknown as typeof fetch;
    const r = await handleConversationRequest(post({ sellerMessage: 'hi' }), cfg(fetchImpl));
    expect(r.status).toBe(502);
  });

  it('rejects a reply that breaks the schema', async () => {
    const bad = { ...VALID_CUSTOMER, current_stage: 'closing' };
    const fetchImpl = vi.fn().mockResolvedValue(modelResponse(bad)) as unknown as typeof fetch;
    expect((await handleConversationRequest(post({ sellerMessage: 'hi' }), cfg(fetchImpl))).status).toBe(502);
  });

  it('maps upstream auth failure without leaking the body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('{"error":{"message":"Incorrect API key provided: sk-abc"}}', { status: 401 }),
    ) as unknown as typeof fetch;
    const r = await handleConversationRequest(post({ sellerMessage: 'hi' }), cfg(fetchImpl));
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.body)).not.toMatch(/Incorrect API key/i);
  });

  it('reports only the short upstream error code to the server diagnostic', async () => {
    // Observed live: OpenAI returns 429 + insufficient_quota when a project
    // has no credit. The code must reach the operator, never the browser.
    const codes: string[] = [];
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: 'You exceeded your quota, key sk-secret', code: 'insufficient_quota' } }),
        { status: 429, headers: { 'content-type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;

    const r = await handleConversationRequest(
      post({ sellerMessage: 'hi' }),
      cfg(fetchImpl, { onUpstreamErrorCode: (c: string) => codes.push(c) }),
    );

    expect(codes).toEqual(['insufficient_quota']);
    // The upstream message (and anything in it) never reaches the client.
    expect(JSON.stringify(r.body)).not.toMatch(/quota|sk-secret/i);
  });

  it('maps a rate limit to 429', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('slow down', { status: 429 })) as unknown as typeof fetch;
    expect((await handleConversationRequest(post({ sellerMessage: 'hi' }), cfg(fetchImpl))).status).toBe(429);
  });

  it('maps a timeout to 504', async () => {
    const fetchImpl = vi.fn().mockImplementation(
      (_u: string, init: RequestInit) =>
        new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(new Error('aborted')))),
    ) as unknown as typeof fetch;
    const r = await handleConversationRequest(post({ sellerMessage: 'hi' }), cfg(fetchImpl, { timeoutMs: 10 }));
    expect(r.status).toBe(504);
  });
});

describe('customer payload validation', () => {
  it('accepts a well-formed reply', () => {
    expect(validateCustomerPayload(VALID_CUSTOMER)).not.toBeNull();
  });

  it('rejects markdown in the dialogue', () => {
    expect(validateCustomerPayload({ ...VALID_CUSTOMER, customer_reply: 'Sure **bold**' })).toBeNull();
    expect(validateCustomerPayload({ ...VALID_CUSTOMER, customer_reply: '- a bullet' })).toBeNull();
  });

  it('rejects an over-long reply (concise replies only)', () => {
    expect(validateCustomerPayload({ ...VALID_CUSTOMER, customer_reply: 'x'.repeat(601) })).toBeNull();
  });

  it('rejects an unknown objection type or sentiment', () => {
    expect(validateCustomerPayload({ ...VALID_CUSTOMER, objection_raised: { raised: true, type: 'weird' } })).toBeNull();
    expect(validateCustomerPayload({ ...VALID_CUSTOMER, customer_sentiment: 'angry' })).toBeNull();
  });

  it('rejects an empty reply', () => {
    expect(validateCustomerPayload({ ...VALID_CUSTOMER, customer_reply: '   ' })).toBeNull();
  });
});

describe('/api/evaluate-turn', () => {
  const validResult = {
    signals: emptySignals(),
    brief_feedback: 'ok',
    recommended_next_move: 'continue',
    detected_stage: 'discovery',
  };

  it('returns validated signals', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(modelResponse(validResult)) as unknown as typeof fetch;
    const r = await handleEvaluateTurnRequest(post({ sellerMessage: 'How do you train reps?' }), cfg(fetchImpl));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ detected_stage: 'discovery' });
  });

  it('rejects a response where the model invents metric scores instead of signals', async () => {
    const bad = { discovery: 80, relevance: 70 };
    const fetchImpl = vi.fn().mockResolvedValue(modelResponse(bad)) as unknown as typeof fetch;
    expect((await handleEvaluateTurnRequest(post({ sellerMessage: 'hi' }), cfg(fetchImpl))).status).toBe(502);
  });

  it('rejects incomplete signal sets', async () => {
    const bad = { ...validResult, signals: { asked_open_question: true } };
    const fetchImpl = vi.fn().mockResolvedValue(modelResponse(bad)) as unknown as typeof fetch;
    expect((await handleEvaluateTurnRequest(post({ sellerMessage: 'hi' }), cfg(fetchImpl))).status).toBe(502);
  });

  it('requires a seller message', async () => {
    const noFetch = vi.fn() as unknown as typeof fetch;
    expect((await handleEvaluateTurnRequest(post({}), cfg(noFetch))).status).toBe(400);
  });
});

describe('/api/evaluate-final', () => {
  const sellerLine = 'How do you currently train new reps?';
  // The route now accepts NARRATIVE ONLY — no scores. Scores are recomputed
  // deterministically on the client.
  const baseNarrative = {
    strengths: ['Asked about the current onboarding process.'],
    missed_opportunities: ['Did not quantify impact.', 'No next step.', 'No decision-maker.'],
    strongest_statement: sellerLine,
    weakest_statement: '',
    better_response: 'Try quantifying the impact before pitching.',
    missed_discovery_questions: ['What timeline are you targeting?'],
    recommended_practice: 'Practice quantifying impact.',
    summary: 'A solid opening question, thin on impact.',
  };
  const body = {
    transcript: [{ speaker: 'seller', message: sellerLine }],
    objectionLabels: [],
    liveAverage: 50,
    finalStage: 'discovery',
  };

  it('returns a validated narrative with no score fields', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(modelResponse(baseNarrative)) as unknown as typeof fetch;
    const r = await handleEvaluateFinalRequest(post(body), cfg(fetchImpl));
    expect(r.status).toBe(200);
    // The route must never emit a score — deterministic code owns those.
    expect(r.body).not.toHaveProperty('overall_score');
    expect(r.body).not.toHaveProperty('category_scores');
  });

  it('rejects an invented strongest statement', async () => {
    const bad = { ...baseNarrative, strongest_statement: 'I never said this.' };
    const fetchImpl = vi.fn().mockResolvedValue(modelResponse(bad)) as unknown as typeof fetch;
    expect((await handleEvaluateFinalRequest(post(body), cfg(fetchImpl))).status).toBe(502);
  });

  it('rejects a narrative that tries to smuggle in a score', async () => {
    const bad = { ...baseNarrative, overall_score: 100 };
    const fetchImpl = vi.fn().mockResolvedValue(modelResponse(bad)) as unknown as typeof fetch;
    expect((await handleEvaluateFinalRequest(post(body), cfg(fetchImpl))).status).toBe(502);
  });

  it('rejects a narrative that tries to supply objection results', async () => {
    const bad = {
      ...baseNarrative,
      objection_results: [{ objection: 'Something never raised', handled: true, explanation: 'e' }],
    };
    const fetchImpl = vi.fn().mockResolvedValue(modelResponse(bad)) as unknown as typeof fetch;
    expect((await handleEvaluateFinalRequest(post(body), cfg(fetchImpl))).status).toBe(502);
  });

  it('rejects a narrative with too many strengths', async () => {
    const bad = { ...baseNarrative, strengths: ['a', 'b', 'c', 'd'] };
    const fetchImpl = vi.fn().mockResolvedValue(modelResponse(bad)) as unknown as typeof fetch;
    expect((await handleEvaluateFinalRequest(post(body), cfg(fetchImpl))).status).toBe(502);
  });

  it('rejects a narrative with an invented team-size fact', async () => {
    const bad = { ...baseNarrative, summary: 'You never asked about their 400 reps.' };
    const fetchImpl = vi.fn().mockResolvedValue(modelResponse(bad)) as unknown as typeof fetch;
    expect((await handleEvaluateFinalRequest(post(body), cfg(fetchImpl))).status).toBe(502);
  });
});

describe('JSON extraction', () => {
  it('unwraps a markdown-fenced JSON block', () => {
    expect(extractJsonText('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJsonText('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('parses plain JSON', () => {
    expect(parseModelJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('refuses prose and never guesses at repairs', () => {
    expect(() => parseModelJson('Sure! Here is the answer.')).toThrow(LlmError);
    expect(() => parseModelJson('{"a":')).toThrow(LlmError);
  });
});
