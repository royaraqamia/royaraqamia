#!/usr/bin/env node
/**
 * Writes one release-note fragment for the Android shell (ADR-0090).
 *
 * The rule: a pull request that changes `android/**`, `capacitor.config.ts` or a
 * Capacitor plugin dependency ships to users, so it carries the Arabic sentence
 * those users read in the app's changelog. This script is how that sentence is
 * written — one command, a correctly named file, and the same text ready to paste
 * into the pull request body. `shell-version.yml` fails the pull request without
 * it, and the weekly cut refuses to ship without one.
 *
 *   npm run android:note -- "ميزة: ..." ["إصلاح: ..."]
 *   npm run android:note -- --list
 *
 * Style, enforced here rather than left to review:
 *
 *   - Arabic, written for a user: what they notice, not what changed in the code.
 *   - One bullet per effect, prefixed `ميزة:` (something new), `إصلاح:` (something
 *     broken that now works) or `تحسين:` (faster, simpler, clearer).
 *   - No file names, versions, commit types or internal terms.
 *   - A purely internal change still ships an APK, so it still needs a line:
 *     `تحسين: تحسينات عامة في الأداء والاستقرار`.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const UNRELEASED_DIR = join(ROOT, 'android', 'release-notes', 'unreleased');

/** The three categories a note may carry, in the product's own words. */
export const NOTE_PREFIXES = ['ميزة', 'إصلاح', 'تحسين'];

const ARABIC = /[\u0600-\u06FF]/;
const PREFIX_PATTERN = new RegExp(`^(${NOTE_PREFIXES.join('|')})\\s*[:：]\\s*`);

/** One bullet in the shape the fragment stores: `ميزة: ...`, no list marker. */
export function normalizeBullet(value) {
  let text = String(value ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
  while (text.startsWith('- ')) text = text.slice(2).trim();
  return text;
}

/**
 * Why a bullet cannot ship, or null when it can. The messages name the fix, so an
 * agent reading them does not have to guess the convention.
 */
export function bulletProblem(value) {
  const text = normalizeBullet(value);
  if (text.length === 0) return 'is empty';
  if (!ARABIC.test(text)) return 'is not Arabic — the changelog is read in Arabic';
  if (!PREFIX_PATTERN.test(text)) {
    return `does not start with ${NOTE_PREFIXES.map((prefix) => `${prefix}:`).join(', ')}`;
  }
  const body = text.replace(PREFIX_PATTERN, '').trim();
  if (body.length === 0) return 'says nothing after its prefix';
  return null;
}

/** `ميزة:  شيء` → `ميزة: شيء`, with one space after the colon. */
export function formatBullet(value) {
  const text = normalizeBullet(value);
  const match = PREFIX_PATTERN.exec(text);
  if (!match) return text;
  return `${match[1]}: ${text.replace(PREFIX_PATTERN, '').trim()}`;
}

/** Bullets from the arguments, normalised and de-duplicated, order kept. */
export function collectBullets(values) {
  const seen = new Set();
  const bullets = [];
  for (const value of values) {
    const bullet = formatBullet(value);
    const key = bullet.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    bullets.push(bullet);
  }
  return bullets;
}

/**
 * A filename that sorts predictably and cannot collide: the agent's slug when it
 * gives one, otherwise the UTC minute. A slug is lower-case ASCII so it survives
 * every filesystem and a reviewer can see what the note is about.
 */
export function noteFilename({ slug, now = new Date() } = {}) {
  if (slug !== undefined) {
    const cleaned = String(slug)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!cleaned) throw new Error(`--slug "${slug}" has no usable letters or digits`);
    return `${cleaned}.md`;
  }
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15).replace('T', '-');
  return `note-${stamp}.md`;
}

/** The fragment's text: one `- ` bullet per line. */
export function renderFragment(bullets) {
  return `${bullets.map((bullet) => `- ${bullet}`).join('\n')}\n`;
}

/** Fragments waiting for the next cut, `_README.md` excluded. */
export function pendingFragments(dir = UNRELEASED_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md') && !name.startsWith('_'))
    .sort();
}

export function writeFragment({
  dir = UNRELEASED_DIR,
  filename,
  bullets,
  write = writeFileSync,
  exists = existsSync,
  mkdir = mkdirSync,
}) {
  if (exists(join(dir, filename))) {
    throw new Error(`${filename} already exists; pick another --slug or drop it`);
  }
  mkdir(dir, { recursive: true });
  write(join(dir, filename), renderFragment(bullets), 'utf8');
  return join(dir, filename);
}

function readFragmentBullets(path) {
  return readFileSync(path, 'utf8').split('\n').map(normalizeBullet).filter(Boolean);
}

export function main(argv = process.argv.slice(2), log = console.log) {
  if (argv.includes('--list') || argv.includes('-l')) {
    const pending = pendingFragments();
    if (pending.length === 0) {
      log('no release notes are waiting for the next cut');
      return 0;
    }
    log(`${pending.length} note fragment(s) waiting for the next Android release:`);
    for (const name of pending) {
      log(`  ${name}`);
      for (const bullet of readFragmentBullets(join(UNRELEASED_DIR, name))) log(`    - ${bullet}`);
    }
    return 0;
  }

  const slugAt = argv.indexOf('--slug');
  const slug = slugAt === -1 ? undefined : argv[slugAt + 1];
  const values = (
    slugAt === -1 ? argv : argv.filter((_, index) => index !== slugAt && index !== slugAt + 1)
  ).filter((value) => !value.startsWith('--'));

  if (values.length === 0) {
    log('usage: npm run android:note -- "ميزة: ..." ["إصلاح: ..."] [--slug <name>]');
    log('       npm run android:note -- --list');
    log('');
    log(`Prefix with ${NOTE_PREFIXES.map((prefix) => `${prefix}:`).join(', ')} — in Arabic,`);
    log('for a user, one line per thing they notice.');
    return 1;
  }

  const problems = values
    .map((value, index) => ({ value, problem: bulletProblem(value), index }))
    .filter((entry) => entry.problem !== null);
  if (problems.length > 0) {
    for (const { value, problem } of problems) log(`"${value}" ${problem}.`);
    log('');
    log(
      `Write each line as one of: ${NOTE_PREFIXES.map((prefix) => `${prefix}: ...`).join(' / ')}`
    );
    return 1;
  }

  const bullets = collectBullets(values);
  const filename = noteFilename({ slug });
  const path = writeFragment({ filename, bullets });

  log(`wrote ${path}`);
  for (const bullet of bullets) log(`  - ${bullet}`);
  log('');
  log('Stage it with the change, and put the same lines in the pull request body under');
  log('"## Release note". The weekly release folds them into the APK changelog.');
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
