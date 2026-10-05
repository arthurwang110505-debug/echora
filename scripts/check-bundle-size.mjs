#!/usr/bin/env node
/**
 * Fails CI when a primary bundle chunk grows past its budget.
 * Run after `pnpm build` so `packages/web/dist/assets` is populated.
 *
 * Budgets are set with headroom above the current production build; bump them
 * deliberately (not silently) when a chunk legitimately grows.
 */
import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const DIST = resolve(process.cwd(), 'packages/web/dist/assets');

const BUDGETS = [
  // The app shell now bundles the react-i18next runtime plus inline zh-TW/en
  // resources (P1-5), which legitimately grew index by ~35 kB over the baseline.
  // Bumped 360 → 390 kB when the privacy policy and terms gained the Google API
  // Services / Limited Use disclosures (OAuth verification): every locale's copy
  // ships in this chunk because the legal routes resolve `t()` from the shared
  // resources. Moving that copy into route-level resource bundles would let this
  // budget come back down.
  // Bumped 390 → 394 KiB for the stage-overlay settings card, then 394 → 397 for the
  // word-segmentation panel's copy. Both are the same root cause and neither is real
  // weight: ~2 kB of user-facing strings per feature, two locales, all of it in this
  // chunk. Cumulative cost so far: 390.0 → 394.5 KiB, i.e. this budget is now the
  // window on an i18n architecture problem rather than on app growth.
  //
  // The fix is the one the comment above already names: move locale copy out of the
  // shared resources into route-level bundles (the player's panel strings belong to
  // the lazily loaded player chunk, which is where the panel itself already lives).
  // ~7 KiB comes back, and this budget stops being raised for content it should
  // never have carried. Tracked in docs/echora-gap-analysis.zh-TW.md ("i18n 分區載入").
  { prefix: 'index-', name: 'app shell (index)', maxKb: 397 },
  { prefix: 'three-runtime-', name: 'three-runtime', maxKb: 950 },
  { prefix: 'sonnet-scene-', name: 'sonnet-scene', maxKb: 2500 },
  { prefix: 'stage-runtime-', name: 'stage-runtime', maxKb: 200 },
];

let files;
try {
  files = readdirSync(DIST).filter((name) => name.endsWith('.js'));
} catch {
  console.error('No dist assets found. Run `pnpm build` before the bundle-size check.');
  process.exit(1);
}

let failed = false;
const report = [];

for (const file of files) {
  const sizeKb = statSync(resolve(DIST, file)).size / 1024;
  const budget = BUDGETS.find((entry) => file.startsWith(entry.prefix));
  report.push(`${file}: ${sizeKb.toFixed(1)} kB${budget ? ` (budget ${budget.maxKb} kB · ${budget.name})` : ''}`);
  if (budget && sizeKb > budget.maxKb) {
    console.error(`✗ BUNDLE BUDGET EXCEEDED: ${file} is ${sizeKb.toFixed(1)} kB, over the ${budget.maxKb} kB budget for ${budget.name}.`);
    failed = true;
  }
}

console.log('Bundle assets:');
for (const line of report.sort()) console.log(`  ${line}`);

if (failed) {
  console.error('\nBundle-size check FAILED.');
  process.exit(1);
}
console.log('\nBundle-size check passed.');
