import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LOCALE_BUNDLE_SECTIONS, ROUTE_LOCALE_BUNDLES, type LocaleBundleName } from './bundles';

/**
 * The split only works if two things stay true: the shell can render every key it references, and
 * each route can render its own. Both are claims about the import graph, so that is what we read —
 * a key that drifts into the wrong file fails here instead of rendering as `player.nowPlaying` in
 * production.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSIONS = ['.ts', '.tsx'];

const localeFiles = import.meta.glob<{ default: Record<string, unknown> }>('./locales/*.json', { eager: true });
const SECTIONS = [...new Set(Object.values(localeFiles).flatMap((module) => Object.keys(module.default)))];

const parsePath = (path: string): { bundle: string; language: 'en' | 'zh-TW' } | null => {
  const match = /\.\/locales\/([a-z]+)\.(en|zh-TW)\.json$/.exec(path);
  return match ? { bundle: match[1], language: match[2] as 'en' | 'zh-TW' } : null;
};

const keyPaths = (value: unknown, prefix = ''): string[] => {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keyPaths(child, prefix ? `${prefix}.${key}` : key));
};

/** Every key an entry chunk carrying `bundle` can resolve: the shell plus that bundle. */
const resourcesFor = (bundle: LocaleBundleName | null): Set<string> => {
  const paths = new Set<string>();
  for (const [path, module] of Object.entries(localeFiles)) {
    const info = parsePath(path);
    if (!info || info.language !== 'en') continue;
    if (info.bundle !== 'shell' && info.bundle !== bundle) continue;
    for (const key of keyPaths(module.default)) paths.add(key);
  }
  return paths;
};

const resolveModule = (specifier: string, fromFile: string): string | null => {
  const base = specifier.startsWith('@/') ? resolve(SRC, specifier.slice(2)) : resolve(dirname(fromFile), specifier);
  const candidates = [base, ...EXTENSIONS.map((ext) => base + ext), ...EXTENSIONS.map((ext) => `${base}/index${ext}`)];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
};

const STATIC_IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** `dynamic: false` mirrors Vite's entry chunk: only what is statically reachable from it. */
const importGraph = (entry: string, { dynamic = true } = {}): string[] => {
  const seen = new Set<string>();
  const visit = (file: string) => {
    const path = relative(SRC, file);
    if (path.startsWith('..') || seen.has(path) || /\.test\.tsx?$/.test(path)) return;
    seen.add(path);
    const source = readFileSync(file, 'utf8');
    const specifiers: string[] = [];
    for (const match of source.matchAll(STATIC_IMPORT)) specifiers.push(match[1] ?? match[2]);
    if (dynamic) for (const match of source.matchAll(DYNAMIC_IMPORT)) specifiers.push(match[1]);
    for (const specifier of specifiers) {
      if (!specifier || (!specifier.startsWith('.') && !specifier.startsWith('@/'))) continue;
      const resolved = resolveModule(specifier, file);
      if (resolved) visit(resolved);
    }
  };
  visit(resolve(SRC, entry));
  return [...seen];
};

/** Locale keys referenced as literals. `t('a.b')` and registry-style `'a.b'` both count. */
const referencedKeys = (modules: string[]): Map<string, string> => {
  const found = new Map<string, string>();
  const pattern = new RegExp(`['"\`](${SECTIONS.join('|')})\\.[\\w.]+['"\`]`, 'g');
  for (const module of modules) {
    if (!/\.tsx?$/.test(module)) continue;
    const source = readFileSync(resolve(SRC, module), 'utf8');
    for (const match of source.matchAll(pattern)) found.set(match[0].slice(1, -1), module);
  }
  return found;
};

const missingKeys = (keys: Map<string, string>, resources: Set<string>) =>
  [...keys.entries()].filter(([key]) => !resources.has(key));

const describeKeys = (missing: [string, string][]) =>
  missing.map(([key, module]) => `${key} (${module})`).join('\n  ') || '(none)';

const routeEntry = (specifier: string) => `${specifier.replace('./', '')}.tsx`;

describe('locale bundles', () => {
  it('ships every key the eager shell renders in the shell bundle', () => {
    const missing = missingKeys(referencedKeys(importGraph('main.tsx', { dynamic: false })), resourcesFor(null));
    expect(missing.length, `rendered by the entry chunk but absent from shell.*.json:\n  ${describeKeys(missing)}`).toBe(0);
  });

  it.each(Object.entries(ROUTE_LOCALE_BUNDLES))('covers %s with its own bundle', (specifier, bundle) => {
    const missing = missingKeys(referencedKeys(importGraph(routeEntry(specifier))), resourcesFor(bundle));
    expect(
      missing.length,
      `${specifier} references keys no bundle it loads carries (bundle: ${bundle ?? 'shell only'}):\n  ${describeKeys(missing)}`,
    ).toBe(0);
  });

  it('keeps the bundle assignment in step with the routes App.tsx declares', () => {
    const appSource = readFileSync(resolve(SRC, 'App.tsx'), 'utf8');
    const lazyRoutes = [...appSource.matchAll(/import\(\s*['"](\.\/pages\/[^'"]+)['"]\s*\)/g)].map((match) => match[1]);
    // A new page either joins the map with a bundle of its own, or joins the two shell-only routes
    // on purpose — either way the decision is written down rather than defaulting to the shell.
    expect([...new Set(lazyRoutes)].sort()).toEqual(Object.keys(ROUTE_LOCALE_BUNDLES).sort());
  });

  it('has a loadable file for every bundle in both languages', () => {
    const files = new Set(Object.keys(localeFiles));
    for (const bundle of [...Object.keys(LOCALE_BUNDLE_SECTIONS), 'shell']) {
      for (const language of ['en', 'zh-TW']) {
        expect(files.has(`./locales/${bundle}.${language}.json`), `missing locales/${bundle}.${language}.json`).toBe(true);
      }
    }
  });

  it('gives both languages the same keys in every bundle', () => {
    const byBundle = new Map<string, Partial<Record<'en' | 'zh-TW', string[]>>>();
    for (const [path, module] of Object.entries(localeFiles)) {
      const info = parsePath(path);
      if (!info) continue;
      const entry = byBundle.get(info.bundle) ?? {};
      entry[info.language] = keyPaths(module.default).sort();
      byBundle.set(info.bundle, entry);
    }
    for (const [bundle, entry] of byBundle) {
      const zhTW = new Set(entry['zh-TW']);
      const en = new Set(entry.en);
      const enOnly = [...en].filter((key) => !zhTW.has(key));
      const zhTWOnly = [...zhTW].filter((key) => !en.has(key));
      expect([...enOnly, ...zhTWOnly].length, `${bundle}: en-only ${enOnly.join(', ')} | zh-TW-only ${zhTWOnly.join(', ')}`).toBe(0);
    }
  });

  it('resolves every locale key referenced anywhere in src', () => {
    const resources = new Set<string>();
    for (const bundle of Object.keys(LOCALE_BUNDLE_SECTIONS) as LocaleBundleName[]) {
      for (const key of resourcesFor(bundle)) resources.add(key);
    }
    for (const key of resourcesFor(null)) resources.add(key);
    const modules = importGraph('main.tsx').concat(Object.keys(ROUTE_LOCALE_BUNDLES).map(routeEntry));
    // Sections are taken from the locale files themselves, so a reference to a section that has
    // never existed (`replayGain.*`, in the unbundled `utils/appPlaybackHelpers.ts`) is outside
    // this check rather than a false failure. See docs/i18n-bundles.zh-TW.md.
    const missing = missingKeys(referencedKeys(modules), resources);
    expect(missing.length, `keys with no locale entry:\n  ${describeKeys(missing)}`).toBe(0);
  });

  it('fetches a bundle on demand and merges it into the live instance', async () => {
    const { default: i18n, loadLocaleBundle, getLanguage } = await import('./index');
    const language = getLanguage();
    const everything = i18n.getResourceBundle(language, 'translation') as Record<string, unknown>;
    const { default: shell } = await import('./locales/shell.zh-TW.json');
    // Emulate a cold session: the shell is in memory, the route's copy is not. The test setup
    // merges every bundle for the other tests, so the starting point is restored by hand.
    i18n.removeResourceBundle(language, 'translation');
    i18n.addResourceBundle(language, 'translation', shell, true, true);
    expect(i18n.exists('library.title')).toBe(false);
    await loadLocaleBundle('library');
    expect(i18n.exists('library.title')).toBe(true);
    i18n.removeResourceBundle(language, 'translation');
    i18n.addResourceBundle(language, 'translation', everything, true, true);
  });

  it('declares every section that lives in a bundle', () => {
    const declared = new Set(Object.values(LOCALE_BUNDLE_SECTIONS).flat());
    for (const [path, module] of Object.entries(localeFiles)) {
      const info = parsePath(path);
      if (!info || info.bundle === 'shell' || info.language !== 'en') continue;
      for (const section of Object.keys(module.default)) {
        expect(
          declared.has(section),
          `${section} lives in ${info.bundle}.en.json but is not declared in LOCALE_BUNDLE_SECTIONS`,
        ).toBe(true);
      }
    }
  });
});
