#!/usr/bin/env node
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

/**
 * Bundles the client error reporter into `public/sentry-client.js` (#1820).
 *
 * The app injects this script on the first `error`/`unhandledrejection` rather
 * than importing it from Next's client graph, because Turbopack emits `<script
 * async>` tags in prerendered HTML for every reachable dynamic import — the
 * old SDK chunk was downloaded on every route even though nothing had failed.
 * A file in `public/` has no such tag, and the service worker precache list is
 * route shells only, so it is fetched on demand.
 *
 * esbuild tree-shakes the unused `@sentry/browser` re-exports (Replay, the
 * feedback widget, profiling); the result is ~31 KB gzip instead of the old
 * 148.8 KB chunk. The build-time defines match Sentry's published bundles.
 */
export const OUTPUT = 'public/sentry-client.js';

export function options() {
  return {
    entryPoints: ['frontend/shared/sentry-client-entry.ts'],
    outfile: OUTPUT,
    bundle: true,
    minify: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    define: {
      'process.env.NODE_ENV': '"production"',
      __SENTRY_DEBUG__: 'false',
      __SENTRY_TRACING__: 'true',
    },
    logLevel: 'warning',
  };
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  await build(options());
  console.log(`  ✓ ${OUTPUT} (lazy client error reporter)`);
}
