import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

/**
 * The cache-posture contract for API reads (#392).
 *
 * The Quran sync snapshot leaked into Cache Storage because its endpoint was
 * neither on the worker's never-cache list nor marked `no-store`, and the
 * worker treated an absent header as permission to cache. This scan makes the
 * decision explicit for every API GET route, so the same omission on a future
 * endpoint fails here instead of on a shared device.
 *
 * A route passes when either:
 * - its path is on the worker's never-cache list (loaded from the worker's own
 *   module, not copied here), or
 * - its handler declares a posture: `NO_STORE` for account-scoped reads, or
 *   `PUBLIC_CACHEABLE` for a public read that must work offline.
 *
 * An authenticated handler may never declare the public posture.
 */

const ROOT = resolve(process.cwd());
const APP_DIR = join(ROOT, 'app');
const CONTROLLERS_DIR = join(ROOT, 'backend', 'controllers');

const ROUTING_SOURCE = readFileSync(join(ROOT, 'public', 'sw-routing.js'), 'utf8');
const routing = (() => {
  const sandbox: Record<string, unknown> = { URL };
  sandbox.self = sandbox;
  vm.runInNewContext(ROUTING_SOURCE, sandbox, { filename: 'sw-routing.js' });
  return sandbox.SWRouting as { isNeverCache(url: URL): boolean };
})();

const NO_STORE_DECLARATION = /\bNO_STORE\b|['"]Cache-Control['"]\s*:\s*['"]no-store/i;
const PUBLIC_DECLARATION = /\bPUBLIC_CACHEABLE\b|['"]Cache-Control['"]\s*:\s*['"][^'"]*\bpublic\b/i;
const AUTHENTICATED = /\bwithAuthenticatedUser\b|\bwithBearerUser\b|\bwithAdminUser\b/;

function isNeverCache(path: string): boolean {
  return routing.isNeverCache(new URL(`https://site.example${path}`));
}

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return entry === 'route.ts' ? [full] : [];
  });
}

/** The URL path a route handler serves, with route groups and file name removed. */
function routePath(file: string): string {
  const relativePath = relative(APP_DIR, file).replace(/\\/g, '/');
  const segments = relativePath
    .replace(/\/?route\.ts$/, '')
    .split('/')
    .filter((segment) => segment.length > 0 && !segment.startsWith('('));
  return `/${segments.join('/')}`;
}

function hasGetHandler(source: string): boolean {
  return /export\s+(?:async\s+)?function\s+GET\b|export\s+const\s+GET\b/.test(source);
}

/**
 * The body of one exported controller function. Slicing to the next `export`
 * matters: a sibling function's declaration must not vouch for this one.
 */
function controllerBody(source: string, name: string): string | null {
  const match = new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${name}\\b`).exec(source);
  if (!match) return null;
  const rest = source.slice(match.index + match[0].length);
  const nextExport = rest.search(/\nexport\s/);
  return nextExport === -1 ? rest : rest.slice(0, nextExport);
}

interface RouteScan {
  path: string;
  /** Handler source plus the bodies of the controllers it delegates to. */
  source: string;
  authenticated: boolean;
  unresolved: string[];
}

function scanRoute(file: string): RouteScan {
  const routeSource = readFileSync(file, 'utf8');
  const source = [routeSource];
  const unresolved: string[] = [];
  let authenticated = false;

  const importPattern = /import\s*\{([^}]*)\}\s*from\s*['"]@\/backend\/controllers\/([^'"]+)['"]/g;
  for (const match of routeSource.matchAll(importPattern)) {
    const names = (match[1] ?? '')
      .split(',')
      .map(
        (entry) =>
          entry
            .trim()
            .replace(/^type\s+/, '')
            .split(/\s+as\s+/)[0] ?? ''
      )
      .filter((name) => name.length > 0);
    const controllerFile = join(CONTROLLERS_DIR, `${match[2]}.ts`);

    let controllerSource: string;
    try {
      controllerSource = readFileSync(controllerFile, 'utf8');
    } catch {
      unresolved.push(`@/backend/controllers/${match[2]}`);
      continue;
    }

    for (const name of names) {
      const body = controllerBody(controllerSource, name);
      if (body === null) {
        unresolved.push(`@/backend/controllers/${match[2]}#${name}`);
        continue;
      }
      source.push(body);
      if (AUTHENTICATED.test(body)) authenticated = true;
    }
  }

  return { path: routePath(file), source: source.join('\n'), authenticated, unresolved };
}

/**
 * Why a route fails the contract, or `null` when it satisfies it. Exported for
 * the unit cases below so the rule itself is testable, not just today's routes.
 */
export function cachePostureViolation(route: {
  path: string;
  source: string;
  authenticated: boolean;
}): string | null {
  if (isNeverCache(route.path)) return null;

  if (PUBLIC_DECLARATION.test(route.source)) {
    return route.authenticated ? 'an authenticated read opts into public caching' : null;
  }

  if (NO_STORE_DECLARATION.test(route.source)) return null;

  return 'neither on the never-cache list nor an explicit no-store';
}

const API_GET_ROUTES = routeFiles(APP_DIR)
  .filter((file) => hasGetHandler(readFileSync(file, 'utf8')))
  .map(scanRoute)
  .filter((route) => route.path.split('/').includes('api'));

describe('API read cache posture (#392)', () => {
  it('scans the API GET routes, so an empty walk cannot pass vacuously', () => {
    expect(API_GET_ROUTES.length).toBeGreaterThanOrEqual(50);
  });

  it('leaves no API GET route unresolved', () => {
    const unresolved = API_GET_ROUTES.flatMap((route) =>
      route.unresolved.map((entry) => `${route.path} -> ${entry}`)
    );
    // A controller shape this scan cannot read is a hole in the guarantee, not
    // a route we may skip: teach the scanner the new shape instead.
    expect(unresolved).toEqual([]);
  });

  it('requires every API GET route to be never-cache or explicitly declared', () => {
    const violations = API_GET_ROUTES.map((route) => {
      const reason = cachePostureViolation(route);
      return reason ? `${route.path}: ${reason}` : null;
    }).filter((entry): entry is string => entry !== null);

    expect(violations).toEqual([]);
  });

  it('keeps the Quran sync snapshot out of Cache Storage', () => {
    const sync = API_GET_ROUTES.find((route) => route.path === '/quran/api/sync');
    expect(sync).toBeDefined();
    expect(isNeverCache('/quran/api/sync')).toBe(true);
    expect(sync?.authenticated).toBe(true);
  });
});

describe('cachePostureViolation', () => {
  const accountScoped = { authenticated: true, path: '/api/example' };
  const publicRead = { authenticated: false, path: '/api/example' };

  it('fails an authenticated read with no posture', () => {
    expect(
      cachePostureViolation({ ...accountScoped, source: 'return jsonResult(200, body);' })
    ).toBe('neither on the never-cache list nor an explicit no-store');
  });

  it('accepts an authenticated read marked no-store', () => {
    expect(
      cachePostureViolation({
        ...accountScoped,
        source: 'jsonResult(200, body, { headers: NO_STORE })',
      })
    ).toBeNull();
  });

  it('refuses to let an authenticated read opt into public caching', () => {
    expect(
      cachePostureViolation({
        ...accountScoped,
        source: 'jsonResult(200, body, { headers: PUBLIC_CACHEABLE })',
      })
    ).toBe('an authenticated read opts into public caching');
  });

  it('accepts a public read that opts in explicitly', () => {
    expect(
      cachePostureViolation({
        ...publicRead,
        source: 'jsonResult(200, body, { headers: PUBLIC_CACHEABLE })',
      })
    ).toBeNull();
  });

  it('accepts a never-cache path even without a header', () => {
    expect(
      cachePostureViolation({ authenticated: true, path: '/api/me', source: 'return body;' })
    ).toBeNull();
  });
});
