#!/usr/bin/env node
/**
 * Requires digits in the repo's text to use the ASCII shape `0-9`, and folds
 * them into that shape with `--fix`.
 *
 * The product never shows Arabic-Indic numerals (U+0660-U+0669) or the
 * Persian variants (U+06F0-U+06F9): screens, stored content and source
 * literals all use `123`. `toLatinDigits` in `shared/contracts/text.ts` handles
 * runtime input, and this is the repo-wide gate for everything written by hand.
 *
 * The allowlist is deliberately narrow:
 *
 *   - `frontend/ui/shared/__tests__/phone-utils.test.ts` and
 *     `country-phone-input.test.tsx` feed Arabic-Indic digits in on purpose;
 *   - `frontend/ui/__tests__/quran-pages.test.tsx` types them into the page
 *     jump to prove the control reads them;
 *   - `shared/contracts/__tests__/text.test.ts` and this script's own test use
 *     them as fixtures;
 *   - the app's `SpendtrackExpenseDialog.kt` folds them to ASCII before parsing
 *     an amount, and `SpendtrackMoneyTest.kt` feeds them in to prove it, which is
 *     the Android half of that same normalisation;
 *   - `docs/conventions.md` (it shows the forbidden shape as an example) and
 *     `supabase/migrations/` are history and must not be rewritten (the
 *     digit-normalising migration carries the literals);
 *   - `android/gradle.properties` quotes an external Gradle error verbatim;
 *   - `.agents/` and `public/quran/` are vendored as published.
 *
 * Usage: `npm run check:digits`, or `npm run fix:digits` to rewrite.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ARABIC_INDIC = /[\u0660-\u0669]/g;
const EXTENDED_ARABIC_INDIC = /[\u06f0-\u06f9]/g;
const ANY_DIGIT = /[\u0660-\u0669\u06f0-\u06f9]/;

export const EXCLUDED = [
  '.agents/',
  'public/quran/',
  'supabase/migrations/',
  'android/gradle.properties',
  'docs/conventions.md',
  'frontend/ui/shared/__tests__/phone-utils.test.ts',
  'frontend/ui/shared/__tests__/country-phone-input.test.tsx',
  'frontend/ui/__tests__/quran-pages.test.tsx',
  'shared/contracts/__tests__/text.test.ts',
  'scripts/__tests__/digits.test.mjs',
  // The Android half of `toLatinDigits`: the dialog folds Arabic-Indic digits
  // before parsing an amount, and its test feeds them in to prove it (#653).
  'android/app/src/main/kotlin/com/royaraqamia/app/spendtrack/SpendtrackExpenseDialog.kt',
  'android/app/src/test/kotlin/com/royaraqamia/app/spendtrack/SpendtrackMoneyTest.kt',
];

export const isExcluded = (file) =>
  EXCLUDED.some((prefix) => file === prefix || file.startsWith(prefix));

/** The ASCII spelling of every Arabic-Indic digit in `value`. */
export function toAsciiDigits(value) {
  return value
    .replace(ARABIC_INDIC, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(EXTENDED_ARABIC_INDIC, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

/**
 * Every file the repo would ship: tracked, plus untracked that git does not
 * ignore, so a new file is checked before its first commit as well as after.
 */
export function listedFiles(cwd = process.cwd()) {
  const listed = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
  );
  return listed.split('\0').filter(Boolean);
}

/** The file's text, or null when it is not text (a NUL byte) or is unreadable. */
function readText(file, cwd) {
  let bytes;
  try {
    bytes = readFileSync(resolve(cwd, file));
  } catch {
    return null;
  }
  return bytes.includes(0) ? null : bytes.toString('utf8');
}

/** `{ line, text }` for every line that contains a non-ASCII digit. */
export function digitLines(text) {
  return text
    .split('\n')
    .map((line, index) => ({ line: index + 1, text: line }))
    .filter(({ text: line }) => ANY_DIGIT.test(line));
}

/** `{ file, lines }` for every text file in `files` that contains a match. */
export function scan(files, cwd = process.cwd()) {
  const offenders = [];
  for (const file of files) {
    if (isExcluded(file)) continue;
    const text = readText(file, cwd);
    if (text === null) continue;
    const lines = digitLines(text);
    if (lines.length > 0) offenders.push({ file, lines });
  }
  return offenders;
}

/**
 * Rewrites every match in `files`, and returns the files it changed. Only the
 * digit codepoints change; every other byte is preserved.
 */
export function fix(files, cwd = process.cwd()) {
  const changed = [];
  for (const file of files) {
    if (isExcluded(file)) continue;
    const text = readText(file, cwd);
    if (text === null || !ANY_DIGIT.test(text)) continue;
    writeFileSync(resolve(cwd, file), toAsciiDigits(text));
    changed.push(file);
  }
  return changed;
}

export function main({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  log = console.log,
} = {}) {
  const fixMode = argv.includes('--fix');
  const files = listedFiles(cwd);

  if (fixMode) {
    const changed = fix(files, cwd);
    if (changed.length === 0) {
      log('Digits are already ASCII.');
      return 0;
    }
    for (const file of changed) log(`fixed: ${file}`);
    return 0;
  }

  const offenders = scan(files, cwd);
  if (offenders.length === 0) {
    log('Digits are ASCII across the repo.');
    return 0;
  }

  for (const { file, lines } of offenders) {
    for (const { line, text } of lines) log(`${file}:${line}: ${text.trim().slice(0, 120)}`);
  }
  log('');
  log('Use the ASCII shape 0-9, not Arabic-Indic numerals.');
  log('Run `npm run fix:digits` to rewrite them.');
  return 1;
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  process.exitCode = main();
}
