import { defineConfig, type Plugin } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { handleSpeakRequest } from './src/server/speak';

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

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Loads .env.local etc. Server-side use only — never spread into `define`.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), devSpeakApi(env)],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      css: false,
    },
  };
});
