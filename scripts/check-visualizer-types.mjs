#!/usr/bin/env node
/**
 * Type gate for the ported visualizer tree (`packages/web/src/original-folia-visualizers`).
 *
 * The main `tsconfig.json` excludes that folder, and the exclusion is transitive: a file that is
 * only reached through the excluded folder is not checked either. Layer A of the Tempera port
 * added `packages/web/tsconfig.pixi.json` for the shared Pixi modules; `tsconfig.visualizers.json`
 * widens that to the whole ported tree so a new mode cannot land as a type-checking blind spot.
 *
 * The project carries a small, explicitly listed set of pre-existing failures (KNOWN_DEBT below).
 * Any other error - and any debt entry that stops matching - fails the check, so a genuine
 * regression cannot hide inside the noise.
 *
 * Run from the repository root: `node scripts/check-visualizer-types.mjs`
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const TSC = ['node_modules/typescript/bin/tsc', 'packages/web/node_modules/typescript/bin/tsc']
  .map((path) => resolve(process.cwd(), path))
  .find(existsSync);
const PROJECT = resolve(process.cwd(), 'packages/web/tsconfig.visualizers.json');

if (!TSC) {
  console.error('TypeScript is not installed. Run `pnpm install` at the repository root first.');
  process.exit(1);
}
if (!existsSync(PROJECT)) {
  console.error(`Missing ${PROJECT}.`);
  process.exit(1);
}

/**
 * Long-standing debt of `src/types.ts`, which was vendored before three of the modules it imports
 * (`types/onlineMusic`, `types/localLibrary`, `types/localCover`) were dropped. Only the dead
 * `src/utils/**` code from that earlier port uses those names; nothing in the visualizer tree
 * does. Kept as one entry per (file, error code) with an exact count.
 */
const KNOWN_DEBT = [{ file: 'src/types.ts', code: 'TS2307', count: 7 }];

const result = spawnSync(process.execPath, [TSC, '-p', PROJECT, '--noEmit', '--pretty', 'false'], {
  cwd: resolve(process.cwd(), 'packages/web'),
  encoding: 'utf8',
});
if (result.error) {
  console.error(result.error);
  process.exit(1);
}

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
const parsed = output
  .split('\n')
  .map((line) => /^(.*?)\((\d+),(\d+)\): error (TS\d+): (.*)$/u.exec(line.trim()))
  .filter(Boolean)
  .map(([, file, line, column, code, message]) => ({
    // tsc is run from `packages/web`, so paths are relative to it already; normalise in case.
    file: file.replace(/^.*?packages\/web\//u, ''),
    line,
    column,
    code,
    message,
  }));

const owed = new Map(KNOWN_DEBT.map((entry) => [`${entry.file} ${entry.code}`, entry.count]));
const unexpected = [];
for (const item of parsed) {
  const key = `${item.file} ${item.code}`;
  const left = owed.get(key) ?? 0;
  if (left > 0) {
    owed.set(key, left - 1);
    continue;
  }
  unexpected.push(item);
}

const unmatched = KNOWN_DEBT.filter((entry) => owed.get(`${entry.file} ${entry.code}`) !== 0).map(
  (entry) =>
    `${entry.file} ${entry.code}: expected ${entry.count} occurrence(s), saw ${entry.count - (owed.get(`${entry.file} ${entry.code}`) ?? 0)}`,
);

if (unexpected.length === 0 && unmatched.length === 0) {
  console.log(
    `Visualizer type check passed (${parsed.length} known error(s) in src/types.ts, all listed as debt).`,
  );
  process.exit(0);
}

console.error('Visualizer type check FAILED.');
if (unexpected.length > 0) {
  console.error('\nUnexpected error(s):');
  for (const item of unexpected) {
    console.error(`  ${item.file}(${item.line},${item.column}): error ${item.code}: ${item.message}`);
  }
}
if (unmatched.length > 0) {
  console.error('\nKnown-debt entries that no longer match (update KNOWN_DEBT when the debt is paid off):');
  for (const line of unmatched) console.error(`  ${line}`);
}
process.exit(1);
