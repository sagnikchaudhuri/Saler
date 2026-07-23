import { handleSpeakRequest } from '../src/server/speak';
import { createRateLimiter } from '../src/server/rateLimit';

// ============================================================================
// POST /api/speak — Vercel serverless adapter.
//
// This is the ONLY place the ElevenLabs key is read, and it never leaves the
// server: the browser receives audio bytes or a generic JSON error. Structural
// request/response types keep this free of a @vercel/node dependency.
// ============================================================================

interface NodeRequestLike {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  on(event: 'data', cb: (chunk: Uint8Array) => void): void;
  on(event: 'end', cb: () => void): void;
  on(event: 'error', cb: (err: unknown) => void): void;
}

interface NodeResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(chunk?: string | Uint8Array): void;
}

const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

function readBody(req: NodeRequestLike): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.byteLength;
      // Hard cap so an oversized upload cannot exhaust memory.
      if (size > 64 * 1024) {
        reject(new Error('body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const total = new Uint8Array(size);
      let offset = 0;
      for (const c of chunks) {
        total.set(c, offset);
        offset += c.byteLength;
      }
      resolve(new TextDecoder().decode(total));
    });
    req.on('error', reject);
  });
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(
  req: NodeRequestLike,
  res: NodeResponseLike,
): Promise<void> {
  const clientKey =
    firstHeader(req.headers['x-forwarded-for'])?.split(',')[0]?.trim() ?? 'local';

  if (!limiter.check(clientKey)) {
    res.statusCode = 429;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: { code: 'VOICE_UNAVAILABLE', message: 'Too many requests. Try again shortly.' },
      }),
    );
    return;
  }

  let rawBody = '';
  try {
    rawBody = await readBody(req);
  } catch {
    res.statusCode = 413;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: { code: 'INVALID_REQUEST', message: 'Request body is too large.' },
      }),
    );
    return;
  }

  const result = await handleSpeakRequest(
    {
      method: req.method,
      rawBody,
      contentType: firstHeader(req.headers['content-type']),
    },
    {
      // Server-side only. Never exposed to the client, never logged.
      apiKey: process.env.ELEVENLABS_API_KEY,
      voiceId: process.env.ELEVENLABS_VOICE_ID,
      fetchImpl: fetch,
      // Numeric status only — no key, no upstream body.
      onUpstreamStatus: (status) => console.warn(`[api/speak] upstream responded ${status}`),
    },
  );

  res.statusCode = result.status;
  if (result.audio && result.contentType) {
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.end(new Uint8Array(result.audio));
    return;
  }
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(result.body ?? { error: { code: 'VOICE_UNAVAILABLE', message: 'Voice output is temporarily unavailable.' } }));
}
