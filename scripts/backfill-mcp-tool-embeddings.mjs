#!/usr/bin/env node
/**
 * Backfill the connected apps' tool vectors: `npm run mcp-tools:embed`.
 *
 * The logic lives in `scripts/backfill-mcp-tool-embeddings/run.ts`, because it runs the
 * same client, repository and service a turn runs — not a second copy of them.
 * This entry point loads that module through esbuild (which resolves `@/` and
 * strips the types), the way the specialist index does.
 *
 * Usage:
 *   npm run mcp-tools:embed
 *   node scripts/backfill-mcp-tool-embeddings.mjs --strict
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const directory = await mkdtemp(join(tmpdir(), 'roy-mcp-tool-embeddings-'));
const outfile = join(directory, 'runner.mjs');

try {
  const { build } = await import('esbuild');
  await build({
    stdin: {
      contents: "export { main } from './scripts/backfill-mcp-tool-embeddings/run.ts';",
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
