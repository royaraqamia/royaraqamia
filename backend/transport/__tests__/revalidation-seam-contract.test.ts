import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Issue #102: invalidation used to be a second call each route had to remember.
 * It now lives inside `toNextResponse`, so these checks fail loudly if the
 * standalone helper returns or a route goes back to building its own response.
 */

const ROOT = process.cwd();

/** Routes that used to call the standalone helper and now must rely on the seam. */
const REVALIDATING_ROUTES = [
  'app/api/blogpress/media/route.ts',
  'app/api/blogpress/posts/[id]/featured/route.ts',
  'app/api/blogpress/posts/[id]/publish/route.ts',
  'app/api/blogpress/posts/[id]/route.ts',
  'app/api/blogpress/posts/[id]/save-and-publish/route.ts',
  'app/api/blogpress/posts/[id]/schedule/route.ts',
  'app/api/blogpress/posts/[id]/tags/route.ts',
  'app/api/blogpress/posts/[id]/unpublish/route.ts',
  'app/api/blogpress/posts/bulk/route.ts',
  'app/api/blogpress/posts/restore/route.ts',
  'app/api/blogpress/posts/route.ts',
  'app/api/blogpress/tags/route.ts',
  'app/api/consultation/admin/packages/[id]/route.ts',
  'app/api/consultation/admin/packages/route.ts',
  'app/api/consultation/admin/settings/route.ts',
  'app/spendtrack/api/budget/route.ts',
  'app/spendtrack/api/categories/[id]/route.ts',
  'app/spendtrack/api/categories/route.ts',
  'app/spendtrack/api/expenses/[id]/route.ts',
  'app/spendtrack/api/expenses/route.ts',
  'app/spendtrack/api/import/route.ts',
  'app/spendtrack/api/recurring/[id]/route.ts',
  'app/spendtrack/api/recurring/route.ts',
  'app/spendtrack/api/settings/currency/route.ts',
];

const DIRECT_RESPONSE = /NextResponse\.(json|redirect|next|rewrite)|new NextResponse/;

const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

describe('revalidation seam contract', () => {
  it('keeps the standalone invalidation helper deleted', () => {
    expect(existsSync(resolve(ROOT, 'backend/transport/revalidate.ts'))).toBe(false);
  });

  it('leaves no production reference to the standalone helper', () => {
    for (const route of REVALIDATING_ROUTES) {
      expect(read(route), route).not.toMatch(/revalidateResultPaths|transport\/revalidate/);
    }
  });

  it('routes every formerly-invalidating route through the response helper', () => {
    for (const route of REVALIDATING_ROUTES) {
      const source = read(route);
      expect(source, route).toContain("from '@/backend/transport/http-result'");
      expect(source, route).toContain('toNextResponse(');
      expect(source, route).not.toMatch(DIRECT_RESPONSE);
    }
  });
});
