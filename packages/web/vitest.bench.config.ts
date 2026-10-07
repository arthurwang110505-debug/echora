import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));

// vitest.bench.config.ts
//
// Runs the measurement files under `bench/`. They are deliberately NOT part of `vitest run`:
// a timing is only attributable on a machine that is not otherwise busy, and the unit suite runs
// files in parallel workers on purpose. One file, one worker, on demand (`pnpm bench`).
//
// The base config's include pattern never reaches `bench/`, so the two runners stay separate
// without either one having to exclude the other.

export default defineConfig({
    resolve: {
        alias: {
            '@echora/core': resolve(root, '../core/src/index.ts'),
        },
    },
    test: {
        environment: 'node',
        include: ['bench/**/*.bench.ts'],
        // Bench files log their numbers; keep them readable in CI output.
        disableConsoleIntercept: true,
        // The measured process must be idle, so the numbers mean something.
        fileParallelism: false,
        maxWorkers: 1,
        minWorkers: 1,
    },
});
