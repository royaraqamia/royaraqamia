import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
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

/**
 * Controllers that guard an Admin surface and must reach the Admin adapter.
 *
 * The allowlist-mirror controller (`admin-allowlist.ts`) is deliberately absent:
 * it authenticates with the service-role bearer token, and the mirror mechanism
 * is frozen by ADR-0003.
 */
const ADMIN_CONTROLLERS = [
  'backend/controllers/consultation.ts',
  'backend/controllers/training.ts',
  'backend/controllers/certificates.ts',
  'backend/controllers/broadcast.ts',
  'backend/controllers/admin-users.ts',
  'backend/controllers/notifications.ts',
];

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

  it('routes the known Admin controllers through the adapter', () => {
    for (const controller of ADMIN_CONTROLLERS) {
      expect(readSource(controller), controller).toContain(
        "from '@/backend/transport/admin-handler'"
      );
      expect(readSource(controller), controller).toContain('withAdminUser');
    }
  });

  it('keeps ADMIN_EMAILS the authority and the mirror sync wired (ADR-0003)', () => {
    const wiring = readSource('backend/config/identity.ts');
    expect(wiring).toMatch(/isAdmin\(\s*email,\s*env\.adminEmails\s*\)/);
    expect(wiring).toMatch(/syncAdminAllowlistMirror\(env\.adminEmails\)/);
  });
});
