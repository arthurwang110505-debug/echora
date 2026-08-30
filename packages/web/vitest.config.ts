import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@echora/core': resolve(root, '../core/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/i18n/index.ts'],
    // Playwright E2E specs live in e2e/ and are run separately by `pnpm test:e2e`;
    // they must not be collected by Vitest's unit-test runner.
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
});
