import { dirname, join, normalize } from 'node:path';
import type { ManifestEntry, ManifestTransform } from 'workbox-build';

/**
 * Precaches the app shell *by reachability* instead of by filename pattern.
 *
 * `workbox.globPatterns` used to name the entry chunks directly:
 *
 *     'assets/index-*.{js,css}', 'assets/AppHome-*.js', 'assets/Welcome-*.js'
 *
 * Naming files only works while an entry chunk is self-contained. Ours is not. Since the
 * `manualChunks` split, `index` statically imports `react-vendor` (440 kB) and `vite-helper`, and
 * `AppHome` / `Welcome` import both plus a dozen small chunks (`BrandMark`, `landingHandoff`, ...).
 * None of those matched a glob, so the precache held the entry and not its dependencies. And
 * `index.html` is deliberately not precached ("a stale precached index.html can reference deleted
 * hashed chunks"), so a cold offline start had nothing to resolve the graph from: the app
 * white-screened on an installed PWA that had already shown an install banner. Measured on the
 * build this was written against: 14 of the 17 chunks reachable from the three entry chunks were
 * missing from the precache - `react-vendor` and `vite-helper` among them.
 *
 * The defect predates the chunk split (the shell has imported React as a separate chunk for as
 * long as it has been lazily routing), but the split made it much wider, so it is fixed together
 * with it.
 *
 * How: take the entry chunks as roots, walk every static `import` / `export ... from` /
 * bare `import "..."` out of them, and add whatever the closure reached that the globs missed.
 * Dynamic `import()` is not followed - the visualizer modes must keep loading on demand, and
 * precaching eleven stages would undo the install-size work behind `check-shell-closure.mjs`.
 *
 * This runs as a workbox `manifestTransform`, i.e. after the globs have read the built files and
 * before the service worker is written. That ordering is the point: the closure is computed from
 * the actual output, so it cannot drift from the chunk names, and a graph this walk cannot follow
 * fails the build instead of shipping a white screen.
 */

/** Roots: the chunks `index.html` starts with, plus the two routes it can land on. */
const DEFAULT_ENTRY_PATTERNS = [
    /^assets\/index-[^/]*\.js$/,
    /^assets\/AppHome-[^/]*\.js$/,
    /^assets\/Welcome-[^/]*\.js$/,
];

/**
 * Static imports only.
 *
 * `import(` is blanked first, otherwise the bare-import pattern matches it and every lazily
 * loaded stage ends up in the precache. Rollup's readable output emits `from"./chunk.js"`; Vite's
 * preload helper appears as a side-effect import in older shapes, hence the second pattern.
 */
const FROM_IMPORT = /(?:^|[;\s}])(?:import|export)\s*(?:[^"'`]*?)\bfrom\s*["']([^"']+)["']/g;
const BARE_IMPORT = /(?:^|[;\s}])import\s*["']([^"']+)["']/g;

/** Only sibling files are followed: nothing in this build externalises a bare specifier. */
const siblingSpecifiers = (source: string): string[] => {
    const stripped = source.replace(/import\s*\(/g, 'import (');
    const found = new Set<string>();
    for (const pattern of [FROM_IMPORT, BARE_IMPORT]) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(stripped)) !== null) {
            const specifier = match[1];
            if (!specifier.startsWith('.')) continue;
            const url = specifier.replace(/^\.\//, '');
            if (!url.includes('://') && !url.startsWith('..')) found.add(url);
        }
    }
    return [...found];
};

export interface PrecacheClosureOptions {
    /**
     * Absolute path to the build output, i.e. `<package root>/dist`.
     *
     * Passed in rather than derived: the transform runs inside workbox, whose own cwd is wherever
     * the build was started, and guessing it turns a working build into an ENOENT at the very end.
     */
    distDir?: string;
    /** Entry chunk paths relative to `distDir`, e.g. `assets/index-CjfYeAlB.js`. */
    entryPatterns?: RegExp[];
    /** A cyclic graph would otherwise loop forever; the real closure is a few dozen files. */
    maxFiles?: number;
}

/**
 * A workbox `manifestTransform` that appends the shell's static closure.
 *
 * Entries are keyed by URL: a file a glob already matched keeps its glob-produced revision rather
 * than being added twice (workbox keeps both copies, and `cleanupOutdatedCaches` then reports a
 * duplicate).
 */
export const precacheShellClosure = ({
    distDir = join(process.cwd(), 'dist'),
    entryPatterns = DEFAULT_ENTRY_PATTERNS,
    maxFiles = 200,
}: PrecacheClosureOptions = {}): ManifestTransform => async (manifestEntries) => {
    const { readFile } = await import('node:fs/promises');
    const { createHash } = await import('node:crypto');

    const dist = distDir;

    const known = new Map(manifestEntries.map(entry => [entry.url, entry]));
    const roots = [...known.keys()].filter(url => entryPatterns.some(pattern => pattern.test(url)));
    if (roots.length === 0) {
        throw new Error(
            '[precacheShellClosure] none of the shell entry chunks are in the precache manifest. '
            + 'The entry globs and the built chunk names have drifted apart; offline start would '
            + 'white-screen. Check workbox.globPatterns against the build output.',
        );
    }

    const added: ManifestEntry[] = [];
    const seen = new Set(roots);
    const queue = [...roots];
    while (queue.length > 0) {
        const url = queue.shift()!;
        let source: string;
        try {
            source = await readFile(join(dist, url), 'utf8');
        } catch {
            throw new Error(
                `[precacheShellClosure] "${url}" is statically imported by the app shell but is not `
                + 'in the build output. The service worker would fail to boot the app offline.',
            );
        }
        for (const specifier of siblingSpecifiers(source)) {
            // Resolve against the importing file's own directory: chunks live under `assets/`, and a
            // bare `vite-helper-....js` would be looked up at the dist root.
            const dependency = normalize(join(dirname(url), specifier));
            if (seen.has(dependency)) continue;
            seen.add(dependency);
            if (seen.size > maxFiles) {
                throw new Error(
                    `[precacheShellClosure] the shell closure exceeded ${maxFiles} files. That is a `
                    + 'sign the walk followed a lazy import; check that dynamic imports are stripped '
                    + 'before parsing.',
                );
            }
            queue.push(dependency);
            if (known.has(dependency)) continue;
            let bytes: Buffer;
            try {
                bytes = await readFile(join(dist, dependency));
            } catch {
                throw new Error(
                    `[precacheShellClosure] "${dependency}" is statically imported by "${url}" but is `
                    + 'not in the build output. The service worker could not boot the app offline.',
                );
            }
            const entry: ManifestEntry = {
                url: dependency,
                // Content hash in the URL already revisioned this file, but workbox still needs a
                // revision to decide whether a cached copy is current.
                revision: createHash('md5').update(bytes).digest('hex'),
            };
            known.set(dependency, entry);
            added.push(entry);
        }
    }

    return {
        manifest: [...manifestEntries, ...added],
        warnings: added.length > 0
            ? [`[precacheShellClosure] added ${added.length} shell dependenc${
                added.length === 1 ? 'y' : 'ies'
            } the precache globs did not cover: ${added.map(entry => entry.url).join(', ')}`]
            : [],
    };
};
