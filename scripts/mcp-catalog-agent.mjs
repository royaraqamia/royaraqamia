#!/usr/bin/env node
/**
 * The catalogue agent's runner (#1293).
 *
 * The logic lives in `scripts/mcp-catalog-agent/run.ts`, because it imports the
 * probe and the egress policy the store already uses — the same code a member's
 * connect flow runs, not a second copy of those rules. This entry point loads
 * that module through esbuild (which resolves `@/` and strips the types), the
 * way `scripts/generate-contracts.mjs` loads the shared contracts.
 *
 * Usage:
 *   node scripts/mcp-catalog-agent.mjs plan    # measure, write the plan file
 *   node scripts/mcp-catalog-agent.mjs apply   # read the plan + decisions, write
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const directory = await mkdtemp(join(tmpdir(), 'roy-mcp-agent-'));
const outfile = join(directory, 'runner.mjs');

try {
  const { build } = await import('esbuild');
  await build({
    stdin: {
      contents: "export { main } from './scripts/mcp-catalog-agent/run.ts';",
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    alias: { '@': ROOT },
    outfile,
    logLevel: 'silent',
  });

  const { main } = await import(pathToFileURL(outfile).href);
  await main(process.argv.slice(2));
} finally {
  await rm(directory, { recursive: true, force: true });
}
