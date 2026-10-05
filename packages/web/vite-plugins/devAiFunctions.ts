import { resolve } from 'node:path';
import type { Plugin } from 'vite';

// vite-plugins/devAiFunctions.ts
// Runs the deployment's serverless functions under `vite dev`.
//
// Without this, `pnpm dev` has no /api/ai/*: the SPA fallback answers the request with HTML and a
// 200, so an AI feature can only be tried out after deploying. That is a bad loop for a prompt that
// needs iterating, and it made "does the request shape work at all?" unanswerable locally.
//
// Only mounted in dev (`apply: 'serve'`). In production Vercel owns these routes; this plugin never
// ships in the build. The handlers are loaded through Vite's own SSR module pipeline, so they get the
// same TypeScript transform and alias handling as the app.
//
// Point AGNES_BASE_URL at a local stub to exercise the whole path — client, proxy, prompt, parser —
// without spending a real key.

const FUNCTIONS: { route: string; file: string }[] = [
    { route: '/api/ai/segment', file: 'api/ai/segment.ts' },
    { route: '/api/ai/theme', file: 'api/ai/theme.ts' },
    { route: '/api/ai/status', file: 'api/ai/status.ts' },
];

export const devAiFunctionsPlugin = (workspaceRoot: string): Plugin => ({
    name: 'echora-dev-ai-functions',
    apply: 'serve',
    configureServer(server) {
        for (const { route, file } of FUNCTIONS) {
            const absolute = resolve(workspaceRoot, file);
            server.middlewares.use(route, (request, response, next) => {
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
                        server.config.logger.error(`[dev-ai] ${route} failed: ${error instanceof Error ? error.message : String(error)}`);
                        response.statusCode = 500;
                        response.setHeader('Content-Type', 'application/json; charset=utf-8');
                        response.end(JSON.stringify({ error: '開發用 AI 函式執行失敗，請看終端機。' }));
                    });
            });
        }
    },
});
