import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SITE_URL,
  buildRobotsTxt,
  buildSiteMetaTags,
  buildSitemapXml,
  buildStaticFiles,
  extractVerificationToken,
  normalizeSiteUrl,
  resolveSiteUrl,
  siteMetadataPlugin,
  staticFileKey,
  type SiteMetadataEnv,
} from './siteMetadata';

const readWebFile = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');

const renderIndexHtml = (env: SiteMetadataEnv) => {
  const plugin = siteMetadataPlugin(env);
  const transform = plugin.transformIndexHtml as unknown as (
    html: string,
  ) => { html: string; tags: Array<{ tag: string; attrs?: Record<string, string> }> };
  return transform.call({}, readWebFile('index.html'));
};

describe('site metadata helpers', () => {
  it('normalizes configured origins and falls back to the production origin', () => {
    expect(normalizeSiteUrl('https://echora-three.vercel.app/')).toBe('https://echora-three.vercel.app');
    expect(normalizeSiteUrl('echora-three.vercel.app')).toBe('https://echora-three.vercel.app');
    expect(normalizeSiteUrl('  ')).toBeNull();
    expect(normalizeSiteUrl('not a url')).toBeNull();

    expect(resolveSiteUrl({})).toBe(DEFAULT_SITE_URL);
    expect(resolveSiteUrl({ VITE_SITE_URL: 'https://echora.example.com/' })).toBe('https://echora.example.com');
    expect(resolveSiteUrl({ VITE_SITE_URL: 'garbage', SITE_URL: 'https://echora.example.org' })).toBe('https://echora.example.org');
  });

  it('accepts either the raw Search Console token or the whole meta tag', () => {
    expect(extractVerificationToken('abc123')).toBe('abc123');
    expect(extractVerificationToken('  abc123  ')).toBe('abc123');
    expect(extractVerificationToken('<meta name="google-site-verification" content="abc123" />')).toBe('abc123');
    expect(extractVerificationToken(undefined)).toBe('');
  });

  it('injects the canonical origin and only adds the verification tag when a token is configured', () => {
    const withoutToken = buildSiteMetaTags({ VITE_SITE_URL: 'https://echora.example.com' });
    expect(withoutToken.find((tag) => tag.attrs?.rel === 'canonical')?.attrs?.href).toBe('https://echora.example.com/');
    expect(withoutToken.find((tag) => tag.attrs?.property === 'og:url')?.attrs?.content).toBe('https://echora.example.com/');
    expect(withoutToken.some((tag) => tag.attrs?.name === 'google-site-verification')).toBe(false);

    const withToken = buildSiteMetaTags({ VITE_GOOGLE_SITE_VERIFICATION: 'token-123' });
    expect(withToken.find((tag) => tag.attrs?.name === 'google-site-verification')?.attrs?.content).toBe('token-123');
  });

  it('maps request paths onto the emitted static files', () => {
    // The dev-server middleware serves the same two files that `vite build`
    // emits, so the lookup has to accept a leading slash and query strings.
    expect(staticFileKey('/robots.txt')).toBe('robots.txt');
    expect(staticFileKey('/sitemap.xml?v=2')).toBe('sitemap.xml');
    expect(staticFileKey('/')).toBe('');
    expect(buildStaticFiles({})[staticFileKey('/robots.txt')]?.body).toContain('User-agent: *');
  });

  it('writes robots.txt and sitemap.xml for the configured origin', () => {
    const robots = buildRobotsTxt('https://echora.example.com');
    expect(robots).toContain('User-agent: *');
    expect(robots).toContain('Allow: /');
    expect(robots).toContain('Sitemap: https://echora.example.com/sitemap.xml');

    const sitemap = buildSitemapXml('https://echora.example.com');
    expect(sitemap).toContain('<loc>https://echora.example.com/</loc>');
    expect(sitemap).toContain('<loc>https://echora.example.com/privacy</loc>');
    expect(sitemap).toContain('<loc>https://echora.example.com/terms</loc>');
  });
});

/**
 * Google's brand-verification checklist is applied to what the domain serves,
 * not to the React tree, so these assertions pin the HTML a non-JavaScript
 * fetch receives.
 */
describe('homepage HTML for OAuth brand verification', () => {
  it('describes the app and links the policies from the served HTML', () => {
    const html = readWebFile('index.html');

    expect(html).toContain('ECHORA');
    // Functionality description, in both languages the app ships.
    expect(html).toContain('沉浸式歌詞與音樂舞台');
    expect(html).toContain('browser-based immersive lyrics and music stage');
    // Privacy policy + terms links, exactly as required on the homepage.
    expect(html).toMatch(/<a href="\/privacy">/);
    expect(html).toMatch(/<a href="\/terms">/);
    // Google user-data disclosure and the revocation entry point.
    expect(html).toContain('YouTube API Services');
    expect(html).toContain('Limited Use');
    expect(html).toContain('https://myaccount.google.com/permissions');
  });

  it('keeps the fallback links pointed at routes the router really serves', () => {
    const app = readWebFile('src/App.tsx');
    expect(app).toContain("path: '/privacy'");
    expect(app).toContain("path: '/terms'");
  });

  it('injects the Search Console meta tag into the served homepage when a token is set', () => {
    const { html, tags } = renderIndexHtml({
      VITE_GOOGLE_SITE_VERIFICATION: '<meta name="google-site-verification" content="search-console-token" />',
      VITE_SITE_URL: 'https://echora-three.vercel.app',
    });

    expect(html).toContain('id="root"');
    const verification = tags.find((tag) => tag.attrs?.name === 'google-site-verification');
    expect(verification).toEqual({
      tag: 'meta',
      attrs: { name: 'google-site-verification', content: 'search-console-token' },
      injectTo: 'head',
    });
    expect(tags.find((tag) => tag.attrs?.rel === 'canonical')?.attrs?.href).toBe('https://echora-three.vercel.app/');
  });
});
