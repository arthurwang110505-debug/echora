#!/usr/bin/env node
/**
 * App-shell closure budget.
 *
 * Answers a question the per-file budgets in `check-bundle-size.mjs` cannot:
 * **what does a browser have to download and parse before the app shell's first pixel?**
 *
 * The failure this exists for: `manualChunks` put Vite's `vite/preload-helper` into the
 * same chunk as all of Pixi. Every chunk with a dynamic import imports that helper, so
 * `index.html` emitted a `modulepreload` for the 2,336 kB Pixi chunk - on the landing
 * page, for `__vitePreload` plus a handful of lucide icons. Every per-file budget passed:
 * each chunk was under its own limit. The shell still fetched 3,710 kB.
 *
 * So this walks the *static* import graph out of the entry chunks `dist/index.html` names
 * (the `<script type="module">` plus every `modulepreload`) and fails when the total is
 * over budget. Dynamic `import()` is deliberately not followed - that is the whole point
 * of the measurement.
 *
 * The graph is the union over all entries, not one sum per entry: chunks shared by the
 * entry and its preloads are counted once, which is what the network actually does.
 *
 * Second question, same answer shape: **can an installed PWA start with no network at all?**
 * `dist/sw.js` precaches a file list; anything the shell reaches statically must be in it, or a
 * cold offline start boots to a blank page. That regression shipped once: the globs named the
 * three entry chunks but not what they import, so 14 of the 17 chunks the shell can reach
 * statically (including `react-vendor` and `vite-helper`) were in no precache. The build now
 * closes the gap itself (vite-plugins/precacheShellClosure.ts); this asserts it stayed closed.
 *
 * Run after `pnpm build`:
 *   node scripts/check-shell-closure.mjs
 *   node scripts/check-shell-closure.mjs --json
 *
 * `@echora/web`'s own `build` script runs this as its last step, so CI needs no workflow
 * change to enforce it and a local build cannot produce a shell that reads the budget
 * differently from CI. Keep it that way: a budget check that only runs in one environment is
 * a budget that gets discovered late.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Absolute, from this file's own location rather than `process.cwd()`.
 *
 * The check runs from two places: `pnpm check:shell` at the repo root, and the last step of
 * `@echora/web`'s `build`, where the working directory is `packages/web`. Deriving the root from
 * the script keeps both pointing at the same dist instead of at `packages/web/packages/web/dist`.
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(REPO_ROOT, 'packages', 'web', 'dist');
const ASSETS = join(DIST, 'assets');

/**
 * What the shell may cost before its first frame, in kB (uncompressed).
 *
 * Measured when this budget was introduced (commit 1b0c338): 3,710 kB, of which 3,212 kB
 * was Pixi + three.js reached only for `__vitePreload` and a few icons. After the split
 * was corrected: 583 kB (react-vendor 440 + index 142 + vite-helper 2). The figure moves by
 * a kilobyte or two between builds because content hashing reshuffles a few modules; the
 * 300 kB gap to the budget is far larger than that noise, so it is not tuned to the build.
 *
 * The headroom is deliberate - react-vendor and index are not worth fighting over a few
 * kilobytes. What it is really guarding is a second dependency family leaking back in:
 * 700 kB leaves no room for an 857 kB Pixi chunk or an 890 kB three.js chunk.
 */
const SHELL_CLOSURE_BUDGET_KB = 700;

const kb = (bytes) => bytes / 1024;

/**
 * Files the service worker precaches, read out of the generated worker rather than its inputs:
 * the question is what an offline start can resolve, and only the emitted list answers that.
 */
const readPrecacheUrls = () => {
  let source;
  try {
    source = readFileSync(join(DIST, 'sw.js'), 'utf8');
  } catch {
    console.error('No dist/sw.js found. Run `pnpm build` before the shell-closure check.');
    process.exit(1);
  }
  // The worker is a single-quoted/escaped bundle in some workbox versions and a plain object
  // literal in others, so accept both quote styles.
  return new Set(
    [...source.matchAll(/url:\s*\\?["']([^"'\\]+)\\?["']/g)].map((match) => match[1]),
  );
};

const readEntryChunks = () => {
  let html;
  try {
    html = readFileSync(join(DIST, 'index.html'), 'utf8');
  } catch {
    console.error('No dist/index.html found. Run `pnpm build` before the shell-closure check.');
    process.exit(1);
  }
  const names = new Set();
  for (const match of html.matchAll(/<script[^>]+type="module"[^>]+src="\/assets\/([^"]+\.js)"/g)) {
    names.add(match[1]);
  }
  for (const match of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/assets\/([^"]+\.js)"/g)) {
    names.add(match[1]);
  }
  return [...names];
};

const buildGraph = (files) => {
  const graph = new Map();
  for (const file of files) {
    const source = readFileSync(join(ASSETS, file), 'utf8');
    const deps = new Set();
    // Rollup emits static imports in exactly these two shapes.
    for (const match of source.matchAll(/from\s*"(\.\/[^"]+\.js)"/g)) deps.add(match[1].slice(2));
    for (const match of source.matchAll(/import\s*"(\.\/[^"]+\.js)"/g)) deps.add(match[1].slice(2));
    graph.set(file, [...deps]);
  }
  return graph;
};

const closureOf = (graph, roots) => {
  const seen = new Set();
  const stack = [...roots];
  while (stack.length > 0) {
    const current = stack.pop();
    if (seen.has(current) || !graph.has(current)) continue;
    seen.add(current);
    stack.push(...graph.get(current));
  }
  return [...seen];
};

let files;
try {
  files = readdirSync(ASSETS).filter((name) => name.endsWith('.js'));
} catch {
  console.error('No dist assets found. Run `pnpm build` before the shell-closure check.');
  process.exit(1);
}

const entries = readEntryChunks();
if (entries.length === 0) {
  console.error('dist/index.html names no entry chunks; did the build change shape?');
  process.exit(1);
}

const graph = buildGraph(files);
const shellClosure = closureOf(graph, entries);

/**
 * The offline closure is wider than the shell closure: it also has to cover the two landing
 * routes, which `index.html` reaches through a dynamic import. Those are precached as roots by
 * the build, so take every precached chunk and follow it the same way.
 */
const precached = readPrecacheUrls();
const precachedChunks = [...precached]
  .filter((url) => url.startsWith('assets/') && url.endsWith('.js'))
  .map((url) => url.slice('assets/'.length));
const offlineClosure = closureOf(graph, precachedChunks);
const offlineMissing = offlineClosure.filter((file) => !precached.has(`assets/${file}`));
const rows = shellClosure
  .map((file) => ({ file, bytes: statSync(join(ASSETS, file)).size }))
  .sort((left, right) => right.bytes - left.bytes);
const totalKb = kb(rows.reduce((sum, row) => sum + row.bytes, 0));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({
    entries,
    budgetKb: SHELL_CLOSURE_BUDGET_KB,
    totalKb: Number(totalKb.toFixed(1)),
    chunks: rows.map((row) => ({ file: row.file, kb: Number(kb(row.bytes).toFixed(1)) })),
    precache: {
      entries: precached.size,
      offlineClosureFiles: offlineClosure.length,
      missing: offlineMissing,
    },
  }, null, 2));
} else {
  console.log(`App-shell closure: ${rows.length} chunk(s), ${totalKb.toFixed(0)} kB ` +
    `(budget ${SHELL_CLOSURE_BUDGET_KB} kB)`);
  console.log(`  entry chunks: ${entries.join(', ')}`);
  for (const row of rows) {
    console.log(`  ${kb(row.bytes).toFixed(0).padStart(6)} kB  ${row.file}`);
  }
  console.log(`Offline precache: ${precached.size} entries cover ${offlineClosure.length} chunk(s)` +
    (offlineMissing.length > 0 ? `, ${offlineMissing.length} unreachable offline` : ', complete'));
}

if (totalKb > SHELL_CLOSURE_BUDGET_KB) {
  const heaviest = rows.find((row) => row.bytes > 300 * 1024);
  console.error(
    `\n\u2717 SHELL CLOSURE BUDGET EXCEEDED: ${totalKb.toFixed(0)} kB over ${SHELL_CLOSURE_BUDGET_KB} kB.` +
    (heaviest ? `\n  Largest: ${heaviest.file} (${kb(heaviest.bytes).toFixed(0)} kB).` : '') +
    '\n  A vendor family is reachable from the app shell again. Check what `index` imports from' +
    '\n  it: Vite\'s `vite/preload-helper` is imported by every chunk that lazy-loads, so' +
    '\n  whichever manual chunk it lands in is pulled into the shell. Give it its own chunk.',
  );
  process.exit(1);
}

if (offlineMissing.length > 0) {
  console.error(
    `\n\u2717 OFFLINE START WOULD FAIL: ${offlineMissing.length} chunk(s) are statically reached ` +
    'from a precached chunk but are not precached themselves:' +
    `\n  ${offlineMissing.join('\n  ')}` +
    '\n  An installed PWA with no network cannot resolve these, so it boots to a blank page.' +
    '\n  Check that `manifestTransforms: [precacheShellClosure()]` is still configured in' +
    '\n  packages/web/vite.config.ts, and that workbox.globPatterns still names the entry chunks.',
  );
  process.exit(1);
}

console.log('\nShell-closure check passed.');
