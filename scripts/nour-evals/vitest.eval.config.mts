import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * The agent-layer eval is an intentional live-network test: it calls the
 * production gateway through the real ChatAgentService. It must never be
 * picked up by the repo's default `npm test` (which includes the usual test
 * suffixes), so it lives under `.eval.mts` and is run only through this config.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['scripts/nour-evals/**/*.eval.mts'],
    testTimeout: 180_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '../..'),
      'server-only': path.resolve(import.meta.dirname, '../../vitest.server-only.ts'),
    },
  },
});
