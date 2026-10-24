import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAX_PRECACHE_ROUTES,
  auditPrecacheRoutes,
  parsePrecacheScript,
  readNeverCachePrefixes,
} from './generate-sw-precache.mjs';

/**
 * The precache list is checked, not trusted (#557).
 *
 * `generate-sw-precache.mjs` derives the shell list from the build, which means
 * it is correct only about the rules it applies. Nothing failed when a public
 * page stopped being prerenderable, so `/news` simply had no shell and an
 * offline open fell through to the nearest ancestor (#490). Nothing failed when
 * the list outgrew its cap either — `slice()` dropped the tail in silence.
 *
 * Three questions, all after a build:
 *
 * 1. Is a public page dynamic without a `DYNAMIC_BY_DESIGN` declaration?
 * 2. Has a declaration gone stale (the page became static)?
 * 3. Did the cap drop routes?
 *
 * And one consistency check: `public/sw-precache.js` has to be what this
 * selection says it is. It is a build output — gitignored, like `sw-version.js` —
 * so there is nothing to keep in sync with the repository; the file is compared
 * so a generator run against older manifests, or a hand edit, is caught.
 *
 * Without `.next` (a bare checkout, a unit-test run) it says so and exits 0:
 * the answer needs the build, and a check that guesses is worse than no check.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP_PATHS = resolve(ROOT, '.next', 'app-path-routes-manifest.json');
const PRERENDER = resolve(ROOT, '.next', 'prerender-manifest.json');
const ROUTING = resolve(ROOT, 'public', 'sw-routing.js');
const OUTPUT = resolve(ROOT, 'public', 'sw-precache.js');

export function audit({ root = ROOT } = {}) {
  const appPaths = readJson(resolve(root, '.next', 'app-path-routes-manifest.json'));
  const prerenderManifest = readJson(resolve(root, '.next', 'prerender-manifest.json'));
  if (!appPaths || !prerenderManifest?.routes) return null;

  const routing = resolve(root, 'public', 'sw-routing.js');
  const neverCachePrefixes = readNeverCachePrefixes(readFileSync(routing, 'utf8'));

  return auditPrecacheRoutes({
    appPaths,
    prerendered: prerenderManifest.routes,
    neverCachePrefixes,
  });
}

export function errorsFor({ result, scriptSource }) {
  const errors = [];

  for (const route of result.undeclaredDynamic) {
    errors.push(
      `${route} is public but the build did not prerender it, and it is not declared in DYNAMIC_BY_DESIGN — it can never be precached, so an offline open falls back to its nearest ancestor. Make the page static or declare it with a reason (#557).`
    );
  }
  for (const route of result.staleDeclarations) {
    errors.push(
      `${route} is in DYNAMIC_BY_DESIGN but the build prerendered it — remove the declaration so it can be precached`
    );
  }
  if (result.truncated.length > 0) {
    errors.push(
      `the list exceeds MAX_PRECACHE_ROUTES (${MAX_PRECACHE_ROUTES}) and dropped: ${result.truncated.join(', ')} — raise the cap with a measured budget or trim the list`
    );
  }

  if (scriptSource !== null) {
    let declared;
    try {
      declared = parsePrecacheScript(scriptSource);
    } catch (error) {
      errors.push(`public/sw-precache.js is unreadable: ${error.message}`);
      return errors;
    }
    const expected = JSON.stringify(result.routes);
    if (JSON.stringify(declared) !== expected) {
      errors.push(
        `public/sw-precache.js is stale: the build selects ${result.routes.length} routes and the file declares ${declared.length}`
      );
    }
  }

  return errors;
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
    console.log('  – check:precache skipped: no build output (.next) to derive the list from');
    return 0;
  }

  const result = audit();
  if (!result) {
    console.log('  – check:precache skipped: the build manifests do not name any route');
    return 0;
  }

  const scriptSource = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8') : null;
  const errors = errorsFor({ result, scriptSource });

  if (errors.length > 0) {
    for (const error of errors) console.error(`✗ ${error}`);
    return 1;
  }

  console.log(
    `  ✓ ${result.routes.length} route shells, ${result.total - result.routes.length} dropped, ${result.undeclaredDynamic.length} undeclared, ${result.staleDeclarations.length} stale declarations`
  );
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
