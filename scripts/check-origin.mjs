#!/usr/bin/env node
/**
 * Requires every absolute URL the server builds to start from the configured
 * origin (`env.origin`), never from the request (ADR-0178).
 *
 * The failure this prevents is silent by construction: a self-hosted Next server
 * builds `request.url` from the hostname and port it listens on, so behind a
 * proxy `new URL(request.url).origin` is the container's internal address. The
 * MCP discovery documents advertised `https://localhost:10000` for as long as the
 * site has been on Render, and no unit test could see it — a `NextRequest` built
 * in a test always carries a clean URL.
 *
 * So the rule is a gate rather than a review note: a fourth call site is the
 * normal way this comes back, and `npm run check:origin` is what makes it fail in
 * the pull request instead of in an MCP client six months later.
 *
 * Usage: `npm run check:origin`.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Where server-side absolute URLs are decided. */
export const SCANNED_ROOTS = ['app/', 'backend/', 'shared/', 'frontend/', 'proxy.ts'];

const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js'];

/** Test files describe request URLs on purpose; they are not served. */
export const EXCLUDED = ['__tests__/', '.test.', '.spec.', 'backend/config/generated/'];

export const FORBIDDEN = [
  {
    why: 'builds an origin from the request URL (use env.origin)',
    pattern: /new\s+URL\(\s*(?:req|request|r)\s*\.\s*(?:url|nextUrl)\s*\)\s*\.\s*origin/,
  },
  {
    why: 'reads an origin off nextUrl (use env.origin)',
    pattern: /\.nextUrl\s*\.\s*origin/,
  },
  {
    why: 'trusts a Host header (use env.origin)',
    pattern: /\.\s*get\(\s*['"](?:host|x-forwarded-host)['"]\s*\)/,
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

/** A comment may name the pattern it forbids; it does not build a URL. */
function isComment(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

/** `{ line, text, why }` for every line that derives an origin from the request. */
export function originLines(text) {
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
    const lines = originLines(text);
    if (lines.length > 0) offenders.push({ file, lines });
  }
  return offenders;
}

export function main({ cwd = process.cwd(), log = console.log } = {}) {
  const offenders = scan(listedFiles(cwd), cwd);

  if (offenders.length === 0) {
    log('Absolute URLs start from the configured origin everywhere.');
    return 0;
  }

  for (const { file, lines } of offenders) {
    for (const { line, text, why } of lines) {
      log(`${file}:${line}: ${why}`);
      log(`  ${text.slice(0, 120)}`);
    }
  }
  log('');
  log('Build absolute URLs from `env.origin` (ADR-0178); a request is not an origin.');
  return 1;
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  process.exitCode = main();
}
