import { build } from 'esbuild';
import { readFileSync, statSync } from 'node:fs';
import { nextPublicDefines } from './next-public-env.mjs';

const ENTRY = 'frontend/api/sw-outbox.ts';
const OUTPUT = 'public/sw-outbox.js';

/**
 * Bundles the Outbox drain into the service worker (ADR-0058).
 *
 * The worker has to replay the same intents as the page — through the same sync
 * engine, the same transports and the same Outbox access — or "one
 * implementation of the queue" stops being true the moment a tab is closed. It
 * cannot `import` the app's modules: those are TypeScript, and a service worker
 * loads plain scripts. So the one implementation is compiled into one file and
 * loaded with `importScripts`, the same way `sw-routing.js` is.
 *
 * Generated every predev/prebuild, git-ignored, and safely absent in a raw test
 * run (`public/sw.js` falls back to no background flush).
 */

/** Anything from React means a worker module reached into UI code. */
const REACT = /node_modules[\\/]react[\\/]/;

async function main() {
  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    outfile: OUTPUT,
    tsconfig: 'tsconfig.json',
    define: nextPublicDefines(),
    metafile: true,
    logLevel: 'warning',
  });

  const inputs = Object.keys(result.metafile.inputs);

  // A worker cannot render, and React in this bundle is always an accident: a
  // module the drain imports also holding a hook. That is how
  // `frontend/shared/submission-receipt.ts` pulled React into every Outbox
  // transport once. Fail the build rather than ship it — the fix is to split the
  // module, as that one now is.
  const fromReact = inputs.filter((file) => REACT.test(file));
  if (fromReact.length > 0) {
    throw new Error(
      `${ENTRY} must not depend on React, but it does: ${fromReact.join(', ')}. ` +
        'Split the React half out of whatever module the worker imports.'
    );
  }

  // A worker has no `process` either; a stray read takes the whole drain down
  // with no report to anyone (#1125).
  const leftover = readFileSync(OUTPUT, 'utf8').match(/process\.env\.[A-Za-z_]+/);
  if (leftover) {
    throw new Error(
      `${OUTPUT} still reads ${leftover[0]} — add it to nextPublicDefines() or stop importing it.`
    );
  }

  const { size } = statSync(OUTPUT);
  console.log(`  ✓ ${OUTPUT} → ${(size / 1024).toFixed(1)} KB across ${inputs.length} modules`);
}

main().catch((error) => {
  console.error(`  ✗ ${OUTPUT}: ${error.message}`);
  process.exit(1);
});
