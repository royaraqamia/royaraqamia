#!/usr/bin/env node
/**
 * Requires the repo's text to be NFC and to spell "running" with a final ya, and
 * folds both into that form with `--fix`.
 *
 * Arabic writes a letter's combining marks in two orders — the Unicode canonical
 * one, and the reverse, which renders identically but compares unequal. Any
 * exact-text match therefore hits one spelling and silently misses the other
 * (#337); the two are indistinguishable in a review diff. `npm run lint` catches
 * it in the files ESLint parses, and this is the repo-wide gate: docs, JSON and
 * the rest are not linted, and one copy-paste of a word is all it takes to
 * reintroduce the mismatch. See ADR 0063.
 *
 * The tanween spelling of "running" is banned for the same reason: the copy uses
 * the final-ya form (ADR 0054), and a screen reader or an exact-text assertion
 * only matches one of them. The banned form is written as escapes so this file
 * passes its own check; the files that must name both spellings are allowlisted.
 *
 * `public/quran/**` is excluded by design: that text is vendored as published
 * (ADR 0057, ADR 0062), and for it NFC composes marks rather than reordering
 * them, which would rewrite the shipped text. Measured over the rest of the repo,
 * NFC only ever reorders — no file outside `public/quran/` changes length.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isNfc, nonNfcLines } from '../eslint-rules/no-non-nfc.mjs';

/** Vendored as published, so never rewritten. See the header. */
export const EXCLUDED = ['public/quran/'];

export const isExcluded = (file) => EXCLUDED.some((prefix) => file.startsWith(prefix));

/** Banned tanween form → final-ya form; escaped so this file passes itself. */
export const BANNED = '\u062C\u0627\u0631\u064D';
export const PREFERRED = '\u062C\u0627\u0631\u064A';

/**
 * Files that must name both spellings: the rule itself and the records that
 * explain the swap. Every other file is expected to use the preferred form only.
 */
export const SPELLING_ALLOWED = [
  'AGENTS.md',
  'docs/adr/0054-the-shells-dialogs-look-like-the-product.md',
  'docs/conventions.md',
];

export const isSpellingAllowed = (file) => SPELLING_ALLOWED.includes(file);

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

/** `{ file, lines }` for every text file in `files` that is not NFC. */
export function scan(files, cwd = process.cwd()) {
  const offenders = [];
  for (const file of files) {
    if (isExcluded(file)) continue;
    const text = readText(file, cwd);
    if (text === null || isNfc(text)) continue;
    offenders.push({ file, lines: nonNfcLines(text) });
  }
  return offenders;
}

/**
 * Rewrites every text file in `files` that is not NFC, and returns the files it
 * changed. `normalize` only reorders and composes, so every other byte — line
 * endings included — is preserved.
 */
export function fix(files, cwd = process.cwd()) {
  const changed = [];
  for (const file of files) {
    if (isExcluded(file)) continue;
    const text = readText(file, cwd);
    if (text === null || isNfc(text)) continue;
    writeFileSync(resolve(cwd, file), text.normalize('NFC'));
    changed.push(file);
  }
  return changed;
}

/** `{ file, lines }` for every non-excluded text file that uses the banned spelling. */
export function scanBanned(files, cwd = process.cwd()) {
  const offenders = [];
  for (const file of files) {
    if (isExcluded(file) || isSpellingAllowed(file)) continue;
    const text = readText(file, cwd);
    if (text === null || !text.includes(BANNED)) continue;
    const lines = text
      .split('\n')
      .flatMap((line, index) => (line.includes(BANNED) ? [index + 1] : []));
    offenders.push({ file, lines });
  }
  return offenders;
}

/** Replaces the banned spelling in every eligible file and returns the changed files. */
export function fixBanned(files, cwd = process.cwd()) {
  const changed = [];
  for (const file of files) {
    if (isExcluded(file) || isSpellingAllowed(file)) continue;
    const text = readText(file, cwd);
    if (text === null || !text.includes(BANNED)) continue;
    writeFileSync(resolve(cwd, file), text.replaceAll(BANNED, PREFERRED));
    changed.push(file);
  }
  return changed;
}

export async function main(argv = process.argv.slice(2), log = console.log, error = console.error) {
  const files = listedFiles();

  if (argv.includes('--fix')) {
    const changed = fix(files);
    const respelled = fixBanned(files);
    // Both fixes are idempotent, so a clean re-scan proves the pass converged
    // rather than shuffling the same marks into a different order.
    const left = scan(files);
    const stillBanned = scanBanned(files);
    if (left.length > 0 || stillBanned.length > 0) {
      if (left.length > 0) {
        error(`ERROR: ${left.length} file(s) are still not NFC after --fix:`);
        for (const { file, lines } of left) error(`  - ${file} (lines ${lines.join(', ')})`);
      }
      if (stillBanned.length > 0) {
        error(`ERROR: ${stillBanned.length} file(s) still use the banned spelling after --fix:`);
        for (const { file, lines } of stillBanned) error(`  - ${file} (lines ${lines.join(', ')})`);
      }
      return 1;
    }
    log(`OK: folded ${changed.length} file(s) into NFC and respelled ${respelled.length}.`);
    return 0;
  }

  const offenders = scan(files);
  const banned = scanBanned(files);
  if (offenders.length === 0 && banned.length === 0) {
    log(`OK: all ${files.length} files are NFC and use the preferred spelling.`);
    return 0;
  }

  if (offenders.length > 0) {
    error(
      `ERROR: ${offenders.length} file(s) are not NFC — Arabic combining marks are in a ` +
        `non-canonical order, so an exact-text match against the correctly spelled copy misses:`
    );
    for (const { file, lines } of offenders) error(`  - ${file} (lines ${lines.join(', ')})`);
  }
  if (banned.length > 0) {
    error(
      `ERROR: ${banned.length} file(s) use «${BANNED}» — write «${PREFERRED}» instead ` +
        `(ADR 0054), or the exact-text match hits only one spelling:`
    );
    for (const { file, lines } of banned) error(`  - ${file} (lines ${lines.join(', ')})`);
  }
  error('\nRun `npm run fix:arabic` to fold the marks and rewrite the spelling. See ADR 0063.');
  return 1;
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  process.exitCode = await main();
}
