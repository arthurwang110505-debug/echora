#!/usr/bin/env node
/**
 * Build script for Echora PWA
 * Run: node scripts/build.js
 */

import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runCommand(cmd, cwd = root) {
  try {
    execSync(cmd, { cwd, stdio: 'inherit', shell: true });
    return true;
  } catch (error) {
    log(`Command failed: ${cmd}`, 'red');
    return false;
  }
}

async function main() {
  const script = process.argv[2] || 'dev';

  log('╔════════════════════════════════════════════╗', 'cyan');
  log('║          Echora PWA Build Script           ║', 'cyan');
  log('╚════════════════════════════════════════════╝', 'cyan');
  log('');

  switch (script) {
    case 'core':
      log('Building @echora/core...', 'blue');
      const coreOk = runCommand('npx tsc --project packages/core/tsconfig.json');
      if (coreOk) log('Core built successfully!', 'green');
      return coreOk;

    case 'web':
      log('Building @echora/web...', 'blue');
      const webOk = runCommand('npx tsc --project packages/web/tsconfig.json && npx vite build', resolve(root, 'packages/web'));
      if (webOk) log('Web built successfully!', 'green');
      return webOk;

    case 'build':
      log('Building all packages...', 'blue');
      const allOk = runCommand('npx turbo run build');
      if (allOk) log('All packages built successfully!', 'green');
      return allOk;

    case 'dev':
      log('Starting Echora PWA...', 'blue');
      log('');
      log('Web PWA: http://localhost:3000', 'green');
      log('Core is built through the workspace dependency graph.', 'green');
      log('');
      // Start core watch mode
      runCommand('npx tsc --project packages/core/tsconfig.json --watch', root);
      // Start web dev server
      runCommand('npx vite --config packages/web/vite.config.ts', resolve(root, 'packages/web'));
      return true;

    case 'test':
      log('Running tests...', 'blue');
      return runCommand('npx vitest run');

    default:
      log(`Unknown script: ${script}`, 'red');
      log('Available scripts:', 'yellow');
      log('  core  - Build core package', 'cyan');
      log('  web   - Build web package', 'cyan');
      log('  build - Build all packages', 'cyan');
      log('  dev   - Start dev servers', 'cyan');
      log('  test  - Run tests', 'cyan');
      return false;
  }
}

main().catch((error) => {
  log(`Error: ${error.message}`, 'red');
  process.exit(1);
});
