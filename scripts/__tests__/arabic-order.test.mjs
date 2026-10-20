import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { isNfc, nonNfcLines } from '../../eslint-rules/no-non-nfc.mjs';
import {
  fix,
  fixBanned,
  isExcluded,
  isSpellingAllowed,
  scan,
  scanBanned,
} from '../check-arabic-order.mjs';

// Built from escapes on purpose: written as literal Arabic, the reverse-order
// fixtures would themselves be rewritten by the pass under test.
const CANONICAL = '\u0627\u0644\u0631\u064E\u0651\u0627\u0628\u0637'; // fatha, then shadda
const REVERSE = '\u0627\u0644\u0631\u0651\u064E\u0627\u0628\u0637'; // shadda, then fatha

// The banned tanween spelling and the preferred final-ya spelling, likewise
// escaped so this file passes the check it tests.
const BANNED_SPELLING = '\u062C\u0627\u0631\u064D';
const PREFERRED_SPELLING = '\u062C\u0627\u0631\u064A';

const tempDirs = [];

/** A throwaway tree holding `files` as `{ path: contents }`. Returns its root. */
function tree(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'arabic-'));
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

describe('isNfc', () => {
  it('rejects the reverse mark order and accepts the canonical one', () => {
    expect(CANONICAL).not.toBe(REVERSE);
    expect(isNfc(CANONICAL)).toBe(true);
    expect(isNfc(REVERSE)).toBe(false);
  });

  it('is true for text with no combining marks', () => {
    expect(isNfc('plain ascii')).toBe(true);
    expect(isNfc('\u0645\u0631\u062D\u0628\u0627')).toBe(true);
  });
});

describe('nonNfcLines', () => {
  it('reports 1-based line numbers, and only for the offending lines', () => {
    const text = ['first', REVERSE, 'third', `mixed ${CANONICAL} and ${REVERSE}`, CANONICAL].join(
      '\n'
    );
    expect(nonNfcLines(text)).toEqual([2, 4]);
  });

  it('is empty for NFC text and for empty text', () => {
    expect(nonNfcLines(`${CANONICAL}\nplain\n`)).toEqual([]);
    expect(nonNfcLines('')).toEqual([]);
  });
});

describe('isExcluded', () => {
  it('skips only the vendored Quran tree', () => {
    expect(isExcluded('public/quran/surah/002.json')).toBe(true);
    expect(isExcluded('public/quran/audio/ar.alafasy/003.json')).toBe(true);
    expect(isExcluded('public/favicon.ico')).toBe(false);
    expect(isExcluded('app/privacy/page.tsx')).toBe(false);
  });
});

describe('scan', () => {
  it('reports the offending files with their line numbers', () => {
    const dir = tree({
      'app/page.tsx': `<h1>${REVERSE}</h1>\n`,
      'docs/notes.md': `ok\n${REVERSE}\n`,
      'data/clean.ts': `${CANONICAL}\n`,
    });

    expect(scan(['app/page.tsx', 'docs/notes.md', 'data/clean.ts'], dir)).toEqual([
      { file: 'app/page.tsx', lines: [1] },
      { file: 'docs/notes.md', lines: [2] },
    ]);
  });

  it('leaves the vendored Quran text and non-text files alone', () => {
    const dir = tree({
      'public/quran/surah/002.json': `${REVERSE}\n`,
      'public/logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]),
    });

    expect(scan(['public/quran/surah/002.json', 'public/logo.png'], dir)).toEqual([]);
  });

  it('ignores a listed file that is no longer on disk', () => {
    const dir = tree({});
    expect(scan(['gone.ts'], dir)).toEqual([]);
  });
});

describe('isSpellingAllowed', () => {
  it('allowlists only the files that must name both spellings', () => {
    expect(isSpellingAllowed('AGENTS.md')).toBe(true);
    expect(isSpellingAllowed('CHANGELOG.md')).toBe(true);
    expect(isSpellingAllowed('docs/conventions.md')).toBe(true);
    expect(isSpellingAllowed('docs/adr/0054-the-shells-dialogs-look-like-the-product.md')).toBe(
      true
    );
    expect(isSpellingAllowed('app/page.tsx')).toBe(false);
  });
});

describe('scanBanned', () => {
  it('reports the offending files with their line numbers', () => {
    const dir = tree({
      'app/page.tsx': `<h1>${BANNED_SPELLING} التحميل</h1>\n<p>${PREFERRED_SPELLING}</p>\n`,
      'docs/notes.md': `ok\n${BANNED_SPELLING}\n`,
      'data/clean.ts': `${PREFERRED_SPELLING}\n`,
    });

    expect(scanBanned(['app/page.tsx', 'docs/notes.md', 'data/clean.ts'], dir)).toEqual([
      { file: 'app/page.tsx', lines: [1] },
      { file: 'docs/notes.md', lines: [2] },
    ]);
  });

  it('leaves the allowlisted files and the vendored Quran text alone', () => {
    const dir = tree({
      'CHANGELOG.md': `${BANNED_SPELLING}\n`,
      'docs/conventions.md': `${BANNED_SPELLING}\n`,
      'public/quran/surah/002.json': `${BANNED_SPELLING}\n`,
    });

    expect(
      scanBanned(['CHANGELOG.md', 'docs/conventions.md', 'public/quran/surah/002.json'], dir)
    ).toEqual([]);
  });
});

describe('fixBanned', () => {
  it('rewrites the offending files and reports which ones it changed', () => {
    const dir = tree({
      'app/page.tsx': `${BANNED_SPELLING}\n`,
      'data/clean.ts': `${PREFERRED_SPELLING}\n`,
    });

    expect(fixBanned(['app/page.tsx', 'data/clean.ts'], dir)).toEqual(['app/page.tsx']);
    expect(readFileSync(join(dir, 'app/page.tsx'), 'utf8')).toBe(`${PREFERRED_SPELLING}\n`);
  });

  it('never touches an allowlisted file', () => {
    const dir = tree({ 'CHANGELOG.md': `${BANNED_SPELLING}\n` });

    expect(fixBanned(['CHANGELOG.md'], dir)).toEqual([]);
    expect(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8')).toBe(`${BANNED_SPELLING}\n`);
  });
});

describe('fix', () => {
  it('rewrites the offending files and reports which ones it changed', () => {
    const dir = tree({
      'app/page.tsx': `<h1>${REVERSE}</h1>\n`,
      'data/clean.ts': `${CANONICAL}\n`,
    });

    expect(fix(['app/page.tsx', 'data/clean.ts'], dir)).toEqual(['app/page.tsx']);
    expect(readFileSync(join(dir, 'app/page.tsx'), 'utf8')).toBe(`<h1>${CANONICAL}</h1>\n`);
  });

  it('preserves line endings and everything that is not a mark order', () => {
    const dir = tree({ 'notes.md': `# title\r\n${REVERSE} end\r\n` });

    fix(['notes.md'], dir);

    const written = readFileSync(join(dir, 'notes.md'), 'utf8');
    expect(written).toBe(`# title\r\n${CANONICAL} end\r\n`);
    expect(written).toContain('\r\n');
  });

  it('is idempotent, so a second pass changes nothing', () => {
    const dir = tree({ 'app/page.tsx': `${REVERSE}\n` });

    expect(fix(['app/page.tsx'], dir)).toEqual(['app/page.tsx']);
    expect(fix(['app/page.tsx'], dir)).toEqual([]);
    expect(scan(['app/page.tsx'], dir)).toEqual([]);
  });

  it('never touches an excluded file', () => {
    const dir = tree({ 'public/quran/surah/002.json': `${REVERSE}\n` });

    expect(fix(['public/quran/surah/002.json'], dir)).toEqual([]);
    expect(readFileSync(join(dir, 'public/quran/surah/002.json'), 'utf8')).toBe(`${REVERSE}\n`);
  });
});
