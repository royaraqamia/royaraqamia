import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { digitLines, fix, isExcluded, scan, toAsciiDigits } from '../check-digits.mjs';

// Built from escapes on purpose: written as literals, the fixtures would be
// rewritten by the pass under test.
const ARABIC = '\u0661\u0662\u0663'; // ١٢٣
const PERSIAN = '\u06f1\u06f2\u06f3'; // ۱۲۳

const tempDirs = [];

/** A throwaway tree holding `files` as `{ path: contents }`. Returns its root. */
function tree(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'digits-'));
  tempDirs.push(dir);
  for (const [name, contents] of Object.entries(files)) {
    const file = join(dir, name);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, contents);
  }
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('toAsciiDigits', () => {
  it('rewrites Arabic-Indic and Persian digits', () => {
    expect(toAsciiDigits(ARABIC)).toBe('123');
    expect(toAsciiDigits(PERSIAN)).toBe('123');
    expect(toAsciiDigits(`صفحة ${ARABIC} من ${PERSIAN}`)).toBe('صفحة 123 من 123');
  });

  it('leaves ASCII digits and Arabic letters alone', () => {
    expect(toAsciiDigits('123 صفحة')).toBe('123 صفحة');
  });
});

describe('digitLines', () => {
  it('reports 1-based line numbers, and only for the offending lines', () => {
    const text = ['first', ARABIC, 'third', `mixed ${ARABIC} and ${PERSIAN}`, '123'].join('\n');
    expect(digitLines(text).map(({ line }) => line)).toEqual([2, 4]);
  });

  it('is empty for ASCII text and for empty text', () => {
    expect(digitLines('123\nplain\n')).toEqual([]);
    expect(digitLines('')).toEqual([]);
  });
});

describe('isExcluded', () => {
  it('skips vendored, historical and fixture files only', () => {
    expect(isExcluded('.agents/skills/x/data.csv')).toBe(true);
    expect(isExcluded('public/quran/surah/002.json')).toBe(true);
    expect(isExcluded('supabase/migrations/20260101000000_x.sql')).toBe(true);
    expect(isExcluded('CHANGELOG.md')).toBe(true);
    expect(isExcluded('android/gradle.properties')).toBe(true);
    expect(isExcluded('docs/conventions.md')).toBe(true);
    expect(isExcluded('app/privacy/page.tsx')).toBe(false);
    expect(isExcluded('docs/architecture.md')).toBe(false);
  });
});

describe('scan', () => {
  it('reports the offending files with their line numbers', () => {
    const dir = tree({
      'app/page.tsx': `<h1>${ARABIC}</h1>\n`,
      'docs/notes.md': `ok\n${PERSIAN}\n`,
      'data/clean.ts': '123\n',
    });

    expect(scan(['app/page.tsx', 'docs/notes.md', 'data/clean.ts'], dir)).toEqual([
      { file: 'app/page.tsx', lines: [{ line: 1, text: `<h1>${ARABIC}</h1>` }] },
      { file: 'docs/notes.md', lines: [{ line: 2, text: PERSIAN }] },
    ]);
  });

  it('leaves excluded and non-text files alone', () => {
    const dir = tree({
      'public/quran/surah/002.json': `${ARABIC}\n`,
      'public/logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]),
    });

    expect(scan(['public/quran/surah/002.json', 'public/logo.png'], dir)).toEqual([]);
  });

  it('ignores a listed file that is no longer on disk', () => {
    const dir = tree({});
    expect(scan(['gone.ts'], dir)).toEqual([]);
  });
});

describe('fix', () => {
  it('rewrites the offending files and reports which ones it changed', () => {
    const dir = tree({
      'app/page.tsx': `<h1>${ARABIC}</h1>\n`,
      'data/clean.ts': '123\n',
    });

    expect(fix(['app/page.tsx', 'data/clean.ts'], dir)).toEqual(['app/page.tsx']);
    expect(readFileSync(join(dir, 'app/page.tsx'), 'utf8')).toBe('<h1>123</h1>\n');
  });

  it('preserves line endings and everything that is not a digit', () => {
    const dir = tree({ 'notes.md': `# title\r\n${PERSIAN} end\r\n` });

    fix(['notes.md'], dir);

    const written = readFileSync(join(dir, 'notes.md'), 'utf8');
    expect(written).toBe('# title\r\n123 end\r\n');
    expect(written).toContain('\r\n');
  });

  it('is idempotent, so a second pass changes nothing', () => {
    const dir = tree({ 'app/page.tsx': `${ARABIC}\n` });

    expect(fix(['app/page.tsx'], dir)).toEqual(['app/page.tsx']);
    expect(fix(['app/page.tsx'], dir)).toEqual([]);
    expect(scan(['app/page.tsx'], dir)).toEqual([]);
  });

  it('never touches an excluded file', () => {
    const dir = tree({ 'public/quran/surah/002.json': `${ARABIC}\n` });

    expect(fix(['public/quran/surah/002.json'], dir)).toEqual([]);
    expect(readFileSync(join(dir, 'public/quran/surah/002.json'), 'utf8')).toBe(`${ARABIC}\n`);
  });
});
