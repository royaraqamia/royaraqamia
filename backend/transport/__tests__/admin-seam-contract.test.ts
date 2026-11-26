import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * The Admin adapter is the only door for Admin surfaces (issue #108): these
 * checks fail loudly if the old bare-error guard returns, if a surface stops
 * wrapping its request in the adapter, or if production code starts
 * string-matching the failure reason instead of using the typed outcome.
 */

const ROOT = process.cwd();
const PRODUCTION_ROOTS = ['backend', 'app'];
const IGNORED_DIRS = new Set(['node_modules', '.next', '__tests__', 'coverage']);
const SOURCE_SUFFIX = /\.tsx?$/;
const TEST_FILE = /\.(test|spec)\.tsx?$/;

/** The old failure vocabulary, which the seam now expresses as a typed union. */
const AUTH_FAILURE_LITERAL = /['"`](UNAUTHORIZED|FORBIDDEN)['"`]/;

const API_ROOT = resolve(ROOT, 'app/api');
const ROUTE_FILE = /^route\.tsx?$/;
const IMPORT_SPECIFIER = /from\s+['"]([^'"]+)['"]/g;

/**
 * Controller modules that genuinely do not need the Admin adapter.
 *
 * `admin-allowlist.ts` authenticates with its own `ADMIN_SYNC_SECRET` bearer
 * token; the mirror mechanism is frozen by ADR-0003. `admin-list.ts` is a helper
 * shared by controllers, not an Admin surface.
 */
const ADMIN_CONTROLLER_EXEMPTIONS = new Set([
  'backend/controllers/admin-allowlist.ts',
  'backend/controllers/admin-list.ts',
]);

/** Remove prose so the string-matching check judges code, not comments. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

function listSources(roots: string[]): string[] {
  const files: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) walk(full);
        continue;
      }
      if (SOURCE_SUFFIX.test(entry.name) && !TEST_FILE.test(entry.name)) files.push(full);
    }
  };

  for (const root of roots) walk(resolve(ROOT, root));
  return files;
}

const readSource = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');
const toPosix = (path: string) => path.replaceAll('\\', '/');

/** Every route that exposes an Admin surface, including nested `admin` segments. */
function listAdminRoutes(): string[] {
  const routes: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!ROUTE_FILE.test(entry.name)) continue;
      const segments = relative(API_ROOT, full).split(/[\\/]/);
      if (segments.slice(0, -1).includes('admin')) routes.push(full);
    }
  };

  walk(API_ROOT);
  return routes.sort();
}

/** The controller modules a route imports, resolved to their source files. */
function importedControllers(route: string): string[] {
  const modules = new Set<string>();

  for (const match of readFileSync(route, 'utf8').matchAll(IMPORT_SPECIFIER)) {
    const specifier = match[1];
    if (!specifier || !specifier.includes('backend/controllers/')) continue;

    const target = specifier.startsWith('@/')
      ? resolve(ROOT, specifier.slice(2))
      : resolve(dirname(route), specifier);
    const candidates = [target, `${target}.ts`, `${target}.tsx`, join(target, 'index.ts')];
    modules.add(candidates.find(existsSync) ?? `${target}.ts`);
  }

  return [...modules].sort();
}

describe('Admin seam contract', () => {
  const sources = listSources(PRODUCTION_ROOTS);

  it('keeps the old bare-error Admin guard deleted', () => {
    expect(existsSync(resolve(ROOT, 'backend/middleware/admin-auth-guard.ts'))).toBe(false);
  });

  it('leaves no production caller of the old guard', () => {
    for (const file of sources) {
      expect(readFileSync(file, 'utf8'), relative(ROOT, file)).not.toMatch(
        /admin-auth-guard|requireAdminAuth/
      );
    }
  });

  it('does not string-match the failure reason anywhere in production code', () => {
    for (const file of sources) {
      expect(stripComments(readFileSync(file, 'utf8')), relative(ROOT, file)).not.toMatch(
        AUTH_FAILURE_LITERAL
      );
    }
  });

  it('resolves the Admin identity in controllers only through the adapter', () => {
    const controllers = listSources(['backend/controllers']);
    for (const file of controllers) {
      expect(readFileSync(file, 'utf8'), relative(ROOT, file)).not.toMatch(/resolveAdmin/);
    }
  });

  it('resolves every Admin route to a controller', () => {
    const routes = listAdminRoutes();
    expect(routes.length, 'no Admin routes discovered under app/api').toBeGreaterThan(0);
    for (const route of routes) {
      expect(importedControllers(route).length, toPosix(relative(ROOT, route))).toBeGreaterThan(0);
    }
  });

  it('routes Admin surfaces discovered from the route tree through the adapter', () => {
    for (const route of listAdminRoutes()) {
      const routePath = toPosix(relative(ROOT, route));
      for (const controller of importedControllers(route)) {
        const controllerPath = toPosix(relative(ROOT, controller));
        if (ADMIN_CONTROLLER_EXEMPTIONS.has(controllerPath)) continue;

        expect(existsSync(controller), `${routePath} -> ${controllerPath}`).toBe(true);
        const source = readFileSync(controller, 'utf8');
        expect(source, `${routePath} -> ${controllerPath}`).toContain(
          "from '@/backend/transport/admin-handler'"
        );
        expect(source, `${routePath} -> ${controllerPath}`).toContain('withAdminUser');
      }
    }
  });

  it('keeps ADMIN_EMAILS the authority and the mirror sync wired (ADR-0003)', () => {
    const wiring = readSource('backend/config/identity.ts');
    expect(wiring).toMatch(/isAdmin\(\s*email,\s*env\.adminEmails\s*\)/);
    expect(wiring).toMatch(/syncAdminAllowlistMirror\(env\.adminEmails\)/);
  });
});
