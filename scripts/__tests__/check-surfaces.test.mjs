import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  dynamicMarker,
  matchSurfaces,
  pageRoutes,
  renderMarkdown,
  routeSources,
  stripComments,
  toRoute,
  validate,
} from '../check-surfaces.mjs';

/** A throwaway `app/` tree, so a test never depends on the real one. */
function makeRepo(files) {
  const root = mkdtempSync(join(tmpdir(), 'surfaces-'));
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

const surface = (overrides = {}) => ({
  id: 'surface',
  routes: ['/one'],
  owner: 'static',
  read: 'swr',
  write: 'none',
  shell: 'precached',
  bundle: 'remote',
  specs: [],
  ungated: 'no spec yet',
  ...overrides,
});

describe('page route derivation', () => {
  it('drops route groups, ignores route handlers, and keeps dynamic segments', () => {
    expect(toRoute('account/(app)/plan')).toBe('/account/plan');
    expect(toRoute('')).toBe('/');

    const root = makeRepo({
      'app/page.tsx': '',
      'app/(group)/inside/page.tsx': '',
      'app/community/[slug]/page.tsx': '',
      'app/api/rates/route.ts': '',
    });

    expect(pageRoutes(join(root, 'app'))).toEqual(['/', '/community/[slug]', '/inside']);
  });
});

describe('surface matching', () => {
  const surfaces = [
    surface({ id: 'admin', routes: [], prefix: '/admin' }),
    surface({ id: 'admin-news', routes: ['/admin/news'] }),
    surface({ id: 'account', routes: ['/account'] }),
  ];

  it('lets an exact route beat a prefix', () => {
    expect(matchSurfaces('/admin/news', surfaces).map((s) => s.id)).toEqual(['admin-news']);
  });

  it('lets the longest prefix win', () => {
    const deep = [...surfaces, surface({ id: 'admin-plans', routes: [], prefix: '/admin/plans' })];
    expect(matchSurfaces('/admin/plans/x', deep).map((s) => s.id)).toEqual(['admin-plans']);
  });

  it('reports a route no surface claims', () => {
    expect(matchSurfaces('/unclaimed', surfaces)).toEqual([]);
  });
});

describe('prerenderability', () => {
  it('keeps a URL inside a string while dropping comments', () => {
    const source = ['// cookies()', '/* headers() */', "const u = 'https://x/y';"].join('\n');
    expect(stripComments(source)).not.toContain('cookies()');
    expect(stripComments(source)).not.toContain('headers()');
    expect(stripComments(source)).toContain('https://x/y');
  });

  it('flags the awaited server prop', () => {
    const root = makeRepo({ 'app/feed/page.tsx': 'const q = await searchParams;' });
    expect(dynamicMarker(routeSources('/feed', join(root, 'app')))?.marker).toBe(
      'await searchParams'
    );
  });

  it('does not flag a comment or a client hook', () => {
    const root = makeRepo({
      'app/static/page.tsx': [
        '/** No `cookies()` call exists in this subtree any more. */',
        'export default function Page() { return null; }',
      ].join('\n'),
      'app/client/page.tsx': [
        "'use client';",
        "import { useSearchParams } from 'next/navigation';",
        'const params = useSearchParams();',
      ].join('\n'),
    });
    expect(dynamicMarker(routeSources('/static', join(root, 'app')))).toBeNull();
    expect(dynamicMarker(routeSources('/client', join(root, 'app')))).toBeNull();
  });

  it('reads a layout above the page, because it decides the mode too', () => {
    const root = makeRepo({
      'app/section/layout.tsx': 'const jar = cookies();',
      'app/section/page.tsx': 'export default function Page() { return null; }',
    });
    expect(dynamicMarker(routeSources('/section', join(root, 'app')))?.marker).toBe('cookies()');
  });
});

describe('matrix validation', () => {
  it('rejects a route with no surface, a claim that cannot be precached, and a missing spec', () => {
    const root = makeRepo({
      'app/one/page.tsx': 'export default function Page() { return null; }',
      'app/feed/page.tsx': 'const q = await searchParams;',
    });

    const errors = validate({
      matrix: {
        defaultUngated: 'later',
        surfaces: [
          surface({ id: 'one', routes: ['/one'], specs: ['e2e/missing.spec.ts'] }),
          surface({ id: 'feed', routes: ['/feed'], shell: 'precached' }),
        ],
      },
      repoRoot: root,
      routes: ['/one', '/feed', '/unclaimed'],
    });

    expect(errors.some((error) => error.includes('/unclaimed'))).toBe(true);
    expect(errors.some((error) => error.includes('await searchParams'))).toBe(true);
    expect(errors.some((error) => error.includes('e2e/missing.spec.ts'))).toBe(true);
  });

  it('refuses a bundle for a surface with no cacheable document', () => {
    const root = makeRepo({
      'app/admin/page.tsx': 'export default function Page() { return null; }',
    });
    const errors = validate({
      matrix: { surfaces: [surface({ routes: ['/admin'], shell: 'none', bundle: 'bundled' })] },
      repoRoot: root,
      routes: ['/admin'],
    });
    expect(errors.some((error) => error.includes('no cacheable document'))).toBe(true);
  });

  it('demands a paint budget or an ungated reason', () => {
    const root = makeRepo({ 'app/one/page.tsx': '' });
    const errors = validate({
      matrix: { surfaces: [surface({ ungated: undefined })] },
      repoRoot: root,
      routes: ['/one'],
    });
    expect(errors.some((error) => error.includes('paint budget'))).toBe(true);
  });
});

describe('rendered table', () => {
  it('is stable, marked generated, and shows ungated rows as such', () => {
    const matrix = {
      defaultUngated: 'later',
      surfaces: [surface({ id: 'one', specs: [] }), surface({ id: 'two', routes: ['/two'] })],
    };
    const markdown = renderMarkdown(matrix);
    expect(markdown).toContain('Generated by scripts/check-surfaces.mjs');
    expect(markdown).toContain('| `one` | `/one` |');
    expect(markdown).toContain('_ungated_');
    expect(renderMarkdown(matrix)).toBe(markdown);
  });
});
