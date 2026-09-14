import type { Connect, HtmlTagDescriptor, Plugin } from 'vite';

/**
 * Site metadata + Google Search Console plumbing.
 *
 * Google's OAuth brand verification requires the deployment domain to be proven
 * through Google Search Console, and Search Console can only verify what the
 * server actually returns over HTTP. A Vite SPA build returns `index.html` for
 * every route, so two things have to be produced at build time:
 *
 *   1. The verification token has to be inside the served `<head>` (HTML tag
 *      method). Hard-coding the token in `index.html` would tie the repository
 *      to one Search Console property, so it is read from the environment
 *      (`VITE_GOOGLE_SITE_VERIFICATION`, or `GOOGLE_SITE_VERIFICATION`).
 *   2. `robots.txt` and `sitemap.xml` have to exist as real files. Without them
 *      the catch-all rewrite in `vercel.json` answers `/robots.txt` with the
 *      app shell, which looks like "no site configuration at all" to crawlers.
 *
 * The same tags are injected in `vite dev` and in `vite build`, so a token set
 * in `packages/web/.env.local` can be verified locally before it is set on
 * Vercel.
 */

export type SiteMetadataEnv = Record<string, string | undefined>;

/** Production origin used when neither `VITE_SITE_URL` nor `SITE_URL` is set. */
export const DEFAULT_SITE_URL = 'https://echora-three.vercel.app';

export const SITE_NAME = 'Echora';
export const SITE_TITLE = 'Echora - 沉浸式動態歌詞音樂舞台';
export const SITE_DESCRIPTION =
  'Echora 是一款在瀏覽器運行的沉浸式動態歌詞音樂舞台：播放內建展示曲目，或連接自己的 YouTube Music 歌單，享受逐字同步歌詞、視覺舞台與 AI 生成配色。Echora is a browser-based immersive lyrics stage for your own music.';

/** Routes worth listing for crawlers; the app shell owns everything else. */
export const SITEMAP_PATHS = ['/', '/app', '/privacy', '/terms'] as const;

/**
 * Accepts `https://host`, `host`, `https://host/` and returns `https://host`.
 * Returns `null` for anything that cannot be parsed as an origin, so a typo in
 * the environment falls back to the production origin instead of shipping a
 * broken canonical URL.
 */
export const normalizeSiteUrl = (value?: string | null): string | null => {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    // `new URL('https://garbage')` parses happily; require a real host name.
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
};

export const resolveSiteUrl = (env: SiteMetadataEnv = {}): string =>
  normalizeSiteUrl(env.VITE_SITE_URL) ?? normalizeSiteUrl(env.SITE_URL) ?? DEFAULT_SITE_URL;

/**
 * Search Console shows the verification snippet as a ready-made `<meta>` tag,
 * but the raw token is also accepted. Both forms are handled here so the value
 * can be pasted into an environment variable without editing it first.
 */
export const extractVerificationToken = (value?: string | null): string => {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  const metaContent = raw.match(/content=["']([^"']+)["']/i);
  return (metaContent ? metaContent[1] : raw).trim();
};

export const resolveVerificationToken = (env: SiteMetadataEnv = {}): string =>
  extractVerificationToken(env.VITE_GOOGLE_SITE_VERIFICATION ?? env.GOOGLE_SITE_VERIFICATION);

/** `<meta>`/`<link>` tags injected into `<head>` for every build and dev run. */
export const buildSiteMetaTags = (env: SiteMetadataEnv = {}): HtmlTagDescriptor[] => {
  const siteUrl = resolveSiteUrl(env);
  const token = resolveVerificationToken(env);
  const tags: HtmlTagDescriptor[] = [
    { tag: 'link', attrs: { rel: 'canonical', href: `${siteUrl}/` }, injectTo: 'head' },
    { tag: 'meta', attrs: { property: 'og:type', content: 'website' }, injectTo: 'head' },
    { tag: 'meta', attrs: { property: 'og:site_name', content: SITE_NAME }, injectTo: 'head' },
    { tag: 'meta', attrs: { property: 'og:title', content: SITE_TITLE }, injectTo: 'head' },
    { tag: 'meta', attrs: { property: 'og:description', content: SITE_DESCRIPTION }, injectTo: 'head' },
    { tag: 'meta', attrs: { property: 'og:url', content: `${siteUrl}/` }, injectTo: 'head' },
    { tag: 'meta', attrs: { property: 'og:locale', content: 'zh_TW' }, injectTo: 'head' },
    { tag: 'meta', attrs: { property: 'og:locale:alternate', content: 'en' }, injectTo: 'head' },
    { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' }, injectTo: 'head' },
    { tag: 'meta', attrs: { name: 'twitter:title', content: SITE_TITLE }, injectTo: 'head' },
    { tag: 'meta', attrs: { name: 'twitter:description', content: SITE_DESCRIPTION }, injectTo: 'head' },
  ];
  if (token) {
    // Exactly the tag Search Console prints for the "HTML tag" method.
    tags.push({ tag: 'meta', attrs: { name: 'google-site-verification', content: token }, injectTo: 'head' });
  }
  return tags;
};

export const buildRobotsTxt = (siteUrl: string): string =>
  [
    'User-agent: *',
    'Allow: /',
    '',
    '# Serverless proxies are not pages; keep crawlers out of them.',
    'Disallow: /api/',
    'Disallow: /oauth/',
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`,
    '',
  ].join('\n');

export const buildSitemapXml = (siteUrl: string, paths: readonly string[] = SITEMAP_PATHS): string => {
  const urls = paths
    .map((path) => `  <url><loc>${siteUrl}${path === '/' ? '/' : path}</loc></url>`)
    .join('\n');
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', urls, '</urlset>', ''].join('\n');
};

interface StaticFile {
  body: string;
  contentType: string;
}

/** Maps a request URL to the emitted asset name (`/robots.txt` → `robots.txt`). */
export const staticFileKey = (url: string): string => (url.split('?')[0] ?? '').replace(/^\/+/, '');

export const buildStaticFiles = (env: SiteMetadataEnv = {}): Record<string, StaticFile> => {
  const siteUrl = resolveSiteUrl(env);
  return {
    'robots.txt': { body: buildRobotsTxt(siteUrl), contentType: 'text/plain; charset=utf-8' },
    'sitemap.xml': { body: buildSitemapXml(siteUrl), contentType: 'application/xml; charset=utf-8' },
  };
};

export function siteMetadataPlugin(env: SiteMetadataEnv = process.env as SiteMetadataEnv): Plugin {
  const tags = buildSiteMetaTags(env);
  const staticFiles = buildStaticFiles(env);

  return {
    name: 'echora:site-metadata',

    transformIndexHtml(html) {
      return { html, tags };
    },

    configureServer(server) {
      // Served from middleware (not from `public/`) so the origin in robots.txt
      // and sitemap.xml follows the same configuration as the meta tags.
      server.middlewares.use((req: Connect.IncomingMessage, res, next: Connect.NextFunction) => {
        const file = staticFiles[staticFileKey(req.url ?? '')];
        if (!file) {
          next();
          return;
        }
        res.setHeader('Content-Type', file.contentType);
        res.setHeader('Cache-Control', 'no-cache');
        res.end(file.body);
      });
    },

    generateBundle() {
      for (const [fileName, file] of Object.entries(staticFiles)) {
        this.emitFile({ type: 'asset', fileName, source: file.body });
      }
    },
  };
}
