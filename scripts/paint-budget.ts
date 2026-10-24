/**
 * The paint gate's numbers and its rules (#558).
 *
 * `perf/paint-budget.json` holds one row per surface the program can measure, and
 * `e2e/perf-paint.spec.ts` drives those rows: a cold open, a warm (offline)
 * reload, and — where the surface declares the steps — one local mutation's tap.
 * The measurements are the client's own User Timing marks
 * (`shared/contracts/app-perf-limits`), so the gate asserts what the field
 * reports rather than a second definition of it.
 *
 * This module is deliberately pure: no Playwright, no clock. The spec measures,
 * this decides, and `scripts/__tests__/paint-budget.test.ts` proves the decisions
 * without a browser — which is the only part of the gate a pull request can
 * exercise in a unit-test run.
 */

/** One interaction the gate has to perform before it can time the tap. */
export interface PaintStep {
  action: 'click' | 'fill';
  /** A Playwright selector. */
  target: string;
  value?: string;
}

export interface PaintSurface {
  id: string;
  /** The route the shell is opened at. */
  path: string;
  /** Whether the surface needs the signed-in test account. */
  auth?: boolean;
  ceiling: { cold: number; warm: number };
  /** Present when a tap can be driven from data; `tapNote` explains when it cannot. */
  tap?: {
    ceiling: number;
    steps: PaintStep[];
    /**
     * A URL template for the record the steps create, so the gate can remove it
     * and leave the shared account as it found it. `{{run}}` is substituted with
     * the same token a step's `value` gets.
     */
    cleanup?: string;
  };
  tapNote?: string;
}

export interface PaintBudget {
  version: number;
  /** Kept samples per number. The first navigation of a run is always discarded. */
  runs: number;
  /** How much slower than the committed baseline is still noise. */
  regressionPct: number;
  surfaces: PaintSurface[];
}

export interface PaintMeasurement {
  cold: number | null;
  warm: number | null;
  tap: number | null;
}

export interface PaintBaseline {
  version: number;
  /** The day the numbers were recorded, or `null` while the file is still empty. */
  recorded: string | null;
  surfaces: Record<string, PaintMeasurement>;
}

export type PaintNumber = 'cold' | 'warm' | 'tap';

/** The median of the kept samples, or `null` when nothing was measured. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const lower = sorted[middle - 1];
  const upper = sorted[middle];
  if (lower === undefined || upper === undefined) return null;
  return Math.round((lower + upper) / 2);
}

/** The ceiling for one number, or `null` when the surface does not budget it. */
export function ceilingFor(surface: PaintSurface, name: PaintNumber): number | null {
  if (name === 'tap') return surface.tap?.ceiling ?? null;
  return surface.ceiling[name];
}

/** The committed baseline's value, when the file has one. */
export function baselineFor(
  baseline: PaintBaseline | null,
  surfaceId: string,
  name: PaintNumber
): number | null {
  const row = baseline?.surfaces[surfaceId];
  if (!row) return null;
  return row[name] ?? null;
}

function checkNumber({
  surfaceId,
  name,
  value,
  ceiling,
  before,
  regressionPct,
}: {
  surfaceId: string;
  name: PaintNumber;
  value: number;
  ceiling: number;
  before: number | null;
  regressionPct: number;
}): string[] {
  const violations: string[] = [];
  if (value > ceiling) {
    violations.push(`${surfaceId}: ${name} is ${value} ms, over the ${ceiling} ms ceiling`);
  }
  if (before !== null && value > before * (1 + regressionPct / 100)) {
    const delta = Math.round(((value - before) / before) * 100);
    violations.push(
      `${surfaceId}: ${name} regressed from ${before} ms to ${value} ms (+${delta}%, tolerance ${regressionPct}%)`
    );
  }
  return violations;
}

/**
 * Everything wrong with one surface's measurement.
 *
 * A missing number is a failure and not a skip: the surface declared a budget, so
 * a mark that never lands means the paint path (or the mark) broke — the exact
 * silence this gate exists to break. A surface the gate *cannot* measure is
 * absent from the budget file or carries a `tapNote`, and is listed as ungated in
 * the matrix instead.
 */
export function evaluate({
  surface,
  measured,
  baseline,
  regressionPct,
}: {
  surface: PaintSurface;
  measured: PaintMeasurement;
  baseline: PaintBaseline | null;
  regressionPct: number;
}): string[] {
  const violations: string[] = [];

  for (const name of ['cold', 'warm'] as const) {
    const value = measured[name];
    const ceiling = ceilingFor(surface, name);
    if (ceiling === null) continue;
    if (value === null) {
      violations.push(
        `${surface.id}: no ${name} content mark — the surface never reported a paint, so nothing is measured`
      );
      continue;
    }
    violations.push(
      ...checkNumber({
        surfaceId: surface.id,
        name,
        value,
        ceiling,
        before: baselineFor(baseline, surface.id, name),
        regressionPct,
      })
    );
  }

  if (surface.tap) {
    const ceiling = surface.tap.ceiling;
    const value = measured.tap;
    if (value === null) {
      violations.push(
        `${surface.id}: the tap steps ran but no tap → paint measure landed — \`beginTap()\` is missing from the write path`
      );
    } else {
      violations.push(
        ...checkNumber({
          surfaceId: surface.id,
          name: 'tap',
          value,
          ceiling,
          before: baselineFor(baseline, surface.id, 'tap'),
          regressionPct,
        })
      );
    }
  }

  return violations;
}

/** The rows a run prints, so a passing job still reports what it measured. */
export function formatReport({
  budget,
  measurements,
  baseline,
}: {
  budget: PaintBudget;
  measurements: Record<string, PaintMeasurement>;
  baseline: PaintBaseline | null;
}): string[] {
  const lines = ['surface        cold        warm        tap'];
  for (const surface of budget.surfaces) {
    const row = measurements[surface.id];
    const cell = (name: PaintNumber): string => {
      if (!row) return '—';
      const value = row[name];
      if (value === null) return '—';
      const before = baselineFor(baseline, surface.id, name);
      return before === null
        ? `${value} ms`
        : `${value} ms (${value - before >= 0 ? '+' : ''}${value - before})`;
    };
    lines.push(
      `${surface.id.padEnd(14)} ${cell('cold').padEnd(11)} ${cell('warm').padEnd(11)} ${cell('tap')}`
    );
  }
  return lines;
}
