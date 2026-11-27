#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import {
  extractAssets,
  normalizeRoute,
  resolveWeightRoutes,
  checkWeightCoverage,
  resolveBudgetRoutes,
  transferredSize,
} from './perf-baseline.mjs';

/**
 * Prices the scripts a browser fetches *after* the document's own script list.
 *
 * `perf-baseline.mjs` reads `<script src>` from the HTML, which is a faithful
 * first-request proxy but misses every chunk a lazy import pulls in later. The
 * client error reporter used to be exactly such a chunk: requested on an idle
 * callback, 148.8 KB gzip, absent from every document's script list and
 * therefore invisible to every weight gate in the repository (#1820).
 *
 * This tool loads each surface from `perf/surfaces.json` in a fresh Chromium
 * context (no service worker, no warm cache), records every same-origin script
 * response with its gzip bytes, and splits the responses by provenance: a URL
 * the document references is `documentJs` (the number `perf:weight` already
 * prices), everything else is `afterLoadJs`. `totalJs` is their sum. The
 * ceiling lives in `perf/runtime-weight.json`, in the same gzip KB unit as
 * `perf/budget.json`, so a future lazy import cannot grow unseen.
 *
 * ```bash
 * npm run perf:runtime                 # report only
 * npm run perf:runtime -- --check      # exit 1 above a ceiling (CI)
 * npm run perf:runtime -- --update     # re-record the measured values
 * ```
 */

const KB = 1024;
const DEFAULT_ORIGIN = 'https://royaraqamia.com';
const DEFAULT_SETTLE_MS = 3500; // the old reporter used a 3000 ms idle timeout
const DEFAULT_VIEWPORT = { width: 393, height: 852 };
const NETWORK_ATTEMPTS = 7;
const RETRY_BASE_MS = 1000;
// Keep the three-at-a-time pace: the committed ceilings were recorded with it.
// Serial visits load more lazy chunks inside the settle window and price
// `/downloader` 73 KB higher, which trips a budget the live origin does not
// exceed. A transient 5xx is handled by the retry loop instead.
const DEFAULT_CONCURRENCY = 3;

/** A status is diagnostic only: fake browsers in tests need not implement it. */
function responseStatus(response) {
  return typeof response?.status === 'function' ? response.status() : null;
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`Could not parse ${path}: ${error.message}`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A script response, reduced to the fields the gate needs. */
export function scriptEntry(response) {
  return {
    url: response.url(),
    pathname: new URL(response.url()).pathname,
    inDocument: false,
    reporter: false,
  };
}

/**
 * Splits script responses by the document's own `<script src>` list. A chunk
 * named in the HTML is already priced by `perf:weight`; a chunk requested on
 * idle or by an import is the new, post-paint surface.
 *
 * A script is a reporter when its body matches one of the configured matchers.
 * A matcher is a list of strings that must all be present: a flat string is
 * accepted as a one-element matcher. The matchers live in the artifact rather
 * than in code so a vendor change does not need a code change, and reading the
 * body avoids depending on the chunk's content-hash filename. Several markers
 * are required because the Next client chunk carries the DSN and
 * `captureException` too, but is not the SDK.
 */
export function classifyScripts(entries, documentScripts, reporterMatchers = []) {
  const matchers = reporterMatchers.map((matcher) =>
    Array.isArray(matcher) ? matcher : [matcher]
  );
  return entries.map((entry) => {
    const isReporter = matchers.some((markers) =>
      markers.every((needle) => entry.body?.includes(needle))
    );
    return {
      ...entry,
      inDocument: documentScripts.includes(entry.pathname),
      reporter: isReporter,
    };
  });
}

export function summarizeRuntime(entries) {
  const sum = (list) => list.reduce((total, entry) => total + entry.gzip, 0);
  const documentJs = sum(entries.filter((entry) => entry.inDocument));
  const afterLoadJs = sum(entries.filter((entry) => !entry.inDocument));
  return {
    documentJs,
    afterLoadJs,
    totalJs: documentJs + afterLoadJs,
    reporter: sum(entries.filter((entry) => entry.reporter)),
  };
}

function kb(bytes) {
  return `${(bytes / KB).toFixed(1)} KB`;
}

export function formatRuntimeVerdict(results, artifact, weightSamples = {}) {
  const routes = resolveBudgetRoutes(artifact?.routes, weightSamples);
  const limitFor = (route) => ({
    ...(artifact?.default ?? {}),
    ...routes[normalizeRoute(route)],
  });
  const lines = ['', 'Runtime weight'];
  let okCount = 0;
  for (const result of results) {
    const ceiling = limitFor(result.route).ceiling;
    const actual = result.summary.afterLoadJs / KB;
    const priced = typeof ceiling === 'number' ? ceiling : null;
    const ok = priced === null || actual <= priced;
    if (ok) okCount += 1;
    const reporter = result.summary.reporter > 0 ? `  reporter ${kb(result.summary.reporter)}` : '';
    lines.push(
      `  ${result.route.padEnd(28)} documentJs ${kb(result.summary.documentJs).padEnd(10)} ` +
        `afterLoadJs ${kb(result.summary.afterLoadJs).padEnd(10)} ` +
        `totalJs ${kb(result.summary.totalJs).padEnd(10)} ` +
        `ceiling ${priced === null ? '—' : `${priced} KB`} ${ok ? 'OK' : 'OVER'}${reporter}`
    );
  }
  lines.push(
    `\n${okCount} OK, ${results.length - okCount} over budget across ${results.length} route(s)`
  );
  return lines.join('\n');
}

/**
 * The single gate on the artifact: a surface's after-load JS has to stay under
 * its committed ceiling. A route with no ceiling is reported but not gated,
 * the same rule `checkBudget` uses for an unconstrained metric.
 */
export function checkRuntimeBudget(result, artifact, weightSamples = {}) {
  const routes = resolveBudgetRoutes(artifact?.routes, weightSamples);
  const ceiling = {
    ...(artifact?.default ?? {}),
    ...routes[normalizeRoute(result.route)],
  }.ceiling;
  if (typeof ceiling !== 'number') return { ok: true, ceiling: null, actualKb: null };
  const actualKb = result.summary.afterLoadJs / KB;
  return { ok: actualKb <= ceiling, ceiling, actualKb };
}

/** Measure one document in a fresh browser context. `browser` is injectable so
    the pure measurement path is unit-testable without launching Chromium. */
export async function measureRuntimeRoute(
  route,
  {
    origin = DEFAULT_ORIGIN,
    browser,
    settleMs = DEFAULT_SETTLE_MS,
    viewport = DEFAULT_VIEWPORT,
    reporterMatchers = [],
    probeError = false,
    attempts = NETWORK_ATTEMPTS,
    sleepFn = sleep,
  } = {}
) {
  const normalized = normalizeRoute(route);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) await sleepFn(RETRY_BASE_MS * 2 ** (attempt - 2));
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 2.75,
      isMobile: true,
      hasTouch: true,
      locale: 'ar',
      serviceWorkers: 'block',
    });
    try {
      // A page that fails during measurement must not post a synthetic event
      // to the real reporter. The tunnel is same-origin, so blocking it keeps
      // the probe private without touching the SDK's download path.
      await context.route('**/monitoring', (route) => route.abort());
      const page = await context.newPage();
      const responses = [];
      const navigationResponses = [];
      page.on('response', (response) => {
        if (response.request().isNavigationRequest()) {
          // A chain of redirects produces several navigation responses and
          // only one carries a document body. Price the document the visitor
          // actually received, as the live document gate does.
          navigationResponses.push(response);
          return;
        }
        if (response.request().resourceType() !== 'script') return;
        const url = new URL(response.url());
        if (url.origin !== new URL(origin).origin) return;
        responses.push(response);
      });

      await page.goto(new URL(normalized, origin).href, {
        waitUntil: 'load',
        timeout: 60_000,
      });
      // Lazy chunks are scheduled after load. The old reporter's idle callback
      // had a 3000 ms timeout, so the window has to outlast it for the gate to
      // see what a clean visit really downloads.
      await page.waitForTimeout(settleMs);

      const entries = await Promise.all(
        responses.map(async (response) => {
          const entry = scriptEntry(response);
          const body = Buffer.from(await response.body());
          return { ...entry, body: body.toString('utf8'), gzip: transferredSize(body) };
        })
      );
      // The final navigation carries the status of the document the visitor
      // got, even when the edge answers with an empty body. Do not wait for a
      // parseable HTML body to learn that the origin returned a 5xx.
      const documentStatus = responseStatus(navigationResponses[navigationResponses.length - 1]);
      const finalUrl = page.url();
      // A 5xx from the origin is not a 0 KB route: under load the edge serves
      // script-less error pages. Name it and retry rather than price it.
      if (documentStatus !== null && documentStatus >= 500) {
        throw new Error(
          `Origin returned HTTP ${documentStatus} for ${normalized} (final URL ${finalUrl})`
        );
      }
      let documentHtml = '';
      for (let index = navigationResponses.length - 1; index >= 0 && !documentHtml; index -= 1) {
        try {
          const html = await navigationResponses[index].text();
          if (/<html|<!doctype/i.test(html)) documentHtml = html;
        } catch {
          // Redirect responses have no body; an earlier one may still.
        }
      }
      if (!documentHtml) documentHtml = await page.content();
      const documentScripts = extractAssets(documentHtml).scripts;
      const classified = classifyScripts(entries, documentScripts, reporterMatchers);
      const summary = summarizeRuntime(classified);
      // A challenge page or a dropped connection can answer with no scripts at
      // all. That is not a 0 KB route; retry it in a fresh context like any
      // other transient failure so a silent miss cannot pass the gate.
      if (summary.totalJs === 0) {
        const status = documentStatus === null ? '' : `, document HTTP ${documentStatus}`;
        throw new Error(
          `No script responses observed for ${normalized} (final URL ${finalUrl}${status})`
        );
      }

      let reporterOnError = summary.reporter;
      if (probeError && reporterOnError === 0) {
        const probeResponses = [];
        const probe = (response) => {
          if (
            response.request().resourceType() === 'script' &&
            new URL(response.url()).origin === new URL(origin).origin
          ) {
            probeResponses.push(response);
          }
        };
        page.on('response', probe);
        await page.evaluate(() => {
          window.dispatchEvent(new ErrorEvent('error', { error: new Error('perf-runtime-probe') }));
        });
        await page.waitForTimeout(1200);
        page.off('response', probe);
        const bodies = await Promise.all(
          probeResponses.map((response) => response.body().catch(() => Buffer.alloc(0)))
        );
        reporterOnError = bodies
          .filter((body) =>
            reporterMatchers.some((matcher) =>
              (Array.isArray(matcher) ? matcher : [matcher]).every((needle) =>
                body.toString('utf8').includes(needle)
              )
            )
          )
          .reduce((total, body) => total + transferredSize(body), 0);
      }

      return {
        route: normalized,
        finalUrl,
        budgetRoute:
          normalizeRoute(new URL(finalUrl).pathname) === normalized
            ? null
            : normalizeRoute(new URL(finalUrl).pathname),
        scripts: classified.map(({ body, ...entry }) => entry),
        summary,
        reporterOnError,
      };
    } catch (error) {
      lastError = error;
    } finally {
      await context.close();
    }
  }
  throw lastError ?? new Error(`Could not measure ${normalized}`);
}

function parseArgs(argv) {
  const args = {
    origin: process.env.PERF_ORIGIN ?? DEFAULT_ORIGIN,
    surfacesPath: 'perf/surfaces.json',
    artifactPath: 'perf/runtime-weight.json',
    routes: [],
    settleMs: DEFAULT_SETTLE_MS,
    concurrency: DEFAULT_CONCURRENCY,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case '--origin':
        args.origin = value;
        i += 1;
        break;
      case '--surfaces':
        args.surfacesPath = value;
        i += 1;
        break;
      case '--budget':
      case '--artifact':
        args.artifactPath = value;
        i += 1;
        break;
      case '--routes':
        args.routes = String(value ?? '')
          .split(',')
          .map((route) => route.trim())
          .filter(Boolean);
        i += 1;
        break;
      case '--settle':
        args.settleMs = Number(value);
        i += 1;
        break;
      case '--concurrency':
        args.concurrency = Number(value);
        i += 1;
        break;
      case '--check':
        args.check = true;
        break;
      case '--json':
        args.json = true;
        break;
      case '--update':
        args.update = true;
        break;
      case '--probe-error':
        args.probeError = true;
        break;
      default:
        break;
    }
  }
  return args;
}

async function mapWithLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

function measuredRow(result, previous = {}) {
  return {
    ...previous,
    documentJsGzipKb: Number((result.summary.documentJs / KB).toFixed(1)),
    afterLoadGzipKb: Number((result.summary.afterLoadJs / KB).toFixed(1)),
    totalJsGzipKb: Number((result.summary.totalJs / KB).toFixed(1)),
    reporterGzipKb: Number((result.summary.reporter / KB).toFixed(1)),
    reporterUrls: result.scripts.filter((script) => script.reporter).map((script) => script.url),
    reporterOnErrorGzipKb: Number(
      ((result.reporterOnError ?? result.summary.reporter) / KB).toFixed(1)
    ),
    measuredAt: new Date().toISOString(),
  };
}

async function run(argv) {
  const args = parseArgs(argv);
  const matrix = readJson(args.surfacesPath, null);
  if (!matrix) throw new Error(`Could not read ${args.surfacesPath}`);
  const artifact = readJson(args.artifactPath, {}) ?? {};

  const resolved = args.routes.length
    ? {
        routes: args.routes.map((route) => ({
          route: normalizeRoute(route),
          surface: '-',
          pattern: route,
        })),
        errors: [],
      }
    : resolveWeightRoutes(matrix);
  if (resolved.errors.length > 0) {
    for (const error of resolved.errors) console.log(`  ${error}`);
    throw new Error(
      `${resolved.errors.length} surface route(s) cannot be priced — add weightSamples to ${args.surfacesPath}`
    );
  }

  console.log(`Runtime script weight from ${args.origin} (${resolved.routes.length} route(s))`);
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const failures = [];
  try {
    await mapWithLimit(
      resolved.routes,
      Math.max(1, args.concurrency),
      async ({ route, surface }) => {
        try {
          const measured = await measureRuntimeRoute(route, {
            origin: args.origin,
            browser,
            settleMs: args.settleMs,
            reporterMatchers: artifact.reporter?.matchers ?? [],
            probeError: args.probeError,
          });
          results.push({ ...measured, surface });
        } catch (error) {
          failures.push({ route, surface, message: error.message });
        }
      }
    );
  } finally {
    await browser.close();
  }
  results.sort((a, b) => a.route.localeCompare(b.route));
  failures.sort((a, b) => a.route.localeCompare(b.route));

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          origin: args.origin,
          routes: results.map(({ route, surface, finalUrl, budgetRoute, scripts, summary }) => ({
            route,
            surface,
            finalUrl,
            budgetRoute,
            scripts,
            summary,
          })),
          failures,
        },
        null,
        2
      )
    );
  } else {
    console.log(formatRuntimeVerdict(results, artifact, matrix.weightSamples ?? {}));
    for (const failure of failures) {
      console.log(`  ${failure.route.padEnd(28)} ERROR ${failure.message}`);
    }
  }

  if (args.update) {
    const next = {
      ...artifact,
      origin: args.origin,
      measuredAt: new Date().toISOString(),
      routes: {
        ...(artifact.routes ?? {}),
        ...Object.fromEntries(
          results.map((result) => [
            result.route,
            measuredRow(result, artifact.routes?.[result.route] ?? {}),
          ])
        ),
      },
    };
    writeFileSync(args.artifactPath, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`\nWrote measurements to ${args.artifactPath} (${results.length} route(s)).`);
  }

  const missing = checkWeightCoverage(
    results,
    resolved.routes.map(({ route }) => route)
  );
  let failed = failures.length > 0;
  if (missing.length > 0) {
    console.log(
      `\nCoverage check failed: ${missing.length} route(s) in ${args.surfacesPath} were not priced: ${missing.join(', ')}`
    );
    failed = true;
  }
  for (const result of results) {
    const verdict = checkRuntimeBudget(result, artifact, matrix.weightSamples ?? {});
    if (!verdict.ok) failed = true;
  }

  if (failed && args.check) {
    console.log('\nRuntime weight check failed.');
    process.exitCode = 1;
  } else if (failed) {
    console.log('\nRuntime weight budget exceeded. Run with --check to fail the gate.');
  }
}

async function main(argv = process.argv.slice(2)) {
  try {
    await run(argv);
  } catch (error) {
    console.log(`\nperf-runtime-weight: ${error.message}`);
    process.exitCode = 1;
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) main();
