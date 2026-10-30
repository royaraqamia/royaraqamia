import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { nativeScreens, renderMarkdown, validate } from '../check-screens.mjs';

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
});
