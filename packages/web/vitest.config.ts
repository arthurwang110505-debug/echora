import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@echora/core': resolve(root, '../core/src/index.ts'),
      '@shared': resolve(root, '../../shared'),
    },
  },
  test: {
    environment: 'node',
    // The setup file merges every locale bundle, so unit tests can mount any surface from any
    // entry point; the app itself only loads the bundles a visited route needs.
    setupFiles: ['./src/i18n/testSetup.ts'],
    // Playwright E2E specs live in e2e/ and are run separately by `pnpm test:e2e`;
    // they must not be collected by Vitest's unit-test runner.
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
});
