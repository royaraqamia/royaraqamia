#!/usr/bin/env node
/**
 * The app-tool routing fixture: `npm run app-tools:routing`.
 *
 * The logic lives in `scripts/app-tool-routing/run.ts`, because it runs the same
 * embedding client, the same text builder and the same router a turn runs — not
 * a second copy of any of them. This entry point loads that module through
 * esbuild (which resolves `@/` and strips the types), the way the specialist
 * index does.
 *
 * Usage:
 *   npm run app-tools:routing            # pin the tool and question vectors
 *   npm run app-tools:routing -- --check # verify the file without a provider
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const directory = await mkdtemp(join(tmpdir(), 'roy-app-tools-'));
const outfile = join(directory, 'runner.mjs');

try {
  const { build } = await import('esbuild');
  await build({
    stdin: {
      contents: "export { main } from './scripts/app-tool-routing/run.ts';",
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
