import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_PERF_MEASURE } from '../shared/contracts/app-perf-limits';
import {
  evaluate,
  formatReport,
  median,
  type PaintBudget,
  type PaintBaseline,
  type PaintMeasurement,
  type PaintSurface,
} from '../scripts/paint-budget';
import { gotoUnderWorkerControl } from './worker-control';
import { signIn } from './sign-in';

/**
 * The paint gate (#558): the instant-feel program's three numbers, measured on
 * the web instead of only in the field.
 *
 * Every number comes from the client's own User Timing marks
 * (`shared/contracts/app-perf-limits`), so this asserts what `/api/app-perf`
 * reports and not a second definition of it:
 *
 * - **cold** — a first visit with the network on, in a context where the worker
 *   cannot serve the document, so the number includes the document request;
 * - **warm** — an offline reload in a context the worker has taken over, which is
 *   the promise ADR-0073 makes;
 * - **tap** — one local mutation, driven by the steps in the budget file.
 *
 * `scripts/paint-budget.ts` holds the decisions (ceilings, tolerance, what a
 * missing number means) and is unit-tested; this file only measures. Run it with
 * `npm run perf:paint`, which is also what the `E2E: Offline` workflow invokes.
 *
 * Gated behind PAINT_E2E=1 because it needs a production build (no worker in
 * development) and, for the owned surfaces, the E2E test account:
 *   PAINT_E2E=1 npx playwright test e2e/perf-paint.spec.ts
 */

const ENABLED = process.env.PAINT_E2E === '1';
const ACCOUNT = Boolean(process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD);
const OUT = process.env.PAINT_E2E_OUT ?? null;

test.skip(!ENABLED, 'requires PAINT_E2E=1 (production build + service worker)');

const ROOT = process.cwd();
const budget = JSON.parse(
  readFileSync(join(ROOT, 'perf', 'paint-budget.json'), 'utf8')
) as PaintBudget;

const baseline = JSON.parse(
  readFileSync(join(ROOT, 'perf', 'paint-baseline.json'), 'utf8')
) as PaintBaseline;

/** Kept samples plus the one the run always throws away (worker install, cold store). */
const SAMPLES = budget.runs + 1;

/** A run that gates only public surfaces must not spend a sign-in on nothing. */
const NEEDS_ACCOUNT = budget.surfaces.some((surface) => surface.auth === true);

/** Every surface's median, written to `PAINT_E2E_OUT` for `perf:paint:update`. */
const collected: Record<string, PaintMeasurement> = {};

let storageState: Awaited<ReturnType<BrowserContext['storageState']>> | undefined;

test.beforeAll(async ({ browser, baseURL }) => {
  // One sign-in for the whole run: the login endpoint allows five attempts per
  // email per minute, and a context per sample would spend all of them.
  if (!ENABLED || !ACCOUNT || !NEEDS_ACCOUNT) return;
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  await signIn(context, baseURL!);
  storageState = await context.storageState();
  await context.close();
});

test.afterAll(async () => {
  if (!ENABLED || OUT === null) return;
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  // The table goes into the file because the runner prints it: a passing job then
  // still reports every number it measured and every surface it could not.
  const report = formatReport({
    budget,
    measurements: collected,
    baseline: baseline.recorded === null ? null : baseline,
  });
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        version: 1,
        recorded: new Date().toISOString().slice(0, 10),
        surfaces: collected,
        report,
      },
      null,
      2
    )}\n`,
    'utf8'
  );
});

/** The content measure's duration in this document, or `null` when it never landed. */
async function readContent(page: Page): Promise<number | null> {
  await page.waitForFunction(
    (name) => performance.getEntriesByName(name, 'measure').length > 0,
    APP_PERF_MEASURE.content,
    { timeout: 30_000 }
  );
  return page.evaluate((name) => {
    const [entry] = performance.getEntriesByName(name, 'measure');
    return entry ? Math.round(entry.duration) : null;
  }, APP_PERF_MEASURE.content);
}

/** The retained tap measure: one entry, replaced by the next tap. */
async function readTap(page: Page): Promise<number | null> {
  return page.evaluate((name) => {
    const [entry] = performance.getEntriesByName(name, 'measure');
    return entry ? Math.round(entry.duration) : null;
  }, APP_PERF_MEASURE.tap);
}

async function newContext(
  browser: Browser,
  serviceWorkers: 'allow' | 'block'
): Promise<BrowserContext> {
  return browser.newContext({ serviceWorkers, storageState });
}

/**
 * Cold: the network answers the document. The worker is blocked so nothing can
 * serve the shell from Cache Storage and the number stays honestly cold; a fresh
 * context per sample keeps the document out of the memory cache too.
 */
async function coldSample(
  browser: Browser,
  surface: PaintSurface,
  baseURL: string
): Promise<number | null> {
  const context = await newContext(browser, 'block');
  try {
    const page = await context.newPage();
    await page.goto(`${baseURL}${surface.path}`, { waitUntil: 'domcontentloaded' });
    // A mark that never lands is reported as a missing number by the rules, not
    // as a 30-second timeout that says nothing about which surface broke.
    try {
      return await readContent(page);
    } catch {
      return null;
    }
  } finally {
    await context.close();
  }
}

/** Warm: the worker has the shell, the radio is off, and the document reloads. */
async function warmSamples(
  browser: Browser,
  surface: PaintSurface,
  baseURL: string
): Promise<{ warm: number[]; tap: number[] }> {
  const context = await newContext(browser, 'allow');
  const warm: number[] = [];
  const tap: number[] = [];
  try {
    const page = await context.newPage();
    await gotoUnderWorkerControl(page, `${baseURL}${surface.path}`);
    await readContent(page);

    for (let sample = 0; sample < SAMPLES; sample += 1) {
      await context.setOffline(true);
      await page.reload({ waitUntil: 'domcontentloaded' });
      let value: number | null = null;
      try {
        value = await readContent(page);
      } catch {
        // No shell, no mark: the rules say "no warm content mark", which names
        // the surface instead of a timeout.
        value = null;
      }
      await context.setOffline(false);
      // The first sample pays the worker's install and the store's first seed.
      if (sample > 0 && value !== null) warm.push(value);
    }

    if (surface.tap) {
      for (let run = 0; run < budget.runs; run += 1) {
        // A token per tap: the create needs a fresh code, and the same token is
        // what the cleanup URL below deletes.
        const token = `${Date.now().toString(36)}${run}`;
        // The measure survives the previous tap, so clear it first — otherwise
        // the wait below returns the old number and the gate measures nothing.
        await page.evaluate((name) => performance.clearMeasures(name), APP_PERF_MEASURE.tap);

        for (const step of surface.tap.steps) {
          const value = (step.value ?? '').replace('{{run}}', token);
          if (step.action === 'fill') await page.fill(step.target, value);
          else await page.click(step.target);
        }

        // The measure lands on the first frame after the optimistic update.
        await page.waitForFunction(
          (name) => performance.getEntriesByName(name, 'measure').length > 0,
          APP_PERF_MEASURE.tap,
          { timeout: 15_000 }
        );
        const value = await readTap(page);
        if (value !== null) tap.push(value);

        // Leave the account as the run found it: the tap created a real record.
        if (surface.tap.cleanup) {
          const url = surface.tap.cleanup.replace('{{run}}', token);
          await context.request.fetch(`${baseURL}${url}`, { method: 'DELETE', data: {} });
        }
      }
    }
  } finally {
    await context.close();
  }

  return { warm, tap };
}

for (const surface of budget.surfaces) {
  test(`${surface.id} paints within its budget`, async ({ browser, baseURL }) => {
    test.skip(
      surface.auth === true && !ACCOUNT,
      'needs E2E_TEST_EMAIL and E2E_TEST_PASSWORD for the owned surface'
    );
    test.setTimeout(240_000);

    const url = baseURL!;
    const cold: number[] = [];
    for (let run = 0; run < SAMPLES; run += 1) {
      const value = await coldSample(browser, surface, url);
      if (run > 0 && value !== null) cold.push(value);
    }

    const { warm, tap } = await warmSamples(browser, surface, url);

    const measured: PaintMeasurement = {
      cold: median(cold),
      warm: median(warm),
      tap: surface.tap ? median(tap) : null,
    };
    collected[surface.id] = measured;

    test.info().annotations.push({
      type: 'paint',
      description: `${surface.id}: cold ${measured.cold ?? '—'} ms, warm ${measured.warm ?? '—'} ms, tap ${measured.tap ?? '—'} ms`,
    });

    const violations = evaluate({
      surface,
      measured,
      baseline: baseline.recorded === null ? null : baseline,
      regressionPct: budget.regressionPct,
    });
    expect(violations, violations.join('\n')).toEqual([]);
  });
}
