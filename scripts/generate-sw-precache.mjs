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
// build lists 29. Raised again to 33 in #555, when `/news` became a data-free
// shell: on that build the 33 shells measure 1,931,124 bytes (1.84 MB) from the
// build's own HTML, against the 6 MB ceiling below. The worker fetches the list
// in idle windows after activation (#489), four routes per window, and as many
// windows as the list needs, so one pass covers this cap.
export const MAX_PRECACHE_ROUTES = 33;

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
 * Public pages that are expected to have no shell, with the reason they cannot
 * have one (#557). A page in this list is not an error; a page that is dynamic
 * and is *not* in this list is, because nothing declared that its shell was
 * meant to disappear — which is exactly how `/news` lost one.
 *
 * `/news` was the case that named the rule, and #555 is the change that closed
 * it: the filters moved to the client and the digest to a client read, so the
 * page prerenders and its shell is in the list below. Nothing may be added here
 * without saying why the page cannot be a shell.
 */
export const DYNAMIC_BY_DESIGN = [
  // The three lead forms call `getOptionalUser()` (and the price loaders) on the
  // server, so they render per request. Their writes are outbox rows, so a
  // visitor who opens one offline gets the ancestor shell and the form's own
  // needs-connection state, which is the promise the matrix makes for them.
  {
    route: '/hire',
    reason:
      'calls `getOptionalUser()` and `loadServiceDiscount()` — the price and the signed-in state come from the request',
  },
  {
    route: '/request-project',
    reason:
      'same as `/hire`: `getOptionalUser()` and `loadServiceDiscount()` decide what the page says',
  },
  {
    route: '/training/apply',
    reason: 'same as `/hire`, plus `TRAINING_COURSE.isOpen`, which a frozen shell would lock in',
  },
  // The shell's changelog. It is inherently about the newest release, so a frozen
  // document would show a stale list; it is also shell-only, and adding its route
  // to the precache list would exceed the 33-shell budget and drop `/verify`.
  {
    route: '/account/changelog',
    reason: 'shows the newest release notes — a precached shell would pin an old list',
  },
];

/**
 * Every page route that passes the exclusions, before the prerender test — the
 * set the "undeclared dynamic page" rule is measured against.
 */
function shellCandidates({ appPaths, neverCachePrefixes }) {
  const pages = new Set();
  for (const [key, route] of Object.entries(appPaths ?? {})) {
    // Route handlers (`/api/.../route`) are not pages and have no shell.
    if (!key.endsWith('/page')) continue;
    if (typeof route !== 'string') continue;
    pages.add(route);
  }

  return (
    [...pages]
      .filter((route) => route.startsWith('/'))
      .filter((route) => !route.includes('[') && !route.includes(']'))
      .filter((route) => !route.includes('?') && !route.includes('#'))
      // Internal routes (`/_not-found`) have no user-facing shell.
      .filter((route) => !route.startsWith('/_'))
      .filter((route) => !route.includes('.'))
      // `/` and `/offline` are already in the worker's fixed precache list.
      .filter((route) => route !== '/' && route !== '/offline')
      .filter((route) => !neverCachePrefixes.some((prefix) => isUnderPrefix(route, prefix)))
      .sort()
  );
}

/**
 * The selection plus everything a check needs to say *why* it is incomplete
 * (#557): a public page the build did not prerender and nobody declared, a
 * declaration that has gone stale because the page became static, and a list
 * that outgrew the cap. `selectPrecacheRoutes` is the same function's `routes`.
 */
export function auditPrecacheRoutes({
  appPaths,
  prerendered,
  neverCachePrefixes,
  dynamicByDesign = DYNAMIC_BY_DESIGN,
  maxRoutes = MAX_PRECACHE_ROUTES,
}) {
  const staticRoutes = new Set(Object.keys(prerendered ?? {}));
  const declared = new Set(
    dynamicByDesign.map((entry) => (typeof entry === 'string' ? entry : entry.route))
  );

  const candidates = shellCandidates({ appPaths, neverCachePrefixes });
  const full = candidates.filter((route) => staticRoutes.has(route));

  return {
    routes: full.slice(0, maxRoutes),
    total: full.length,
    truncated: full.length > maxRoutes ? full.slice(maxRoutes) : [],
    undeclaredDynamic: candidates.filter(
      (route) => !staticRoutes.has(route) && !declared.has(route)
    ),
    staleDeclarations: [...declared].filter((route) => staticRoutes.has(route)).sort(),
  };
}

/**
 * Selects the shell routes from the build manifests. Pure so the rules are
 * unit-tested against fixtures rather than only against whatever the current
 * build happens to contain.
 */
export function selectPrecacheRoutes(options) {
  return auditPrecacheRoutes(options).routes;
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
  const audit = auditPrecacheRoutes({
    appPaths,
    prerendered: prerenderManifest.routes,
    neverCachePrefixes,
  });

  writeFileSync(OUTPUT, renderPrecacheScript(audit.routes));
  console.log(
    `  ✓ ${OUTPUT} → ${audit.routes.length} route shell${audit.routes.length === 1 ? '' : 's'}`
  );

  // Not fatal here: `npm run build` must not fail because a new page needs a
  // decision. `npm run check:precache` is what fails, and it names the route.
  for (const route of audit.undeclaredDynamic) {
    console.log(
      `  ! ${route} is public but not prerendered — declare it in DYNAMIC_BY_DESIGN or fix the page (#557)`
    );
  }
  for (const route of audit.staleDeclarations) {
    console.log(
      `  ! ${route} is declared dynamic by design but the build prerendered it — drop it`
    );
  }
  for (const route of audit.truncated) {
    console.log(`  ! ${route} was dropped by the ${MAX_PRECACHE_ROUTES}-route cap (#557)`);
  }

  return audit.routes;
}

/** The routes a rendered `sw-precache.js` declares, for the check to compare. */
export function parsePrecacheScript(source) {
  const match = /self\.PRECACHE_ROUTES\s*=\s*(\[[\s\S]*?\]);/.exec(source);
  if (!match) throw new Error('sw-precache.js does not declare PRECACHE_ROUTES');
  return JSON.parse(match[1]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
