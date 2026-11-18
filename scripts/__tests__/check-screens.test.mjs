import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  nativeScreens,
  productOf,
  registrations,
  renderMarkdown,
  renderRoutes,
  renderKotlinRoutes,
  scopeIds,
  silentSurfaces,
  splitRoute,
  uncovered,
  validate,
} from '../check-screens.mjs';

const NATIVE = 'android/app/src/main/kotlin/com/royaraqamia/app';

/** A throwaway tree, so a test never depends on the real app. */
function makeRepo(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'screens-'));
  mkdirSync(join(root, NATIVE, 'ui'), { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return { root, nativeRoot: join(root, NATIVE) };
}

const matrix = {
  schemaVersion: 1,
  surfaces: [
    { id: 'home', routes: ['/'] },
    { id: 'notes', routes: ['/notes'] },
  ],
};

const inventory = (...screens) => ({ schemaVersion: 1, screens });

const check = (repo, screens) =>
  validate({
    inventory: inventory(...screens),
    matrix,
    repoRoot: repo.root,
    nativeRoot: repo.nativeRoot,
  });

describe('the native screen convention', () => {
  it('finds every *Screen.kt, nested or not, and ignores everything else', () => {
    const { nativeRoot } = makeRepo({
      [`${NATIVE}/ui/HomeScreen.kt`]: '',
      [`${NATIVE}/notes/NotesScreen.kt`]: '',
      [`${NATIVE}/notes/NotesScreenModel.kt`]: '',
      [`${NATIVE}/notes/Notes.kt`]: '',
    });

    expect(
      nativeScreens(nativeRoot)
        .map((path) => path.split(/[\\/]/).pop())
        .sort()
    ).toEqual(['HomeScreen.kt', 'NotesScreen.kt']);
  });
});

describe('the screen inventory', () => {
  it('accepts a surface the app draws and a surface it explains away', () => {
    const repo = makeRepo({ [`${NATIVE}/ui/HomeScreen.kt`]: '' });

    expect(
      check(repo, [
        { surface: 'home', native: `${NATIVE}/ui/HomeScreen.kt` },
        { surface: 'notes', reason: 'the notes surface is web only' },
      ])
    ).toEqual([]);
  });

  it('refuses a surface with no row at all', () => {
    const repo = makeRepo();

    expect(check(repo, [{ surface: 'home', reason: 'web only' }])).toEqual([
      'surfaces with no row (decide which client draws them, in docs/mobile/screens.json): notes',
    ]);
  });

  it('refuses a row for a surface that does not exist', () => {
    const repo = makeRepo();

    expect(
      check(repo, [
        { surface: 'home', reason: 'web only' },
        { surface: 'notes', reason: 'web only' },
        { surface: 'gone', reason: 'a surface that was renamed' },
      ])
    ).toEqual(['row "gone" names a surface perf/surfaces.json does not have']);
  });

  it('refuses a native claim with no Kotlin file behind it', () => {
    const repo = makeRepo();

    expect(
      check(repo, [
        { surface: 'home', native: `${NATIVE}/ui/HomeScreen.kt` },
        { surface: 'notes', reason: 'web only' },
      ])
    ).toEqual([`row "home" claims ${NATIVE}/ui/HomeScreen.kt, which does not exist`]);
  });

  it('accepts a port that exists and is switched off', () => {
    const repo = makeRepo({ [`${NATIVE}/ui/HomeScreen.kt`]: '' });

    expect(
      check(repo, [
        {
          surface: 'home',
          native: `${NATIVE}/ui/HomeScreen.kt`,
          enabled: false,
          reason: 'ported, and off until it matches the page',
        },
        { surface: 'notes', reason: 'the notes surface is web only' },
      ])
    ).toEqual([]);
  });

  it('refuses a switched-off row with no reason', () => {
    const repo = makeRepo({ [`${NATIVE}/ui/HomeScreen.kt`]: '' });

    expect(
      check(repo, [
        { surface: 'home', native: `${NATIVE}/ui/HomeScreen.kt`, enabled: false },
        { surface: 'notes', reason: 'web only' },
      ])
    ).toEqual([
      'row "home" is disabled, so it needs a "reason" (why the port is off)',
      // A row that is not a claim: the screen behind it is still unlisted.
      `native screens with no row: ${NATIVE}/ui/HomeScreen.kt`,
    ]);
  });

  it('refuses a switched-off row with no screen behind it', () => {
    const repo = makeRepo();

    expect(
      check(repo, [
        { surface: 'home', enabled: false, reason: 'off for no reason at all' },
        { surface: 'notes', reason: 'web only' },
      ])
    ).toEqual(['row "home" is disabled ("enabled": false) but names no Kotlin screen']);
  });

  it('refuses a Kotlin screen with no row', () => {
    const repo = makeRepo({ [`${NATIVE}/notes/NotesScreen.kt`]: '' });

    expect(
      check(repo, [
        { surface: 'home', reason: 'web only' },
        { surface: 'notes', reason: 'web only' },
      ])
    ).toEqual([`native screens with no row: ${NATIVE}/notes/NotesScreen.kt`]);
  });

  it('refuses a row that both draws and explains away, or does neither', () => {
    const repo = makeRepo({ [`${NATIVE}/ui/HomeScreen.kt`]: '' });

    expect(
      check(repo, [
        { surface: 'home', native: `${NATIVE}/ui/HomeScreen.kt`, reason: 'web only' },
        { surface: 'notes' },
      ])
    ).toEqual([
      'row "home" needs exactly one of "native" (a Kotlin screen) and "reason" (why there is none)',
      'row "notes" needs exactly one of "native" (a Kotlin screen) and "reason" (why there is none)',
      // A row that names both is not a claim: the screen behind it is still unlisted.
      `native screens with no row: ${NATIVE}/ui/HomeScreen.kt`,
    ]);
  });

  it('refuses the same Kotlin screen claimed twice', () => {
    const repo = makeRepo({ [`${NATIVE}/ui/HomeScreen.kt`]: '' });

    expect(
      check(repo, [
        { surface: 'home', native: `${NATIVE}/ui/HomeScreen.kt` },
        { surface: 'notes', native: `${NATIVE}/ui/HomeScreen.kt` },
      ])
    ).toEqual([`${NATIVE}/ui/HomeScreen.kt is claimed by "home" and "notes"`]);
  });
});

describe('the generated route table', () => {
  const routed = {
    schemaVersion: 1,
    surfaces: [
      { id: 'home', routes: ['/'] },
      { id: 'notes', routes: ['/?tab=/notes', '/notes'] },
      { id: 'account-links', routes: ['/account/links'] },
      { id: 'admin', prefix: '/admin' },
    ],
  };

  it('splits a tab route into the path it shares and the tab it reads', () => {
    expect(splitRoute('/?tab=/notes')).toEqual({ pattern: '/', tab: '/notes' });
    expect(splitRoute('/notes')).toEqual({ pattern: '/notes', tab: null });
  });

  it('names the product by the surface id’s own first segment', () => {
    expect(productOf('account-links')).toBe('account');
    expect(productOf('notes')).toBe('notes');
  });

  it('puts the tab routes first, so `/` alone is still the home screen', () => {
    const routes = renderRoutes(routed);
    const tab = routes.indexOf("surface: 'notes', product: 'notes', tab: '/notes'");
    const home = routes.indexOf("pattern: '/', surface: 'home'");

    expect(tab).toBeGreaterThan(-1);
    expect(home).toBeGreaterThan(tab);
  });

  it('writes a prefix subtree as its own row, with the matrix’s own ids', () => {
    expect(renderRoutes(routed)).toContain(
      "{ prefix: '/admin', surface: 'admin', product: 'admin' },"
    );
  });

  it('keeps a long row on one line only when it fits, the way Prettier lays it out', () => {
    const routes = renderRoutes(routed);

    expect(routes).toContain(
      "  { pattern: '/notes', surface: 'notes', product: 'notes', tab: null },"
    );
    expect(routes).toContain(
      "  { pattern: '/account/links', surface: 'account-links', product: 'account', tab: null },"
    );
  });
});

describe('the app’s copy of the route table', () => {
  const routed = {
    schemaVersion: 1,
    surfaces: [
      { id: 'home', routes: ['/'] },
      { id: 'notes', routes: ['/?tab=/notes', '/notes'] },
      { id: 'account-links', routes: ['/account/links'] },
      { id: 'admin', prefix: '/admin' },
    ],
  };

  it('is Kotlin in the shell’s own package, generated from the same matrix', () => {
    const file = renderKotlinRoutes(routed);

    expect(file).toContain('package com.royaraqamia.app.shell');
    expect(file).toContain('// Generated by scripts/check-screens.mjs');
    expect(file).toContain('data class ScreenRouteRow(');
  });

  it('keeps the site’s order, so `/` alone is still the home screen', () => {
    const file = renderKotlinRoutes(routed);
    const tab = file.indexOf('ScreenRouteRow("/", "notes", "notes", "/notes")');
    const home = file.indexOf('ScreenRouteRow("/", "home", "home", null)');

    expect(tab).toBeGreaterThan(-1);
    expect(home).toBeGreaterThan(tab);
  });

  it('writes the matrix’s own ids, with a prefix subtree as its own row', () => {
    const file = renderKotlinRoutes(routed);

    expect(file).toContain('ScreenRouteRow("/account/links", "account-links", "account", null),');
    expect(file).toContain('ScreenPrefixRow("/admin", "admin", "admin"),');
  });

  it('resolves a prefix at a segment boundary, not inside a word', () => {
    // The guard the site has and a hand-ported resolver forgets: `/administer`
    // is not the admin subtree, and a screen id read from it is a wrong screen.
    expect(renderKotlinRoutes(routed)).toContain(
      'path == row.prefix || path.startsWith("${row.prefix}/")'
    );
  });
});

describe('the registrations the assistant reads', () => {
  const register = (id) => `useScreenScope({ id: '${id}', kind: 'screen' });`;
  const checkRegistered = (repo, screens, registered) =>
    validate({
      inventory: inventory(...screens),
      matrix,
      repoRoot: repo.root,
      nativeRoot: repo.nativeRoot,
      registered,
    });
  const twoRows = [
    { surface: 'home', reason: 'web only' },
    { surface: 'notes', reason: 'web only' },
  ];

  it('reads the literal id of a registration and ignores the hook’s own declaration', () => {
    expect(scopeIds('export function useScreenScope(scope) { return scope; }')).toEqual([]);
    expect(scopeIds(register('news.page'))).toEqual(['news.page']);
    expect(scopeIds("useScreenScope({ id: name, kind: 'screen' });")).toEqual([]);
  });

  it('finds registrations in the site’s source and skips its tests', () => {
    const repo = makeRepo({
      'frontend/ui/news/NewsBoard.tsx': register('news.page'),
      'frontend/ui/news/news-screen-scope.ts': [
        'export function newsScreenScope(view) {',
        "  return { id: 'news.page', kind: 'screen', tab: view };",
        '}',
      ].join('\n'),
      'frontend/ui/news/__tests__/NewsBoard.test.tsx': register('made.up'),
      'frontend/ui/news/news-copy.ts': 'export const title = "أخبار";',
    });

    expect(registrations(repo.root)).toEqual([
      { id: 'news.page', path: 'frontend/ui/news/NewsBoard.tsx' },
      { id: 'news.page', path: 'frontend/ui/news/news-screen-scope.ts' },
    ]);
  });

  it('accepts a registration that names a surface in the registry', () => {
    const repo = makeRepo();

    expect(
      checkRegistered(repo, twoRows, [{ id: 'notes.editor', path: 'frontend/ui/notes/x.tsx' }])
    ).toEqual([]);
  });

  it('refuses a registration that names no surface or no name', () => {
    const repo = makeRepo();

    expect(
      checkRegistered(repo, twoRows, [{ id: 'notes', path: 'frontend/ui/notes/x.tsx' }])
    ).toEqual([
      'registration "notes" in frontend/ui/notes/x.tsx must name a screen as "<surface>.<name>"',
    ]);
  });

  it('refuses a registration for a surface the registry does not have', () => {
    const repo = makeRepo();

    expect(
      checkRegistered(repo, twoRows, [{ id: 'gone.page', path: 'frontend/ui/x.tsx' }])
    ).toEqual([
      'registration "gone.page" in frontend/ui/x.tsx names surface "gone" that docs/mobile/screens.json does not have',
    ]);
  });

  it('refuses the same id registered in two places', () => {
    const repo = makeRepo();

    expect(
      checkRegistered(repo, twoRows, [
        { id: 'notes.page', path: 'frontend/ui/a.tsx' },
        { id: 'notes.page', path: 'frontend/ui/b.tsx' },
      ])
    ).toEqual(['registration "notes.page" appears in frontend/ui/a.tsx and frontend/ui/b.tsx']);
  });
});

describe('the silence list', () => {
  it('reads the keys of the list, quoted or not, and never a comment', () => {
    const repo = makeRepo({
      'shared/contracts/screen-context-silence.ts': [
        'export const SCREEN_CONTEXT_SILENT_SURFACES = {',
        "  admin: 'an operator screen publishes nothing',",
        "  'mcp-apps': 'the catalogue is public',",
        '};',
        '// notes: a comment is not a row',
      ].join('\n'),
    });

    expect(silentSurfaces(repo.root)).toEqual(['admin', 'mcp-apps']);
  });

  it('reports nothing when the list is not there at all', () => {
    expect(silentSurfaces(makeRepo().root)).toEqual([]);
  });
});

describe('every surface is registered or silent', () => {
  const rows = [{ surface: 'home' }, { surface: 'notes' }];

  it('accepts one surface that registers and one that is written down as silent', () => {
    expect(uncovered(rows, [{ id: 'home.page' }], ['notes'])).toEqual([]);
  });

  it('names a surface that does neither', () => {
    expect(uncovered(rows, [{ id: 'home.page' }], [])).toEqual([
      'surface "notes" registers nothing and is not listed in shared/contracts/screen-context-silence.ts',
    ]);
  });

  it('refuses a silent row a registration has already reversed', () => {
    expect(uncovered(rows, [{ id: 'home.page' }], ['home', 'notes'])).toEqual([
      'surface "home" is listed as silent but a registration names it - keep one of the two',
    ]);
  });
});

describe('the rendered table', () => {
  it('shows the routes from the matrix, the Kotlin screen, and the reason', () => {
    const rendered = renderMarkdown(
      inventory(
        { surface: 'home', native: `${NATIVE}/ui/HomeScreen.kt` },
        { surface: 'notes', reason: 'the notes surface is web only', issue: '#123' }
      ),
      matrix
    );

    expect(rendered).toContain('| `home` | `/` | `HomeScreen.kt` |');
    expect(rendered).toContain(
      '| `notes` | `/notes` | _web only_ | the notes surface is web only #123 |'
    );
  });

  it('marks a port that is switched off, so the table does not claim it is drawn', () => {
    const rendered = renderMarkdown(
      inventory({
        surface: 'home',
        native: `${NATIVE}/ui/HomeScreen.kt`,
        enabled: false,
        reason: 'off until it matches the page',
      }),
      matrix
    );

    expect(rendered).toContain(
      '| `home` | `/` | `HomeScreen.kt` (off) | off until it matches the page |'
    );
  });
});
