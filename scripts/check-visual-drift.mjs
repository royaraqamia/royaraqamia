#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A pull-request scoped companion to check-visual (ADR-0118).
 *
 * check-visual compares the app's current capture with the recording made when a
 * surface was switched on. It cannot see the web change afterwards, so a PR that
 * edits the web side of a native surface leaves the gate green against old
 * evidence - the gap #1564, #1565, #1567 and #1574 all fell through.
 *
 * This check looks at the PR's own diff: when a changed file draws a gated
 * native surface on the web, the PR must also change that surface's evidence, or
 * carry a dated, reviewed waiver. It is deliberately scoped to the diff, so a
 * backlog of already-stale surfaces does not turn every unrelated PR red.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GATE = join(ROOT, 'docs', 'mobile', 'visual-gate.json');
const PARITY = join(ROOT, 'docs', 'mobile', 'parity.json');
const WAIVERS = join(ROOT, 'docs', 'mobile', 'visual-waivers.json');
const EVIDENCE = 'e2e/__visual__/';

const read = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);
const slash = (path) => String(path).replaceAll('\\', '/');

/** Repo-relative web files whose change can alter a gated surface's capture. */
export function webPathsBySurface(parity) {
  const map = new Map();
  const add = (surface, path) => {
    if (!surface || typeof path !== 'string' || path.length === 0) return;
    if (!map.has(surface)) map.set(surface, new Set());
    map.get(surface).add(slash(path));
  };
  for (const component of parity?.components ?? []) {
    add(component.surface, component.web?.route);
    add(component.surface, component.web?.component);
    add(component.surface, component.web?.copyModule);
    add(component.surface, component.copySource);
  }
  return map;
}

export const evidencePrefix = (surface) => `${EVIDENCE}${surface}/`;

/** Waivers are exceptions with a reason, an issue and an expiry - never a blank check. */
export function validateWaivers(waivers, today) {
  const errors = [];
  const valid = new Map();
  const rows = waivers?.waivers ?? [];
  if (!Array.isArray(rows)) {
    return { errors: ['docs/mobile/visual-waivers.json: `waivers` must be a list'], valid };
  }
  for (const row of rows) {
    const where = row?.surface ? `waiver for "${row.surface}"` : 'a waiver';
    if (typeof row?.surface !== 'string' || row.surface.length === 0) {
      errors.push(`${where}: names a surface`);
      continue;
    }
    if (valid.has(row.surface)) errors.push(`${where}: appears twice`);
    if (typeof row.reason !== 'string' || row.reason.length === 0)
      errors.push(`${where}: says why`);
    if (!/^#\d+$/.test(row.issue ?? '')) errors.push(`${where}: names an issue like #1234`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.until ?? '')) {
      errors.push(`${where}: has an expiry date, YYYY-MM-DD`);
    } else if (row.until < today) {
      errors.push(`${where}: expired on ${row.until}; remove or renew it`);
    }
    valid.set(row.surface, row);
  }
  return { errors, valid };
}

/** Everything wrong with this PR's diff, plus the surfaces it touched. */
export function validate({ changed = [], gate, parity, waivers, today }) {
  const errors = [];
  const paths = webPathsBySurface(parity);
  const { errors: waiverErrors, valid } = validateWaivers(waivers, today);
  errors.push(...waiverErrors);

  const files = changed.map(slash);
  const touched = new Set();
  for (const surface of gate?.surfaces ?? []) {
    const id = surface.surface;
    if (!id) continue;
    const web = [...(paths.get(id) ?? []), `shared/visual/${id}.json`];
    const triggers = files.filter((file) => web.includes(file));
    if (triggers.length === 0) continue;
    touched.add(id);
    if (files.some((file) => file.startsWith(evidencePrefix(id)))) continue;
    if (valid.has(id)) continue;
    errors.push(
      `"${id}": the web side changed (${triggers.join(', ')}) with no new visual evidence; ` +
        're-run `npm run visual:capture` and the app visual test, or add a dated waiver in docs/mobile/visual-waivers.json'
    );
  }
  return { errors, touched, valid };
}

/** The files this pull request changes, relative to the repository root. */
export function changedFiles(base, repoRoot = ROOT) {
  const out = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function main(argv = process.argv.slice(2)) {
  const baseAt = argv.indexOf('--base');
  const base = baseAt >= 0 ? argv[baseAt + 1] : null;
  if (!base) {
    console.error('x usage: npm run check:visual-drift -- --base <ref>');
    return 2;
  }
  const filesAt = argv.indexOf('--files');
  const changed =
    filesAt >= 0 ? (argv[filesAt + 1] ?? '').split(',').filter(Boolean) : changedFiles(base);

  const gate = read(GATE);
  const parity = read(PARITY);
  const waivers = read(WAIVERS) ?? { waivers: [] };
  if (!gate || !parity) {
    console.error('x docs/mobile/visual-gate.json or docs/mobile/parity.json is missing');
    return 1;
  }

  const today = new Date().toISOString().slice(0, 10);
  const { errors, touched, valid } = validate({ changed, gate, parity, waivers, today });
  if (errors.length > 0) {
    for (const error of errors) console.error(`x ${error}`);
    return 1;
  }

  const waived = [...touched].filter((id) => valid.has(id));
  console.log(
    `  ok ${changed.length} file(s) against ${base}: ${touched.size} gated surface(s) touched` +
      (waived.length ? `, ${waived.length} waived (${waived.join(', ')})` : '') +
      '; no visual drift'
  );
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
