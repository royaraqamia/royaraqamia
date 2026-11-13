#!/usr/bin/env node
/**
 * Requires every redirect-URI decision to go through
 * `backend/services/mcp/redirect-uri.ts` (ADR 0179).
 *
 * The failure this prevents is silent by construction: comparing a registration
 * to a requested target as text looks correct, passes a fixed-port unit test, and
 * refuses the second launch of every native client — a loopback callback port is
 * chosen at run time (RFC 8252 §7.3). Measured on 2026-11-13: `opencode mcp auth
 * royaraqamia` registered port 52151, its re-authentication asked for 63881, and
 * `/mcp/authorize` answered `invalid_request` while the client re-used the
 * registration it already held.
 *
 * The rule was in four call sites, each written by hand at a different time. So
 * the gate refuses the pattern rather than one instance of it: a fifth call site
 * is the normal way this comes back.
 *
 * Usage: `npm run check:redirect-uri`.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Where OAuth endpoints and their services live. */
export const SCANNED_ROOTS = ['app/', 'backend/', 'shared/', 'frontend/', 'proxy.ts'];

const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js'];

/** The one module allowed to decide whether a redirect target is acceptable. */
export const MODULE = 'backend/services/mcp/redirect-uri.ts';

/** Tests describe redirect targets on purpose; they are not served. */
export const EXCLUDED = ['__tests__/', '.test.', '.spec.', 'backend/config/generated/', MODULE];

export const FORBIDDEN = [
  {
    why: 'compares a registration to a redirect target as text (use allowsRedirectUri)',
    pattern: /redirect_uris\s*\.\s*includes\s*\(/,
  },
  {
    why: 'compares a redirect target as text (use allowsRedirectUri)',
    pattern: /\.includes\(\s*redirectUri\s*\)/,
  },
  {
    why: 'compares redirect_uri values with === (use isSameRedirectUri)',
    pattern: /\bredirect_uri\b\s*[!=]==/,
  },
];

export const isScanned = (file) =>
  SCANNED_ROOTS.some((root) => file === root || file.startsWith(root)) &&
  SCANNED_EXTENSIONS.some((extension) => file.endsWith(extension)) &&
  !EXCLUDED.some((excluded) => file.includes(excluded));

/** Every file the repo would ship: tracked, plus untracked that git does not ignore. */
export function listedFiles(cwd = process.cwd()) {
  const listed = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
  );
  return listed.split('\0').filter(Boolean);
}

function readText(file, cwd) {
  try {
    return readFileSync(resolve(cwd, file), 'utf8');
  } catch {
    return null;
  }
}

/** A comment may name the pattern it forbids; it does not decide anything. */
function isComment(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

/** `{ line, text, why }` for every line that compares a redirect URI as text. */
export function redirectUriLines(text) {
  const found = [];
  text.split('\n').forEach((line, index) => {
    if (isComment(line)) return;
    const hit = FORBIDDEN.find(({ pattern }) => pattern.test(line));
    if (hit) found.push({ line: index + 1, text: line.trim(), why: hit.why });
  });
  return found;
}

/** `{ file, lines }` for every scanned file that contains a match. */
export function scan(files, cwd = process.cwd()) {
  const offenders = [];
  for (const file of files) {
    if (!isScanned(file)) continue;
    const text = readText(file, cwd);
    if (text === null) continue;
    const lines = redirectUriLines(text);
    if (lines.length > 0) offenders.push({ file, lines });
  }
  return offenders;
}

export function main({ cwd = process.cwd(), log = console.log } = {}) {
  const offenders = scan(listedFiles(cwd), cwd);

  if (offenders.length === 0) {
    log('Redirect URIs are compared by the redirect-uri module everywhere.');
    return 0;
  }

  for (const { file, lines } of offenders) {
    for (const { line, text, why } of lines) {
      log(`${file}:${line}: ${why}`);
      log(`  ${text.slice(0, 120)}`);
    }
  }
  log('');
  log(`Compare redirect URIs with ${MODULE} (ADR 0179); a loopback port is not a string.`);
  return 1;
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  process.exitCode = main();
}
