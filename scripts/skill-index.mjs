#!/usr/bin/env node
/**
 * The specialist vectors: `npm run skills:index`, and `npm run check:skills`.
 *
 * The logic lives in `scripts/skill-index/run.ts`, because it runs the same
 * embedding client and reads the same roster the turn reads — not a second copy
 * of either. This entry point loads that module through esbuild (which resolves
 * `@/` and strips the types), the way the memory backfill does.
 *
 * Usage:
 *   npm run skills:index              # rebuild the artifact from the roster
 *   npm run skills:index -- --fixtures  # also refresh the routing fixtures' vectors
 *   npm run check:skills              # fail when the artifact is stale (no key, no network)
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const directory = await mkdtemp(join(tmpdir(), 'roy-skill-index-'));
const outfile = join(directory, 'runner.mjs');

try {
  const { build } = await import('esbuild');
  await build({
    stdin: {
      contents: "export { main } from './scripts/skill-index/run.ts';",
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    alias: { '@': ROOT },
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
