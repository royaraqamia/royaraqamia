import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

/**
 * Emits the public static routes whose HTML shells the service worker refreshes
 * in the background after activation (#395, #489).
 *
 * The list is derived from what the build actually produced, not from a
 * hand-maintained file:
 *
 * - `app-path-routes-manifest.json` names every page route, so dynamic detail
 *   patterns (`/quran/[surah]`) are visible as patterns and can be dropped.
 * - `prerender-manifest.json` names the routes the build rendered ahead of time,
 *   which is exactly "public static": a `force-dynamic` page is absent, and a
 *   route that only exists per request cannot have a shell to precache.
 * - `sw-routing.js` owns the never-cache prefixes (ADR-0031), so the generator
 *   cannot drift from the worker about which surfaces are account-bearing.
 *
 * Runs as `postbuild`, after `next build` has written both manifests. Without
 * them (dev, a bare test run) it emits an empty list and the worker falls back
 * to its fixed shell.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = resolve(ROOT, 'public', 'sw-precache.js');
const APP_PATHS = resolve(ROOT, '.next', 'app-path-routes-manifest.json');
const PRERENDER = resolve(ROOT, '.next', 'prerender-manifest.json');
const ROUTING = resolve(ROOT, 'public', 'sw-routing.js');

// A hard cap on the build-time list, independent of bytes. The refresh ceiling
// below is the real constraint; the cap keeps a routing mistake (a dynamic
// segment that lost its brackets, an accidental catch-all) from turning into
// thousands of fetches on a device. Raised from 24 to 32 in #449: the cached
// auth/account/product shells alone were 27 routes on that build, and a cap
// below that drops public content (`/terms`, `/verify`) from the tail. The #450
// build lists 29. The worker fetches the list in idle windows after activation
// (#489), four routes per window over eight windows, so one pass covers this cap.
export const MAX_PRECACHE_ROUTES = 32;

// Cacheable, data-free, but not public content: `/device` is the per-device
// diagnostics tool (ADR-0070), reached from `/account` and warmed there. A
// public route list must not grow into "every route the worker may cache".
const NON_PUBLIC_ROUTES = ['/device'];

// Ceiling for the route shells, documented in ADR-0071. HTML shells are the
// only thing fetched here (no RSC variants). The 29 shells the #450 build
// produces — auth, account, the public pages, the four product dashboards,
// `/consultation/book`, `/downloader` and `/mcp/guide` — measure 1,705,315 bytes
// (1.63 MB) from the build's own files. The cache budget still wins: the worker
// will not spend bytes it does not have, and since #489 it spends them over idle
// windows after activation rather than during install.
export const ROUTE_PRECACHE_BUDGET_BYTES = 6 * 1024 * 1024;

/** Reads the never-cache prefixes from the worker's routing script. */
export function readNeverCachePrefixes(source) {
  const sandbox = { self: {} };
  vm.runInNewContext(source, sandbox, { filename: 'sw-routing.js' });
  const prefixes = sandbox.self.SWRouting && sandbox.self.SWRouting.NEVER_CACHE_PREFIXES;
  if (!Array.isArray(prefixes) || prefixes.length === 0) {
    throw new Error('sw-routing.js did not expose NEVER_CACHE_PREFIXES');
  }
  return prefixes;
}

function isUnderPrefix(route, prefix) {
  return route === prefix || route.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);
}

/**
 * Selects the shell routes from the build manifests. Pure so the rules are
 * unit-tested against fixtures rather than only against whatever the current
 * build happens to contain.
 */
export function selectPrecacheRoutes({
  appPaths,
  prerendered,
  neverCachePrefixes,
  maxRoutes = MAX_PRECACHE_ROUTES,
}) {
  const pages = new Set();
  for (const [key, route] of Object.entries(appPaths ?? {})) {
    // Route handlers (`/api/.../route`) are not pages and have no shell.
    if (!key.endsWith('/page')) continue;
    if (typeof route !== 'string') continue;
    pages.add(route);
  }

  const staticRoutes = new Set(Object.keys(prerendered ?? {}));

  const routes = [...pages]
    .filter((route) => route.startsWith('/'))
    .filter((route) => !route.includes('[') && !route.includes(']'))
    .filter((route) => !route.includes('?') && !route.includes('#'))
    // Internal routes (`/_not-found`) have no user-facing shell.
    .filter((route) => !route.startsWith('/_'))
    .filter((route) => !route.includes('.'))
    // `/` and `/offline` are already in the worker's fixed precache list.
    .filter((route) => route !== '/' && route !== '/offline')
    .filter((route) => staticRoutes.has(route))
    .filter((route) => !NON_PUBLIC_ROUTES.some((excluded) => isUnderPrefix(route, excluded)))
    .filter((route) => !neverCachePrefixes.some((prefix) => isUnderPrefix(route, prefix)))
    .sort();

  return routes.slice(0, maxRoutes);
}

export function renderPrecacheScript(routes) {
  return (
    '// Auto-generated by scripts/generate-sw-precache.mjs — do not edit by hand.\n' +
    '// Public static route shells only: no RSC variants, no dynamic details.\n' +
    `self.PRECACHE_ROUTES = ${JSON.stringify(routes)};\n`
  );
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function main() {
  if (!existsSync(APP_PATHS) || !existsSync(PRERENDER)) {
    writeFileSync(OUTPUT, renderPrecacheScript([]));
    console.log(`  ✓ ${OUTPUT} → (no build output yet)`);
    return [];
  }

  const appPaths = readJson(APP_PATHS);
  const prerenderManifest = readJson(PRERENDER);
  if (!appPaths || !prerenderManifest || !prerenderManifest.routes) {
    throw new Error('could not read the Next build manifests for the precache list');
  }

  const neverCachePrefixes = readNeverCachePrefixes(readFileSync(ROUTING, 'utf8'));
  const routes = selectPrecacheRoutes({
    appPaths,
    prerendered: prerenderManifest.routes,
    neverCachePrefixes,
  });

  writeFileSync(OUTPUT, renderPrecacheScript(routes));
  console.log(`  ✓ ${OUTPUT} → ${routes.length} route shell${routes.length === 1 ? '' : 's'}`);
  return routes;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
