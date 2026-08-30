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
  { prefix: 'index-', name: 'app shell (index)', maxKb: 360 },
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
