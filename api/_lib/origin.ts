// api/_lib/origin.ts
//
// Origin checks for the API routes.
//
// The folder starts with an underscore so Vercel does not treat it as a route: every file in `api/`
// that exports a default handler becomes an endpoint, and `_lib` is only ever imported.
//
// Why this module exists at all: `theme.ts`, `segment.ts`, `youtube/search.ts` and `lyrics/amll.ts`
// each used to carry their own copy of this check (the first two) or no check at all (the last two).
// The copies drifted - all of them shipped the same hole, and only some of them had a check to fix.
//
// The hole: the default policy was `/(^|\.)vercel\.app$/`, so any site deployed on Vercel could
// call this deployment's paid AI endpoints from a browser. It also returned `true` for a request
// with no `Origin` header at all, which is every request made by a script.

/**
 * Origins this deployment answers to, as bare hostnames.
 *
 * Read at call time rather than at module load: a test that sets an env var has to see it, and
 * serverless cold starts make module-level caching worth less than the confusion it causes.
 */
export const allowedHostnames = (): string[] => {
  const explicit = (process.env.ECHORA_ALLOWED_ORIGINS || '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(toHostname)
    .filter((host): host is string => Boolean(host));

  // The deployment's own hostnames. Vercel exposes production and preview URLs separately, and a
  // preview deployment is served from a different hostname than production, so both are needed or
  // the app breaks on every preview build.
  const deployed = [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL]
    .map(entry => toHostname(entry || ''))
    .filter((host): host is string => Boolean(host));

  // `vite dev` serves the app from localhost and mounts the real handlers behind it (see
  // vite-plugins/devApiFunctions.ts), so development needs localhost allowed or every AI request
  // fails locally while working in production - the worst possible way for this to be wrong.
  // Vite sets NODE_ENV=development for `serve`; a test run sets it to `test`.
  const isDevelopment = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
  const local = isDevelopment || process.env.ECHORA_ALLOW_LOCALHOST === '1'
    ? ['localhost', '127.0.0.1']
    : [];

  return [...new Set([...explicit, ...deployed, ...local])];
};

const toHostname = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Accept either a full origin ("https://echora.app") or a bare hostname ("echora.app"), because
  // ECHORA_ALLOWED_ORIGINS is documented as "comma-separated origins" and people paste both.
  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).hostname.toLowerCase();
  } catch {
    return null;
  }
};

/**
 * Whether a request from `origin` may use this deployment's credentials.
 *
 * `sameOrigin` is the page's own hostname (from the `Host` header). It is passed so that the common
 * case - the app calling its own API - keeps working on any hostname the deployment answers to,
 * including a preview URL that nobody configured.
 *
 * A missing `Origin` is a *browser* fact only for same-origin GETs and forms; `fetch` from a page
 * always sends one. So a missing header means "not a browser page we can vouch for" and is refused
 * for the endpoints that spend money. `allowMissingOrigin` exists for the two endpoints where that
 * would be wrong: they serve public, cacheable data, and refusing headerless callers would break
 * plain links and prefetchers without protecting anything.
 */
export const isAllowedRequest = (origin: string | string[] | undefined, options: {
  sameOrigin?: string | null;
  allowMissingOrigin?: boolean;
} = {}): boolean => {
  const allowed = allowedHostnames();
  const selfHost = toHostname(options.sameOrigin || '');
  // Node types a repeated header as an array; `Origin` is never repeated in practice, but taking
  // the first entry keeps the signature honest instead of casting it away at every call site.
  const originHeader = Array.isArray(origin) ? origin[0] : origin;

  if (!originHeader) {
    if (options.allowMissingOrigin) return true;
    // A caller that sent no Origin is still allowed when it is talking to its own host and there is
    // nothing configured to compare against - the browser omits Origin for same-origin GETs.
    return Boolean(selfHost && allowed.includes(selfHost));
  }

  const host = toHostname(originHeader);
  if (!host) return false;
  if (selfHost && host === selfHost) return true;
  return allowed.includes(host);
};

/** The hostname Vercel puts in `x-forwarded-host`, falling back to `host`. */
export const requestHostname = (headers: Record<string, string | string[] | undefined>): string | null => {
  const forwarded = headers['x-forwarded-host'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded ?? headers.host;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  return toHostname(value.split(',')[0] ?? value);
};
