import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The paint gate's runner (#558).
 *
 * `npm run perf:paint` drives `e2e/perf-paint.spec.ts` and fails the way any test
 * run fails. This script exists because the gate needs two things a bare
 * `npx playwright test` does not give it: the measurements collected into a file
 * a CI artifact can carry, and a way to fold that file back into
 * `perf/paint-baseline.json`.
 *
 * ```bash
 * npm run perf:paint                     # measure and gate
 * npm run perf:paint -- --update         # measure, then record the baseline
 * npm run perf:paint -- --from <file>    # record from a CI artifact
 * ```
 *
 * The baseline is recorded on the runner that enforces it: these numbers are
 * machine-sensitive in the same way `perf/baseline.json` is, so recording them on
 * a laptop and gating on GitHub's runner would fail every pull request or pass
 * everything. `E2E: Offline` uploads the measurement file for exactly this.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET = join(ROOT, 'perf', 'paint-budget.json');
const BASELINE = join(ROOT, 'perf', 'paint-baseline.json');
const MEASUREMENTS = join(ROOT, 'node_modules', '.playwright', 'paint-measurements.json');
const SPEC = join('e2e', 'perf-paint.spec.ts');

const args = process.argv.slice(2);
const update = args.includes('--update');
const fromIndex = args.indexOf('--from');
const fromFile = fromIndex === -1 ? null : args[fromIndex + 1];

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`✗ ${path} is not readable JSON: ${error.message}`);
    return null;
  }
}

/** Folds a measurement file into the committed baseline. */
function record(source, label) {
  const budget = readJson(BUDGET);
  if (!budget) {
    console.error('✗ perf/paint-budget.json is missing or unreadable');
    return 1;
  }

  const surfaces = {};
  const missing = [];
  for (const surface of budget.surfaces) {
    const row = source.surfaces?.[surface.id];
    if (!row || row.cold === null || row.warm === null) {
      missing.push(surface.id);
      continue;
    }
    surfaces[surface.id] = {
      cold: row.cold,
      warm: row.warm,
      tap: surface.tap ? (row.tap ?? null) : null,
    };
  }

  if (Object.keys(surfaces).length === 0) {
    console.error(`✗ ${label} carries no complete measurement — nothing recorded`);
    return 1;
  }

  const baseline = {
    version: 1,
    recorded: source.recorded ?? new Date().toISOString().slice(0, 10),
    surfaces,
  };
  mkdirSync(dirname(BASELINE), { recursive: true });
  writeFileSync(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');

  for (const [id, row] of Object.entries(surfaces)) {
    console.log(`  ✓ ${id}: cold ${row.cold} ms, warm ${row.warm} ms, tap ${row.tap ?? '—'}`);
  }
  if (missing.length > 0) {
    // Not a failure: a surface the run could not measure (no account, a skipped
    // fixture) simply keeps no baseline, and the matrix says it is ungated.
    console.log(`  – not recorded (not measured this run): ${missing.join(', ')}`);
  }
  console.log(`  ✓ ${BASELINE.replace(`${ROOT}`, '')} updated from ${label}`);
  return 0;
}

if (fromFile) {
  const source = readJson(resolve(ROOT, fromFile));
  if (!source) {
    console.error(`✗ ${fromFile} does not exist`);
    process.exit(1);
  }
  process.exit(record(source, fromFile));
}

if (!existsSync(BUDGET)) {
  console.error('✗ perf/paint-budget.json is missing — the gate has no rows to measure');
  process.exit(1);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const run = spawnSync(
  npx,
  ['playwright', 'test', SPEC, '--project=existing-tests', '--workers=1'],
  {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      // The worker does not register in development, so a dev server would measure
      // nothing and fail every offline reload. `CI` is what makes Playwright's
      // `webServer` build and serve a production build (`playwright.config.ts`).
      CI: process.env.CI ?? '1',
      PAINT_E2E: '1',
      PAINT_E2E_OUT: MEASUREMENTS,
    },
  }
);

const measurements = readJson(MEASUREMENTS);
if (measurements?.report) {
  for (const line of measurements.report) console.log(line);
}

if (run.status !== 0) {
  console.error('✗ the paint gate failed');
  process.exit(run.status ?? 1);
}

if (!update) {
  console.log(`  ✓ paint gate passed — measurements in ${MEASUREMENTS.replace(`${ROOT}`, '')}`);
  process.exit(0);
}

if (!measurements) {
  console.error('✗ no measurements were written, so there is nothing to record');
  process.exit(1);
}

process.exit(record(measurements, 'this run'));
