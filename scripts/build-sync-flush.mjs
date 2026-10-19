import { build } from 'esbuild';
import { statSync } from 'node:fs';

const ENTRY = 'frontend/api/sync-flush.ts';
const OUTPUT = 'public/sync-flush.js';

/**
 * Bundles the Android shell's headless drain page (ADR-0059).
 *
 * The shell wakes a WorkManager job with the app backgrounded or killed; the job
 * loads `/sync-flush.html` in a headless WebView and waits for it to report. That
 * page has to replay the same intents as a tab would — through the same sync
 * engine, the same transports and the same Outbox access — or "one
 * implementation of the queue" stops being true the moment the app closes. It
 * cannot `import` the app's modules: those are TypeScript, and the page loads
 * plain scripts. So the one implementation is compiled into one file, exactly as
 * the worker's drain is.
 *
 * `es2020`, not the worker's `es2022`: this bundle runs inside the shell's
 * WebView, and the oldest one the app still meets is the API 30 emulator image's
 * 83.0.4103.106 (`docs/mobile/android-shell.md`). `??=` is ES2021 and that
 * WebView cannot parse it, so the worker bundle's target would ship this page a
 * syntax error.
 *
 * Generated every predev/prebuild, git-ignored, and safely absent in a raw test
 * run (the drain page then reports nothing and the worker comes back later).
 */

/** Anything from React means a page bundle reached into UI code. */
const REACT = /node_modules[\\/]react[\\/]/;

async function main() {
  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    minify: true,
    outfile: OUTPUT,
    tsconfig: 'tsconfig.json',
    metafile: true,
    logLevel: 'warning',
  });

  const inputs = Object.keys(result.metafile.inputs);

  // A headless page cannot render, and React in this bundle is always an
  // accident: a module the drain imports also holding a hook. That is how
  // `frontend/shared/submission-receipt.ts` pulled React into every Outbox
  // transport once. Fail the build rather than ship it.
  const fromReact = inputs.filter((file) => REACT.test(file));
  if (fromReact.length > 0) {
    throw new Error(
      `${ENTRY} must not depend on React, but it does: ${fromReact.join(', ')}. ` +
        'Split the React half out of whatever module the worker imports.'
    );
  }

  const { size } = statSync(OUTPUT);
  console.log(`  ✓ ${OUTPUT} → ${(size / 1024).toFixed(1)} KB across ${inputs.length} modules`);
}

main().catch((error) => {
  console.error(`  ✗ ${OUTPUT}: ${error.message}`);
  process.exit(1);
});
