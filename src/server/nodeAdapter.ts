import type { AiRequestLike, JsonResult } from './ai';
import type { LlmConfig } from './llm';
import { guardAiRequest, type GuardDeps } from './aiGuard';

// ============================================================================
// Shared Node-style adapter used by both the Vercel functions and the Vite dev
// middleware, so local and production behaviour cannot drift apart.
//
// Structural types keep this free of a @vercel/node dependency.
// ============================================================================

export interface NodeRequestLike {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  on(event: 'data', cb: (chunk: Uint8Array) => void): void;
  on(event: 'end', cb: () => void): void;
  on(event: 'error', cb: (err: unknown) => void): void;
}

export interface NodeResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(chunk?: string | Uint8Array): void;
}

export const MAX_BODY_BYTES = 64 * 1024;

export function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function readNodeBody(req: NodeRequestLike): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.byteLength;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const merged = new Uint8Array(size);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.byteLength;
      }
      resolve(new TextDecoder().decode(merged));
    });
    req.on('error', reject);
  });
}

export function sendJson(res: NodeResponseLike, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export type AiRouteCore = (req: AiRequestLike, config: LlmConfig) => Promise<JsonResult>;

/** Per-request security dependencies (rate limiter, capability secret). */
export type SecurityFactory = () => GuardDeps;

function guardHeaders(req: NodeRequestLike) {
  return {
    host: firstHeader(req.headers['host']),
    origin: firstHeader(req.headers['origin']),
    referer: firstHeader(req.headers['referer']),
    capability: firstHeader(req.headers['x-saler-capability']),
    clientId:
      firstHeader(req.headers['x-forwarded-for'])?.split(',')[0]?.trim() || 'local',
  };
}

/**
 * Wrap a core AI handler as a Node request handler. The config factory is
 * called per request so the key is read from the server environment at call
 * time and never captured anywhere the client can reach. The optional security
 * factory runs the shared abuse guard (rate limit → same-origin → capability)
 * BEFORE any body read or model call, so the route can never be an open proxy.
 */
export function createAiRoute(
  core: AiRouteCore,
  getConfig: () => LlmConfig,
  getSecurity?: SecurityFactory,
) {
  return async function handler(req: NodeRequestLike, res: NodeResponseLike): Promise<void> {
    if (getSecurity) {
      const guard = guardAiRequest(guardHeaders(req), getSecurity());
      if (!guard.ok) {
        sendJson(res, guard.status, { error: { code: guard.code, message: guard.message } });
        return;
      }
    }

    let rawBody = '';
    try {
      rawBody = await readNodeBody(req);
    } catch {
      sendJson(res, 413, {
        error: { code: 'INVALID_REQUEST', message: 'Request body is too large.' },
      });
      return;
    }

    const result = await core(
      { method: req.method, rawBody, contentType: firstHeader(req.headers['content-type']) },
      getConfig(),
    );
    sendJson(res, result.status, result.body);
  };
}

/**
 * The capability-issuing route. Same-origin + rate-limited (via the guard,
 * with capability enforcement disabled — this is the route that mints them),
 * then returns a token when a signing secret is configured, else `{token:null}`.
 */
export function createCapabilityRoute(
  issue: (now?: number) => JsonResult,
  getSecurity?: SecurityFactory,
) {
  return function handler(req: NodeRequestLike, res: NodeResponseLike): void {
    if (getSecurity) {
      // Do not require a capability to GET a capability.
      const { capabilitySecret: _omit, ...rest } = getSecurity();
      const guard = guardAiRequest(guardHeaders(req), rest);
      if (!guard.ok) {
        sendJson(res, guard.status, { error: { code: guard.code, message: guard.message } });
        return;
      }
    }
    const result = issue();
    sendJson(res, result.status, result.body);
  };
}
