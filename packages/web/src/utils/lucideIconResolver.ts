// Ported from Project Folia (AGPL-3.0) - https://github.com/chthollyphile/folia-major
// Upstream: src/utils/lucideIconResolver.ts
//
// Behaviour is unchanged: a theme's `lyricsIcons` entry is a PascalCase lucide name written by the
// theme editor or by AI, and the modes need either to draw its geometry as line art (Lumiere) or to
// render it (Sonnet). Callers never index lucide-react by hand.
//
// What changed and why: this module used `import * as LucideIcons from 'lucide-react'`, which is a
// request for every icon module (~2,000 of them). Rollup answers that with one 878 kB chunk, and
// because this resolver is reachable from the stage shell, from Lumiere/Monet/Sonnet/Pendolo and
// from both Pixi runtimes, that chunk became a static shared dependency of all of them - fully
// downloaded to draw the three or four icons a theme names.
//
// Now the geometry is loaded per icon through `import.meta.glob`, lazily, and the name table comes
// from lucide's own `iconNames` (a list of strings, no icon data). Two consequences the callers
// have to respect:
//   * `resolveLucideIconNames` stays synchronous and cheap - it only answers "is this a real name";
//   * `lucideIconNode` is synchronous *after* `preloadLucideIcons` has run for those names, which
//     `buildLumiereSceneEntry` does before it builds (scene building is already async).
import { iconNames } from 'lucide-react/dynamic';
// The same map `DynamicIcon` uses: name -> `() => import(one icon module)`. Imported directly
// rather than re-exported through the package's public entry so the bundler sees the individual
// dynamic imports and can split them (2025 files, one icon each).
import dynamicIconImports from 'lucide-react/dist/esm/dynamicIconImports.mjs';
import type { LucideIcon } from 'lucide-react';

/** Every icon module, keyed by lucide's kebab-case file name. Nothing here loads eagerly. */
const ICON_MODULES = import.meta.glob<{ default: LucideIcon; __iconNode?: unknown }>(
    '../../node_modules/.pnpm/lucide-react@*/node_modules/lucide-react/dist/esm/icons/*.mjs',
);

/**
 * Fallback loader map, for the environments where the glob above resolves to nothing.
 *
 * `import.meta.glob` only sees files under the project root. Under pnpm the icons live in
 * `node_modules/.pnpm/...`, which Vitest and some CI layouts do not expose to a glob, and the
 * build then silently has no loaders - every icon would answer null. lucide ships exactly this
 * map for the same purpose, so use it when the glob came up empty rather than a second glob.
 */
const dynamicImports = dynamicIconImports as unknown as Record<
    string,
    () => Promise<{ default: unknown; __iconNode?: unknown }>
>;

/**
 * Maps the glob's paths onto lucide's names without keeping the paths around at runtime.
 *
 * The glob can be rooted at the pnpm store, so the file name is the only stable part; lucide's
 * `iconNames` gives the same kebab strings.
 */
const loadersByKebab = new Map<string, () => Promise<{ default: unknown; __iconNode?: unknown }>>();
if (Object.keys(ICON_MODULES).length > 0) {
    for (const [path, load] of Object.entries(ICON_MODULES)) {
        const file = path.split('/').pop() ?? '';
        if (!file.endsWith('.mjs')) continue;
        loadersByKebab.set(file.slice(0, -'.mjs'.length), load as () => Promise<{ default: unknown }>);
    }
}

const getLoader = (kebab: string) => loadersByKebab.get(kebab) ?? dynamicImports[kebab];

/** Kebab-case keys are the canonical form; themes and AI output use PascalCase. */
const toKebabCase = (name: string): string => name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();

/**
 * Kebab key -> the PascalCase spelling callers use.
 *
 * Keyed on the kebab form because that is what `toKebabCase` produces for *any* accepted input
 * (`Star`, `star`, `AArrowDown`, `a-arrow-down` all normalise to `star` / `a-arrow-down`). Keying on
 * `pascal.toLowerCase()` instead looks equivalent and is not: it collapses the hyphens, so
 * `AArrowDown` would be keyed `aarrowdown` while lookups asked for `a-arrow-down` and every
 * multi-word icon silently resolved to nothing.
 *
 * lucide also ships aliases that map to one Pascal name; the first kebab key wins and the alias
 * stays reachable through its own spelling.
 */
const pascalByKebab = new Map<string, string>();
for (const key of iconNames as string[]) {
    const pascal = key
        .split('-')
        .map(part => (part ? part[0].toUpperCase() + part.slice(1) : part))
        .join('');
    if (!pascalByKebab.has(key)) {
        pascalByKebab.set(key, pascal);
    }
}

/** True when lucide can draw this name. A table lookup: no module is loaded. */
export const isLucideIconName = (name: string | null | undefined): boolean => (
    typeof name === 'string' && pascalByKebab.has(toKebabCase(name))
);

/**
 * Resolves a theme's `lyricsIcons` list to canonical PascalCase names: case-insensitive,
 * deduplicated, unknown names dropped. No fallback - callers that want a default icon add it.
 */
export const resolveLucideIconNames = (names: readonly string[] | undefined): string[] => [
    ...new Set((names ?? [])
        .map(name => (typeof name === 'string' ? pascalByKebab.get(toKebabCase(name)) : undefined))
        .filter(Boolean)),
] as string[];

const nodeCache = new Map<string, unknown[] | null>();
const inflight = new Map<string, Promise<void>>();

/**
 * Warms the given names so `lucideIconNode` can answer synchronously afterwards.
 *
 * Callers that draw line art build their scenes in an async step and cannot await per glyph, so
 * they await this once for the names their theme actually names - typically a handful.
 */
export const preloadLucideIcons = async (names: readonly string[]): Promise<void> => {
    await Promise.all(names.map(async raw => {
        const pascal = pascalByKebab.get(toKebabCase(raw));
        if (!pascal || nodeCache.has(pascal)) return;
        const existing = inflight.get(pascal);
        if (existing) return existing;
        const kebab = toKebabCase(pascal);
        const load = getLoader(kebab);
        if (!load) {
            nodeCache.set(pascal, null);
            return;
        }
        const job = load()
            .then(module => {
                const node = (module as { __iconNode?: unknown }).__iconNode;
                nodeCache.set(pascal, Array.isArray(node) ? node : null);
            })
            .catch(() => {
                nodeCache.set(pascal, null);
            })
            .finally(() => {
                inflight.delete(pascal);
            });
        inflight.set(pascal, job);
        return job;
    }));
};

/**
 * The icon's geometry (`[[tag, attrs]]` tuples), or null when unknown or not preloaded.
 *
 * Synchronous by design: this is called once per icon per shot while a scene is being assembled.
 * A name that was never preloaded answers null rather than starting a load nobody waits for; the
 * scene simply draws without that icon, which is how an unknown name already behaved.
 */
export const lucideIconNode = (name: string): unknown[] | null => {
    const pascal = pascalByKebab.get(toKebabCase(name));
    if (!pascal) return null;
    return nodeCache.get(pascal) ?? null;
};

/** Loads one icon as a React component, for callers that render it instead of tracing it. */
export const loadLucideIcon = async (name: string): Promise<LucideIcon | null> => {
    const pascal = pascalByKebab.get(toKebabCase(name));
    if (!pascal) return null;
    const load = getLoader(toKebabCase(pascal));
    if (!load) return null;
    try {
        const module = await load();
        return (module.default as LucideIcon) ?? null;
    } catch {
        return null;
    }
};
