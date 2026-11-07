import { describe, expect, it } from 'vitest';
import { devApiFunctionsPlugin } from './devApiFunctions';

/**
 * The dev proxy exists because `vite dev` has no serverless functions and the SPA
 * fallback answers `/api/*` with an HTML 200. For the YouTube search that failure
 * was silent: `searchTracks` reads `data.items`, an HTML document has no such
 * field, so the client returned an empty list and the UI reported "no playable
 * video found" — a real-looking answer for a request that never left the machine.
 *
 * These tests cover the routing table and the `req.url` rewrite. The rewrite is
 * the part that is easy to get wrong and impossible to notice: connect strips the
 * mount path, so a handler that parses `request.url` sees only `?q=...`.
 */

type Middleware = (req: unknown, res: unknown, next: () => void) => void;

const mountPlugin = () => {
  const routes: string[] = [];
  const middlewares = new Map<string, Middleware>();
  const plugin = devApiFunctionsPlugin('/repo');

  (plugin.configureServer as (server: unknown) => void)({
    middlewares: {
      use: (route: string, middleware: Middleware) => {
        routes.push(route);
        middlewares.set(route, middleware);
      },
    },
    ssrLoadModule: () => Promise.resolve({ default: () => {} }),
    config: { logger: { error: () => {} } },
  });

  /** Runs one route's middleware against a request, returning the url it saw. */
  const dispatch = (route: string, url: string): string => {
    const middleware = middlewares.get(route);
    if (!middleware) throw new Error(`route not mounted: ${route}`);
    const request: { url: string } = { url };
    middleware(request, {}, () => {});
    return request.url;
  };

  return { routes, dispatch };
};

describe('devApiFunctionsPlugin', () => {
  it('mounts the YouTube search proxy, not just the AI endpoints', () => {
    const { routes } = mountPlugin();
    expect(routes).toContain('/api/youtube/search');
    expect(routes).toContain('/api/ai/theme');
  });

  it('only runs in dev', () => {
    expect(devApiFunctionsPlugin('/repo').apply).toBe('serve');
  });

  it('restores the mount path so the handler can parse its query', () => {
    const { dispatch } = mountPlugin();
    // Connect strips the mount path, so this is what the handler really sees.
    expect(dispatch('/api/youtube/search', '?q=yorushika')).toBe('/api/youtube/search?q=yorushika');
  });

  it('leaves a url that already carries the mount path alone', () => {
    const { dispatch } = mountPlugin();
    expect(dispatch('/api/youtube/search', '/api/youtube/search?q=a')).toBe('/api/youtube/search?q=a');
  });

  it('leaves a url with no query untouched', () => {
    const { dispatch } = mountPlugin();
    expect(dispatch('/api/youtube/search', '/')).toBe('/');
  });
});
