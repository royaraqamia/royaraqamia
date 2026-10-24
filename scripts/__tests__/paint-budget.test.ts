import { describe, expect, it } from 'vitest';
import {
  baselineFor,
  ceilingFor,
  evaluate,
  formatReport,
  median,
  type PaintBaseline,
  type PaintBudget,
  type PaintSurface,
} from '../paint-budget';

/**
 * The paint gate's decisions (#558), without a browser.
 *
 * The spec in `e2e/perf-paint.spec.ts` measures; everything that decides pass or
 * fail is here, so a pull request can prove the rules in a unit-test run — which
 * it cannot do for the measurement half, since that needs a production build, a
 * service worker and (for the owned surfaces) the test account.
 */

const surface = (overrides: Partial<PaintSurface> = {}): PaintSurface => ({
  id: 'habitflow',
  path: '/habitflow',
  auth: true,
  ceiling: { cold: 2200, warm: 450 },
  ...overrides,
});

const baseline = (surfaces: PaintBaseline['surfaces']): PaintBaseline => ({
  version: 1,
  recorded: '2026-10-24',
  surfaces,
});

const measured = (values: Partial<Record<'cold' | 'warm' | 'tap', number | null>>) => ({
  cold: null,
  warm: null,
  tap: null,
  ...values,
});

describe('median', () => {
  it('takes the middle of an odd sample and the mean of the middle pair of an even one', () => {
    expect(median([30, 10, 20])).toBe(20);
    expect(median([10, 20, 30, 41])).toBe(25);
  });

  it('returns null for no samples, which is how a dropped mark surfaces', () => {
    expect(median([])).toBeNull();
    expect(median([7])).toBe(7);
  });
});

describe('budget lookups', () => {
  it('reads a tap ceiling only where the surface declares one', () => {
    expect(ceilingFor(surface(), 'cold')).toBe(2200);
    expect(ceilingFor(surface(), 'tap')).toBeNull();
    expect(ceilingFor(surface({ tap: { ceiling: 140, steps: [] } }), 'tap')).toBe(140);
  });

  it('reads a baseline value only when the file has that surface', () => {
    const file = baseline({ spendtrack: { cold: 900, warm: 200, tap: null } });
    expect(baselineFor(file, 'spendtrack', 'cold')).toBe(900);
    expect(baselineFor(file, 'spendtrack', 'tap')).toBeNull();
    expect(baselineFor(file, 'quran', 'cold')).toBeNull();
    expect(baselineFor(null, 'spendtrack', 'cold')).toBeNull();
  });
});

describe('evaluate', () => {
  it('passes a measurement under its ceiling with no baseline to compare against', () => {
    expect(
      evaluate({
        surface: surface(),
        measured: measured({ cold: 1200, warm: 180 }),
        baseline: null,
        regressionPct: 10,
      })
    ).toEqual([]);
  });

  it('names the surface and the number when a ceiling is broken', () => {
    const violations = evaluate({
      surface: surface(),
      measured: measured({ cold: 3400, warm: 200 }),
      baseline: null,
      regressionPct: 10,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('habitflow');
    expect(violations[0]).toContain('cold is 3400 ms');
    expect(violations[0]).toContain('2200 ms ceiling');
  });

  it('fails a regression past the tolerance and allows one inside it', () => {
    const file = baseline({ habitflow: { cold: 1000, warm: 200, tap: null } });

    const inside = evaluate({
      surface: surface(),
      measured: measured({ cold: 1090, warm: 200 }),
      baseline: file,
      regressionPct: 10,
    });
    expect(inside).toEqual([]);

    const past = evaluate({
      surface: surface(),
      measured: measured({ cold: 1250, warm: 200 }),
      baseline: file,
      regressionPct: 10,
    });
    expect(past.some((violation) => violation.includes('regressed from 1000 ms to 1250 ms'))).toBe(
      true
    );
  });

  it('treats a missing content mark as a failure, not a skip', () => {
    const violations = evaluate({
      surface: surface(),
      measured: measured({ cold: null, warm: 200 }),
      baseline: null,
      regressionPct: 10,
    });
    expect(violations.some((violation) => violation.includes('no cold content mark'))).toBe(true);
  });

  it('fails a declared tap that never produced a measure, and ignores tap when none is declared', () => {
    const withTap = surface({ tap: { ceiling: 140, steps: [] } });
    const violations = evaluate({
      surface: withTap,
      measured: measured({ cold: 1000, warm: 200, tap: null }),
      baseline: null,
      regressionPct: 10,
    });
    expect(violations.some((violation) => violation.includes('no tap → paint measure'))).toBe(true);

    expect(
      evaluate({
        surface: surface(),
        measured: measured({ cold: 1000, warm: 200 }),
        baseline: null,
        regressionPct: 10,
      })
    ).toEqual([]);
  });

  it('reports each surface separately in the run table', () => {
    const file: PaintBudget = {
      version: 1,
      runs: 3,
      regressionPct: 10,
      surfaces: [surface(), surface({ id: 'quran', path: '/quran', auth: false })],
    };
    const lines = formatReport({
      budget: file,
      measurements: { habitflow: { cold: 1100, warm: 210, tap: null } },
      baseline: baseline({ habitflow: { cold: 1000, warm: 200, tap: null } }),
    });

    expect(lines[0]).toContain('surface');
    expect(lines.some((line) => line.startsWith('habitflow') && line.includes('+100'))).toBe(true);
    // A surface this run did not measure still gets a row, so the gap is visible.
    expect(lines.some((line) => line.startsWith('quran'))).toBe(true);
  });
});
