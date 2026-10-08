#!/usr/bin/env node
/**
 * Reports source files under `packages/web/src` that no entry point can reach.
 *
 * Run from the repository root:
 *
 *   node scripts/check-dead-code.mjs            # summary + per-area totals
 *   node scripts/check-dead-code.mjs --list     # every unreachable file with its line count
 *   node scripts/check-dead-code.mjs --fail     # exit 1 if any file is unreachable (CI ratchet)
 *
 * This is a *report*, not a gate: the repository currently carries ~14k unreachable lines that are
 * tracked deliberately in docs/echora-vs-folia-gap-and-plan.md §4. Use `--fail` only after that
 * backlog is cleared, or with `--budget` to ratchet the number down.
 *
 * Two known false positives, both worth checking by hand before deleting anything:
 *   - `components/OriginalVisualizerRendererProxy.d.ts` — an ambient declaration for the `.js`
 *     proxy that IS rooted. Nothing imports the `.d.ts` by path; TypeScript picks it up by
 *     adjacency. Do not delete it.
 *   - `src/main.tsx` and `src/i18n/testSetup.ts` are rooted explicitly because they are referenced
 *     from `index.html` and `vitest.config.ts` respectively, not from any module. If you add a new
 *     non-module entry point, add it to the roots list below.
 *
 * Why a reachability walk instead of "who imports this file": a plain inbound-edge check misses
 * transitively dead clusters. `utils/appearanceCodec.ts` has two importers, but both are themselves
 * unreachable, so the whole appearance/OBS cluster (~1,900 lines) is dead and the naive check
 * reports none of it.
 */
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';

const ROOT = resolve(process.cwd(), 'packages/web/src');
const argv = process.argv.slice(2);
const wantList = argv.includes('--list');
const wantFail = argv.includes('--fail');
const budgetIdx = argv.indexOf('--budget');
const budget = budgetIdx >= 0 ? Number(argv[budgetIdx + 1]) : null;

const walk = (dir, out = []) => {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path, out);
        else if (/\.(ts|tsx|js|jsx)$/.test(entry)) out.push(path);
    }
    return out;
};

const all = walk(ROOT);
const text = new Map(all.map(file => [file, readFileSync(file, 'utf8')]));
// Count the way `wc -l` does, so the numbers here match what you get from a shell one-liner.
// (split('\n').length over-counts by one per file when the file ends in a newline.)
const lines = file => {
    const source = text.get(file);
    const newlines = source.split('\n').length - 1;
    return source.endsWith('\n') ? newlines : newlines + 1;
};
const isTest = file => /\.(test|spec)\.(ts|tsx)$/.test(file);

// Static imports, re-exports and dynamic `import()`. The dynamic form matters: every route in
// App.tsx is `lazyWithRetry(() => import('./pages/X'))`, so a static-only scan would report all
// nine pages as dead.
const specRe = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

const resolveSpec = (fromFile, spec) => {
    const base = resolve(dirname(fromFile), spec);
    for (const candidate of [
        base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`,
        join(base, 'index.ts'), join(base, 'index.tsx'),
    ]) {
        if (text.has(candidate)) return candidate;
    }
    return null;
};

const edges = new Map();
for (const file of all) {
    const deps = new Set();
    for (const match of text.get(file).matchAll(specRe)) {
        if (!match[1].startsWith('.')) continue; // bare specifiers leave src/ and are not our concern
        const target = resolveSpec(file, match[1]);
        if (target) deps.add(target);
    }
    edges.set(file, deps);
}

// ---- roots ------------------------------------------------------------------
const roots = new Set();
const addRoot = file => { if (text.has(file)) roots.add(file); };

// The app entry (index.html) plus files no module imports but the toolchain does.
addRoot(resolve(ROOT, 'main.tsx'));
addRoot(resolve(ROOT, 'vite-env.d.ts'));
addRoot(resolve(ROOT, 'i18n/testSetup.ts'));                 // vitest.config.ts `setupFiles`
addRoot(resolve(ROOT, 'components/OriginalVisualizerRendererProxy.js'));

// Tests are a legitimate consumer: anything a test reaches is not dead. This makes the reported
// number conservative — a file listed below has no importer in the app *or* in the test suite.
for (const file of all) if (isTest(file)) roots.add(file);

// `import.meta.glob` discoveries. These patterns are literal in the source and invisible to an
// import-graph walk; without them every visualizer entry, tuning adapter and stage component would
// be reported dead. Keep this list in sync if a new glob is added.
//   registry.tsx                     './*/entry.tsx'
//   tuningRegistry.ts                './*/tuning.ts'
//   backgrounds/registry.tsx         './*/entry.tsx'
//   OriginalFoliaVisualizerStage.tsx '../original-folia-visualizers/*/Visualizer*.tsx'
//                                    + three explicit create*PixiRuntime.ts loaders
const globRoots = all.filter(file => {
    const rel = relative(ROOT, file);
    return (
        /^original-folia-visualizers\/[^/]+\/entry\.tsx$/.test(rel)
        || /^original-folia-visualizers\/[^/]+\/tuning\.ts$/.test(rel)
        || /^original-folia-visualizers\/backgrounds\/[^/]+\/entry\.tsx$/.test(rel)
        || /^original-folia-visualizers\/[^/]+\/Visualizer[^/]*\.tsx$/.test(rel)
        || /^original-folia-visualizers\/[^/]+\/create[^/]*PixiRuntime\.ts$/.test(rel)
    );
});
globRoots.forEach(addRoot);

// ---- walk -------------------------------------------------------------------
const seen = new Set();
const stack = [...roots];
while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const dep of edges.get(file) ?? []) if (!seen.has(dep)) stack.push(dep);
}

const productFiles = all.filter(file => !isTest(file));
const dead = productFiles
    .filter(file => !seen.has(file))
    .map(file => relative(ROOT, file))
    .sort();
const deadLines = dead.reduce((sum, file) => sum + lines(resolve(ROOT, file)), 0);
// Denominator matches the conventional "lines of src" metric used in the docs: .ts/.tsx only.
// .js/.jsx are walked for the graph but excluded here so the percentage is comparable.
const srcLines = all.filter(file => /\.tsx?$/.test(file)).reduce((sum, file) => sum + lines(file), 0);
const pct = ((deadLines / srcLines) * 100).toFixed(1);

console.log(`packages/web/src`);
console.log(`  product files (non-test) : ${productFiles.length}`);
console.log(`  reachable from roots     : ${productFiles.length - dead.length}`);
console.log(`  UNREACHABLE              : ${dead.length} files / ${deadLines} lines (${pct}% of src)`);
console.log(`  roots                    : ${roots.size} (${globRoots.length} via import.meta.glob)`);

if (wantList) {
    console.log('');
    for (const file of dead) {
        console.log(`  ${String(lines(resolve(ROOT, file))).padStart(5)}  ${file}`);
    }
} else {
    // Group by directory so the clusters are visible without dumping 95 paths.
    const byArea = new Map();
    for (const file of dead) {
        const parts = file.split('/');
        const area = parts.slice(0, -1).join('/') || '(src root)';
        const current = byArea.get(area) ?? { count: 0, lines: 0 };
        byArea.set(area, { count: current.count + 1, lines: current.lines + lines(resolve(ROOT, file)) });
    }
    console.log('');
    console.log('  by area (re-run with --list for every path):');
    for (const [area, value] of [...byArea].sort((a, b) => b[1].lines - a[1].lines)) {
        console.log(`    ${String(value.lines).padStart(6)} lines  ${String(value.count).padStart(3)} files  ${area}`);
    }
}

if (budget !== null && deadLines > budget) {
    console.error(`\nFAIL: ${deadLines} unreachable lines exceeds the --budget of ${budget}.`);
    process.exit(1);
}
if (wantFail && dead.length > 0) {
    console.error(`\nFAIL: ${dead.length} unreachable file(s).`);
    process.exit(1);
}
