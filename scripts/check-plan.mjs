#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The todo list that makes the APK the web (#882).
 *
 * One row per surface in `perf/surfaces.json`, in the order the work is meant to
 * happen, and the state of each:
 *
 *   `native`   the shell draws it: `docs/mobile/screens.json` says `enabled: true`
 *              and `check:visual` passes for it (ADR-0118)
 *   `todo`     the app still opens the document for it
 *   `blocked`  it cannot be worked yet, and `blockedBy` says why
 *
 * This script is the reason the list cannot rot. It fails when a surface has no
 * row, a row names a surface that does not exist, two rows name the same surface,
 * a row's phase is not declared or the phases are interleaved, the plan and
 * `screens.json` disagree about what is switched on, or a ported component in
 * `docs/mobile/parity.json` belongs to a surface the plan does not know.
 *
 * `docs/mobile/parity-plan.md` is generated from it, and the tracking issue's body
 * is that file. Run `npm run check:plan -- --write` after changing the JSON.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLAN = join(ROOT, 'docs', 'mobile', 'parity-plan.json');
const RENDERED = join(ROOT, 'docs', 'mobile', 'parity-plan.md');
const SCREENS = join(ROOT, 'docs', 'mobile', 'screens.json');
const SURFACES = join(ROOT, 'perf', 'surfaces.json');
const PARITY = join(ROOT, 'docs', 'mobile', 'parity.json');

const STATES = new Set(['native', 'todo', 'blocked']);

/** Every problem with the plan, as messages. */
export function validate({ plan, screens, surfaces, parity }) {
  const errors = [];
  if (plan.schemaVersion !== 1) {
    errors.push(`docs/mobile/parity-plan.json: schemaVersion must be 1, not ${plan.schemaVersion}`);
  }

  const phases = plan.phases ?? [];
  const phaseIds = new Set();
  for (const phase of phases) {
    if (!phase.id) {
      errors.push('docs/mobile/parity-plan.json: a phase has no "id"');
      continue;
    }
    if (phaseIds.has(phase.id)) {
      errors.push(`docs/mobile/parity-plan.json: phase "${phase.id}" appears twice`);
    }
    phaseIds.add(phase.id);
    if (!phase.title) errors.push(`phase "${phase.id}" has no title`);
    if (!phase.why) errors.push(`phase "${phase.id}" does not say why it is a phase`);
  }
  if (phaseIds.size === 0) {
    errors.push('docs/mobile/parity-plan.json: no phases, so nothing can be ordered');
  }

  const known = new Set((surfaces.surfaces ?? []).map((surface) => surface.id));
  const enabled = new Set(
    (screens.screens ?? []).filter((row) => row.enabled === true).map((row) => row.surface)
  );

  const seen = new Map();
  let previousPhase = null;
  const finished = new Set();
  for (const row of plan.surfaces ?? []) {
    const id = row.surface;
    if (!id) {
      errors.push('docs/mobile/parity-plan.json: a row has no "surface"');
      continue;
    }
    if (seen.has(id)) {
      errors.push(`docs/mobile/parity-plan.json: "${id}" appears twice`);
      continue;
    }
    seen.set(id, row);

    if (!known.has(id)) {
      errors.push(`row "${id}" names a surface perf/surfaces.json does not have`);
    }
    if (!phaseIds.has(row.phase)) {
      errors.push(`row "${id}" names phase "${row.phase}", which is not declared`);
    }

    // The list is a work order: a phase's rows sit together, or "what is next"
    // is a question the reader has to answer twice.
    if (row.phase !== previousPhase) {
      if (finished.has(row.phase)) {
        errors.push(`row "${id}" returns to phase "${row.phase}" after another phase started`);
      }
      if (previousPhase !== null) finished.add(previousPhase);
      previousPhase = row.phase;
    }

    if (!STATES.has(row.state)) {
      errors.push(`row "${id}" has state "${row.state}", which is not native, todo or blocked`);
    }
    if (row.state === 'blocked' && !row.blockedBy) {
      errors.push(`row "${id}" is blocked and does not say by what ("blockedBy")`);
    }
    if (row.state !== 'blocked' && row.blockedBy) {
      errors.push(`row "${id}" names a blocker but is not blocked`);
    }
    if (row.state === 'native' && !enabled.has(id)) {
      errors.push(`row "${id}" is native and docs/mobile/screens.json does not have it enabled`);
    }
    if (row.state !== 'native' && enabled.has(id)) {
      errors.push(`row "${id}" is "${row.state}" and docs/mobile/screens.json has it enabled`);
    }
    if (row.issue !== undefined && !/^#\d+$/.test(row.issue)) {
      errors.push(`row "${id}" names issue "${row.issue}", which is not #<number>`);
    }
  }

  for (const id of known) {
    if (!seen.has(id)) {
      errors.push(
        `surface "${id}" has no row in docs/mobile/parity-plan.json (every screen is on the list)`
      );
    }
  }

  // A component is drawn by a surface; a component whose surface is not on the
  // list is a port that exists outside the plan.
  for (const component of parity.components ?? []) {
    if (!component.surface) {
      errors.push(`component "${component.id}" does not say which surface draws it`);
      continue;
    }
    if (!seen.has(component.surface)) {
      errors.push(
        `component "${component.id}" belongs to surface "${component.surface}", which the plan does not list`
      );
    }
  }

  return errors;
}

/** The routes a surface serves, from the matrix. */
function routesOf(surfaces, id) {
  const surface = (surfaces.surfaces ?? []).find((entry) => entry.id === id);
  if (!surface) return [];
  const routes = [...(surface.routes ?? [])];
  if (typeof surface.prefix === 'string') routes.push(`${surface.prefix}/**`);
  return routes;
}

/** The markdown the repository commits and the tracking issue carries. */
export function renderMarkdown({ plan, screens, surfaces, parity }, { issue = false } = {}) {
  const byId = new Map((plan.surfaces ?? []).map((row) => [row.surface, row]));

  const header = issue
    ? ''
    : '<!-- Generated by scripts/check-plan.mjs from docs/mobile/parity-plan.json - do not edit by hand.\n' +
      '     Run `npm run check:plan -- --write` after changing the JSON. -->\n\n';

  const adr = issue
    ? 'https://github.com/royaraqamia/royaraqamia/blob/main/docs/adr/0118-a-port-is-switched-on-by-two-measurements.md'
    : 'docs/adr/0118-a-port-is-switched-on-by-two-measurements.md';

  const title = issue ? '' : '# Every screen, until the APK is the web\n\n';

  const intro =
    title +
    'One line per surface the site serves, and the state of its native port (#882). `native` means ' +
    'the shell draws it and `check:visual` passes; `todo` means the app opens the document for it; ' +
    '`blocked` means it cannot be worked yet and the line says why. The rule that decides a line ' +
    `is [ADR-0118](${adr}): the same boxes, the ` +
    'same styles, and a raster inside the tolerance, recorded from both clients at 393 x 852 @ 2.75. ' +
    'A screen that cannot pass stays the document, which is a finished state, not a failure. ' +
    '`docs/mobile/screens.json` is the machine truth for what is switched on; this list is the order ' +
    'it happens in, and `check:plan` fails when the two disagree.\n\n' +
    'Generated from `docs/mobile/parity-plan.json`. Do not edit this file; change the JSON and run ' +
    '`npm run check:plan -- --write`.\n\n';

  const sections = [];
  for (const phase of plan.phases ?? []) {
    const rows = (plan.surfaces ?? []).filter((row) => row.phase === phase.id);
    if (rows.length === 0) continue;
    const lines = rows.map((row) => {
      const box = row.state === 'native' ? '[x]' : '[ ]';
      const routes = routesOf(surfaces, row.surface)
        .map((route) => `\`${route}\``)
        .join(' ');
      const issue = row.issue ? ` · ${row.issue}` : '';
      const blocked = row.state === 'blocked' ? ` · blocked by ${row.blockedBy}` : '';
      const state = row.state === 'native' ? 'native' : row.state;
      return `- ${box} **${row.surface}** ${routes} — ${state}${issue}${blocked}`;
    });

    sections.push(`## ${phase.title}\n\n_${phase.why}_\n\n${lines.join('\n')}\n`);
  }

  const components = (parity.components ?? [])
    .filter((component) => byId.has(component.surface))
    .map((component) => {
      const done = byId.get(component.surface)?.state === 'native';
      const issue = component.issue ? ` · ${component.issue}` : '';
      return `- ${done ? '[x]' : '[ ]'} \`${component.id}\` on **${component.surface}**${issue}`;
    });

  const tail =
    `\n## Components\n\n` +
    `A component is finished when the surface that draws it is native: ` +
    `${components.length} ported components, listed by the screen they belong to and gated by ` +
    `\`check:parity\` (ADR-0098).\n\n${components.join('\n')}\n`;

  const counts = (plan.surfaces ?? []).reduce(
    (total, row) => ({ ...total, [row.state]: (total[row.state] ?? 0) + 1 }),
    {}
  );
  const summary =
    `\n## Where this stands\n\n` +
    `${counts.native ?? 0} native · ${counts.todo ?? 0} to do · ${counts.blocked ?? 0} blocked of ` +
    `${(screens.screens ?? []).length} surfaces.\n`;

  return `${header}${intro}${sections.join('\n')}${tail}${summary}`;
}

export function load(root = ROOT) {
  const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
  return {
    plan: read(join(root, 'docs', 'mobile', 'parity-plan.json')),
    screens: read(join(root, 'docs', 'mobile', 'screens.json')),
    surfaces: read(join(root, 'perf', 'surfaces.json')),
    parity: read(join(root, 'docs', 'mobile', 'parity.json')),
  };
}

export function main(argv = process.argv.slice(2)) {
  for (const path of [PLAN, SCREENS, SURFACES, PARITY]) {
    if (!existsSync(path)) {
      console.error(`x ${relative(ROOT, path)} is missing`);
      return 1;
    }
  }

  const data = load();
  const errors = validate(data);
  const rendered = renderMarkdown(data);

  if (argv.includes('--issue')) {
    process.stdout.write(renderMarkdown(data, { issue: true }));
    return 0;
  }

  if (argv.includes('--write')) {
    if (errors.length > 0) {
      for (const error of errors) console.error(`x ${error}`);
      return 1;
    }
    writeFileSync(RENDERED, rendered);
    console.log(`  ok ${relative(ROOT, RENDERED)} regenerated`);
    return 0;
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`x ${error}`);
    return 1;
  }

  const current = existsSync(RENDERED) ? readFileSync(RENDERED, 'utf8') : '';
  if (current !== rendered) {
    console.error(
      `x ${relative(ROOT, RENDERED)} does not match docs/mobile/parity-plan.json - run \`npm run check:plan -- --write\``
    );
    return 1;
  }

  const rows = data.plan.surfaces ?? [];
  const native = rows.filter((row) => row.state === 'native').length;
  console.log(`  ok ${rows.length} surfaces, ${native} native, ${rows.length - native} to go`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
