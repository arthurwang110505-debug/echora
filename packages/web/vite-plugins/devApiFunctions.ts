import { resolve } from 'node:path';
import type { Plugin } from 'vite';

// vite-plugins/devApiFunctions.ts
// Runs the deployment's serverless handlers under `vite dev`.
//
// Without this, `pnpm dev` has no `/api/*`: the SPA fallback answers the request with HTML and a
// 200, so the feature can only be tried out after deploying. For the AI endpoints that was a bad
// loop for a prompt that needs iterating. For `/api/youtube/search` it was worse than an
// inconvenience: `searchTracks` reads `data.items` off the response, an HTML document has no such
// field, so the client silently decoded an empty result set and the UI reported "no playable
// video found" — a wrong answer that looked like a real one and could not be reproduced in
// production. Clicking the button in dev told you nothing about whether the search worked.
//
// Only mounted in dev (`apply: 'serve'`). In production Vercel owns these routes; this plugin never
// ships in the build. The handlers are loaded through Vite's own SSR module pipeline, so they get the
// same TypeScript transform and alias handling as the app.
//
// Point AGNES_BASE_URL at a local stub to exercise the whole AI path — client, proxy, prompt,
// parser — without spending a real key. `YOUTUBE_API_KEY` comes from `packages/web/.env`.

const FUNCTIONS: { route: string; file: string }[] = [
    { route: '/api/ai/segment', file: 'api/ai/segment.ts' },
    { route: '/api/ai/theme', file: 'api/ai/theme.ts' },
    { route: '/api/ai/status', file: 'api/ai/status.ts' },
    { route: '/api/youtube/search', file: 'api/youtube/search.ts' },
    // Word-by-word lyrics. Deliberately one route per source rather than a generic
    // `/api/lyric-proxy?url=…`: the narrow shape is what keeps arbitrary hosts unreachable.
    { route: '/api/lyrics/amll', file: 'api/lyrics/amll.ts' },
];

export const devApiFunctionsPlugin = (workspaceRoot: string): Plugin => ({
    name: 'echora-dev-api-functions',
    apply: 'serve',
    configureServer(server) {
        for (const { route, file } of FUNCTIONS) {
            const absolute = resolve(workspaceRoot, file);
            server.middlewares.use(route, (request, response, next) => {
                if (typeof request.url !== 'string') {
                    next();
                    return;
                }
                // Connect strips the mount path from `req.url`; the handlers parse
                // `request.url` themselves (`/api/youtube/search?q=...`), so restore it.
                // Without this the search handler sees `?q=...` and finds no query.
                const queryIndex = request.url.indexOf('?');
                if (queryIndex !== -1 && !request.url.startsWith(route)) {
                    request.url = `${route}${request.url}`;
                }
                void server.ssrLoadModule(absolute)
                    .then((module) => {
                        const handler = (module as { default?: unknown }).default;
                        if (typeof handler !== 'function') {
                            next();
                            return;
                        }
                        // The handlers are written against Node's own req/res (that is what Vercel
                        // passes them), which is exactly what a connect middleware receives.
                        return handler(request, response) as unknown;
                    })
                    .catch((error: unknown) => {
                        server.config.logger.error(`[dev-api] ${route} failed: ${error instanceof Error ? error.message : String(error)}`);
                        if (response.headersSent) {
                            response.end();
                            return;
                        }
                        response.statusCode = 500;
                        response.setHeader('Content-Type', 'application/json; charset=utf-8');
                        response.end(JSON.stringify({ error: '開發用 API 函式執行失敗，請看終端機。' }));
                    });
            });
        }
    },
});
