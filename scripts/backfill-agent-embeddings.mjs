#!/usr/bin/env node
/**
 * Backfill the memory vectors: `npm run embeddings:backfill`.
 *
 * The logic lives in `scripts/backfill-agent-embeddings.ts`, because it runs the
 * same client, repository and service a turn runs — not a second copy of them.
 * This entry point loads that module through esbuild (which resolves `@/` and
 * strips the types), the way `scripts/mcp-catalog-agent.mjs` loads the catalogue
 * agent.
 *
 * Usage:
 *   npm run embeddings:backfill
 *   node scripts/backfill-agent-embeddings.mjs --batches 200 --batch 64
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const directory = await mkdtemp(join(tmpdir(), 'roy-embeddings-'));
const outfile = join(directory, 'runner.mjs');

try {
  const { build } = await import('esbuild');
  await build({
    stdin: {
      contents: "export { main } from './scripts/backfill-agent-embeddings/run.ts';",
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    alias: { '@': ROOT },
    // The repository seam reports through `@sentry/nextjs`, whose CJS build
    // `require`s node builtins; an ESM bundle has no `require` unless one is
    // handed to it.
    banner: {
      js: "import{createRequire as __createRequire}from'node:module';const require=__createRequire(import.meta.url);",
    },
    outfile,
    logLevel: 'silent',
  });

  const { main } = await import(pathToFileURL(outfile).href);
  process.exitCode = await main(process.argv.slice(2));
} finally {
  await rm(directory, { recursive: true, force: true });
}
