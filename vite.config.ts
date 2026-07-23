import { defineConfig, type Plugin } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { handleSpeakRequest } from './src/server/speak';
import {
  handleAiStatus,
  handleConversationRequest,
  handleEvaluateFinalRequest,
  handleEvaluateTurnRequest,
  type AiRequestLike,
  type JsonResult,
} from './src/server/ai';
import type { LlmConfig } from './src/server/llm';

/**
 * Serves POST /api/speak during `npm run dev` using the SAME core handler as
 * the Vercel function, so local behaviour matches production.
 *
 * The key is read from the server-side env here and never reaches the client:
 * Vite only exposes VITE_-prefixed variables to the browser bundle.
 */
function devSpeakApi(env: Record<string, string>): Plugin {
  return {
    name: 'salessim-dev-speak-api',
    configureServer(server) {
      server.middlewares.use('/api/speak', (req, res) => {
        const chunks: Uint8Array[] = [];
        req.on('data', (chunk: Uint8Array) => chunks.push(chunk));
        req.on('end', () => {
          void (async () => {
            const size = chunks.reduce((n, c) => n + c.byteLength, 0);
            const merged = new Uint8Array(size);
            let offset = 0;
            for (const c of chunks) {
              merged.set(c, offset);
              offset += c.byteLength;
            }

            const result = await handleSpeakRequest(
              {
                method: req.method,
                rawBody: new TextDecoder().decode(merged),
                contentType: req.headers['content-type'],
              },
              {
                apiKey: env.ELEVENLABS_API_KEY,
                voiceId: env.ELEVENLABS_VOICE_ID,
                fetchImpl: fetch,
                // Dev-only diagnostic: numeric status only, never secrets.
                onUpstreamStatus: (status) =>
                  console.warn(`[api/speak] upstream responded ${status}`),
              },
            );

            res.statusCode = result.status;
            res.setHeader('Cache-Control', 'no-store');
            if (result.audio && result.contentType) {
              res.setHeader('Content-Type', result.contentType);
              res.end(new Uint8Array(result.audio));
              return;
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result.body));
          })();
        });
      });
    },
  };
}

/**
 * Mounts the secure AI routes during `npm run dev`, sharing the exact handlers
 * used by the Vercel functions. Credentials are read here on the server side
 * only — Vite never exposes non-VITE_ variables to the browser bundle.
 */
function devAiRoutes(env: Record<string, string>): Plugin {
  const config = (): LlmConfig => ({
    apiKey: env.OPENAI_API_KEY,
    baseUrl: env.OPENAI_BASE_URL,
    model: env.LLM_MODEL,
    fetchImpl: fetch,
    onUpstreamStatus: (status) => console.warn(`[api/ai] upstream responded ${status}`),
  });

  const routes: Record<string, (req: AiRequestLike, c: LlmConfig) => Promise<JsonResult>> = {
    '/api/conversation': handleConversationRequest,
    '/api/evaluate-turn': handleEvaluateTurnRequest,
    '/api/evaluate-final': handleEvaluateFinalRequest,
  };

  return {
    name: 'salessim-dev-ai-routes',
    configureServer(server) {
      server.middlewares.use('/api/ai-status', (_req, res) => {
        const result = handleAiStatus({ apiKey: env.OPENAI_API_KEY });
        res.statusCode = result.status;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(result.body));
      });

      for (const [path, core] of Object.entries(routes)) {
        server.middlewares.use(path, (req, res) => {
          const chunks: Uint8Array[] = [];
          req.on('data', (chunk: Uint8Array) => chunks.push(chunk));
          req.on('end', () => {
            void (async () => {
              const size = chunks.reduce((n, c) => n + c.byteLength, 0);
              const merged = new Uint8Array(size);
              let offset = 0;
              for (const c of chunks) {
                merged.set(c, offset);
                offset += c.byteLength;
              }
              const result = await core(
                {
                  method: req.method,
                  rawBody: new TextDecoder().decode(merged),
                  contentType: req.headers['content-type'],
                },
                config(),
              );
              res.statusCode = result.status;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Cache-Control', 'no-store');
              res.end(JSON.stringify(result.body));
            })();
          });
        });
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Loads .env.local etc. Server-side use only — never spread into `define`.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), devSpeakApi(env), devAiRoutes(env)],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      css: false,
    },
  };
});
