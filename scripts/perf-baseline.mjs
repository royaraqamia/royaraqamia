import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Measures the bytes the landing page (and any other built route) actually
 * ships, so every performance change in the program can be proven against a
 * recorded baseline and a budget.
 *
 * The measurement is a static read of the `next build` output rather than a
 * live request: the prerendered HTML for a route is parsed for its subresources
 * (`/_next/static/...`, `/fonts/...`), each one is resolved to the file on disk,
 * and raw + gzip sizes are totalled per category. That keeps the tool
 * deterministic and runnable in CI right after `npm run build`.
 *
 * `legacy` scripts (`<script nomodule>`) are reported separately and excluded
 * from the total: a modern browser never requests them, so folding the polyfill
 * chunk into the budget would misrepresent what low-end devices download.
 *
 * `--live` prices the same definitions against documents fetched from an origin
 * instead of disk. A route rendered per request has no `.html` artifact, so it
 * is invisible to the static mode; the live mode is how the surface matrix gets
 * a weight verdict. Both modes share `extractAssets`, `transferredSize` and
 * `summarizeAssets`, so a number means the same thing on either side.
 */

export const CATEGORIES = ['html', 'js', 'css', 'fonts'];
export const INFORMATIONAL_CATEGORIES = ['legacy'];

const TAG_RE = /<(script|link)\b[^>]*>/gi;
const CSS_URL_RE = /url\(\s*(?:"([^"]+)"|'([^']+)'|([^)'"]+))\s*\)/gi;
const KB = 1024;

function decodeEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function getAttr(tag, name) {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  if (!match) return null;
  return decodeEntities(match[2] ?? match[3] ?? '');
}

function hasAttr(tag, name) {
  return new RegExp(`(?:^|\\s)${name}(?=[\\s/>=])`, 'i').test(tag);
}

function isLocalPath(url) {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//');
}

function pushUnique(list, value) {
  if (value && !list.includes(value)) list.push(value);
}

function iterateTags(html) {
  const tags = [];
  TAG_RE.lastIndex = 0;
  let match;
  while ((match = TAG_RE.exec(html)) !== null) {
    tags.push({ name: match[1].toLowerCase(), raw: match[0] });
  }
  return tags;
}

export function extractAssets(html) {
  const scripts = [];
  const legacyScripts = [];
  const styles = [];
  const fontPreloads = [];

  for (const tag of iterateTags(html)) {
    if (tag.name === 'script') {
      const src = getAttr(tag.raw, 'src');
      if (!isLocalPath(src)) continue;
      if (hasAttr(tag.raw, 'nomodule')) pushUnique(legacyScripts, src);
      else pushUnique(scripts, src);
      continue;
    }

    const href = getAttr(tag.raw, 'href');
    if (!isLocalPath(href)) continue;
    const rel = (getAttr(tag.raw, 'rel') ?? '').toLowerCase();
    const as = (getAttr(tag.raw, 'as') ?? '').toLowerCase();

    if (rel === 'stylesheet') pushUnique(styles, href);
    else if (as === 'font') pushUnique(fontPreloads, href);
    else if (as === 'script' || rel === 'modulepreload') pushUnique(scripts, href);
  }

  return { scripts, legacyScripts, styles, fontPreloads };
}

/**
 * The legacy polyfill chunk Next injects into every prerendered page. It is
 * harmless only because it is gated behind `nomodule`: a browser that supports
 * ES modules — which is every browser in our traffic (ADR 0004) — never fetches
 * it, so it costs users nothing and is excluded from the budget total. The one
 * thing that would make it a real download is losing that gate, which is what
 * `checkLegacyGating` exists to catch.
 */
export function polyfillUrls(buildManifest) {
  return (buildManifest?.polyfillFiles ?? []).map(
    (file) => `/_next/${String(file).replace(/^\/+/, '')}`
  );
}

export function checkLegacyGating(assets, buildManifest) {
  const polyfills = polyfillUrls(buildManifest);
  const ungated = polyfills.filter((url) => assets.scripts.includes(url));
  const gated = polyfills.filter((url) => assets.legacyScripts.includes(url));
  return { ok: ungated.length === 0, polyfills, gated, ungated };
}

export function extractCssFontUrls(cssText, cssUrl) {
  const base = new URL(cssUrl, 'https://perf.local');
  const urls = [];
  CSS_URL_RE.lastIndex = 0;
  let match;
  while ((match = CSS_URL_RE.exec(cssText)) !== null) {
    const ref = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (!ref || /^(data|blob):/i.test(ref)) continue;
    if (!/\.woff2(\?|#|$)/i.test(ref)) continue;
    let resolved;
    try {
      resolved = new URL(ref, base);
    } catch {
      continue;
    }
    if (resolved.origin !== base.origin) continue;
    pushUnique(urls, resolved.pathname);
  }
  return urls;
}

export function resolveAssetPath(url, { nextDir, publicDir }) {
  if (!isLocalPath(url)) return null;
  if (url === '/_next/image' || url.startsWith('/_next/image?')) return null;

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url, 'https://perf.local').pathname);
  } catch {
    return null;
  }

  if (pathname.startsWith('/_next/')) return join(nextDir, pathname.slice('/_next/'.length));
  return join(publicDir, pathname.replace(/^\/+/, ''));
}

export function gzipSize(buffer) {
  return gzipSync(buffer).length;
}

/**
 * Bytes actually put on the wire for a single asset: the gzip size when
 * compression helps, otherwise the raw size. Servers skip compression for
 * already-compressed formats (woff2, images), so a naive gzip of a woff2
 * reports *more* than raw and would make the fonts budget meaningless.
 */
export function transferredSize(buffer) {
  return Math.min(gzipSize(buffer), buffer.length);
}

function emptyBucket() {
  return { raw: 0, gzip: 0, count: 0 };
}

export function summarizeAssets(entries) {
  const buckets = {};
  const bucketFor = (kind) => (buckets[kind] ??= emptyBucket());

  for (const kind of [...CATEGORIES, ...INFORMATIONAL_CATEGORIES]) bucketFor(kind);
  for (const entry of entries) {
    const bucket = bucketFor(entry.kind);
    bucket.raw += entry.raw;
    bucket.gzip += entry.gzip;
    bucket.count += 1;
  }

  const total = emptyBucket();
  for (const kind of CATEGORIES) {
    total.raw += buckets[kind].raw;
    total.gzip += buckets[kind].gzip;
    total.count += buckets[kind].count;
  }

  return { ...buckets, total };
}

export function compareToBaseline(summary, baseline) {
  if (!baseline) return null;
  const deltas = {};
  for (const kind of [...CATEGORIES, ...INFORMATIONAL_CATEGORIES, 'total']) {
    const before = baseline[kind] ?? emptyBucket();
    const after = summary[kind] ?? emptyBucket();
    deltas[kind] = {
      rawDelta: after.raw - before.raw,
      gzipDelta: after.gzip - before.gzip,
      gzipPct: before.gzip === 0 ? 0 : ((after.gzip - before.gzip) / before.gzip) * 100,
    };
  }
  return deltas;
}

/* Every metric names the category it prices and the number it reads. `cssRawKb`
   is the one raw ceiling: stylesheets are the category whose *uncompressed*
   size the parser actually pays for, which is what the per-surface split in
   #497 is measured in (gzip hides a 500 KB sheet at 60 KB). */
const BUDGET_METRICS = {
  totalGzipKb: { category: 'total', field: 'gzip' },
  jsGzipKb: { category: 'js', field: 'gzip' },
  cssGzipKb: { category: 'css', field: 'gzip' },
  cssRawKb: { category: 'css', field: 'raw' },
  htmlGzipKb: { category: 'html', field: 'gzip' },
  fontsGzipKb: { category: 'fonts', field: 'gzip' },
};

function sampleRoutes(value) {
  if (value == null) return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .filter((sample) => typeof sample === 'string' && sample.trim())
    .map((sample) => normalizeRoute(sample));
}

/**
 * A budget key is either an exact path or a dynamic pattern. A pattern is
 * expanded through the matrix's `weightSamples` so every concrete sample of
 * that pattern is held to the same ceiling; exact keys are applied last and
 * therefore always win. The samples live in `perf/surfaces.json` rather than
 * being duplicated here, so the gate prices the same paths it resolves for
 * coverage.
 */
export function resolveBudgetRoutes(routes, weightSamples = {}) {
  const resolved = {};
  const entries = Object.entries(routes ?? {});
  for (const [key, value] of entries) {
    const normalized = normalizeRoute(key);
    if (!/\[[^\]]+\]/.test(normalized)) continue;
    const samples = weightSamples[key] ?? weightSamples[normalized];
    for (const sample of sampleRoutes(samples)) resolved[sample] = value;
  }
  for (const [key, value] of entries) {
    const normalized = normalizeRoute(key);
    if (/\[[^\]]+\]/.test(normalized)) continue;
    resolved[normalized] = value;
  }
  return resolved;
}

export function checkBudget(summary, budget, route, weightSamples) {
  const limits = {
    ...((budget && budget.default) ?? {}),
    ...resolveBudgetRoutes(budget && budget.routes, weightSamples)[normalizeRoute(route)],
  };
  const violations = [];
  const checked = [];

  for (const [metric, { category, field }] of Object.entries(BUDGET_METRICS)) {
    const budgetKb = limits[metric];
    if (typeof budgetKb !== 'number') continue;
    const actualKb = summary[category][field] / KB;
    checked.push({ metric, budgetKb, actualKb });
    if (actualKb > budgetKb) violations.push({ metric, budgetKb, actualKb });
  }

  return { ok: violations.length === 0, violations, checked };
}

function normalizeRoute(route) {
  const trimmed = (route ?? '/').split('?')[0].split('#')[0].trim();
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+$/, '') || '/';
}

function routeToHtmlPath(route, nextDir) {
  const normalized = normalizeRoute(route);
  const rel = normalized === '/' ? 'index' : normalized.replace(/^\//, '');
  return join(nextDir, 'server', 'app', `${rel}.html`);
}

function measureUrl(url, kind, opts) {
  const path = resolveAssetPath(url, opts);
  if (!path) return null;
  if (!existsSync(path)) return { url, kind, path, raw: 0, gzip: 0, missing: true };
  const buffer = readFileSync(path);
  return { url, kind, path, raw: buffer.length, gzip: transferredSize(buffer), missing: false };
}

export function measureRoute(route, { nextDir = '.next', publicDir = 'public' } = {}) {
  const opts = { nextDir, publicDir };
  const normalized = normalizeRoute(route);
  const htmlPath = routeToHtmlPath(normalized, nextDir);

  if (!existsSync(htmlPath)) {
    throw new Error(
      `Cannot measure "${normalized}": ${htmlPath} does not exist. ` +
        `Run \`npm run build\` first, or the route was never built statically.`
    );
  }

  const htmlBuffer = readFileSync(htmlPath);
  const assets = extractAssets(htmlBuffer.toString('utf8'));

  const entries = [
    {
      url: normalized,
      kind: 'html',
      path: htmlPath,
      raw: htmlBuffer.length,
      gzip: transferredSize(htmlBuffer),
    },
  ];

  const specs = [
    ...assets.scripts.map((url) => ({ url, kind: 'js' })),
    ...assets.styles.map((url) => ({ url, kind: 'css' })),
    ...assets.fontPreloads.map((url) => ({ url, kind: 'fonts' })),
    ...assets.legacyScripts.map((url) => ({ url, kind: 'legacy' })),
  ];

  for (const cssUrl of assets.styles) {
    const cssPath = resolveAssetPath(cssUrl, opts);
    if (!cssPath || !existsSync(cssPath)) continue;
    for (const fontUrl of extractCssFontUrls(readFileSync(cssPath, 'utf8'), cssUrl)) {
      if (!specs.some((spec) => spec.kind === 'fonts' && spec.url === fontUrl)) {
        specs.push({ url: fontUrl, kind: 'fonts' });
      }
    }
  }

  for (const spec of specs) {
    const measured = measureUrl(spec.url, spec.kind, opts);
    if (measured) entries.push(measured);
  }

  const missing = entries.filter((entry) => entry.missing);
  if (missing.length > 0) {
    const list = missing.map((entry) => `${entry.url} -> ${entry.path}`).join('\n  ');
    throw new Error(
      `Stale or incompatible build: the HTML references ${missing.length} asset(s) that are not ` +
        `on disk. Re-run \`npm run build\`.\n  ${list}`
    );
  }

  return { route: normalized, htmlPath, assets, summary: summarizeAssets(entries), entries };
}

export function measureRoutes(routes, opts) {
  return routes.map((route) => measureRoute(route, opts));
}

/* Live-document mode ------------------------------------------------------- */

/** Run a bounded number of async workers; assets are fetched in parallel but a
    fifty-route matrix must not open fifty connections per document. */
async function mapWithLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Fetch a URL as the bytes the file actually holds. `Accept-Encoding: identity`
 * asks the server not to compress; `fetch` decodes anything it sends anyway, so
 * the body here is raw and `transferredSize` remains the single place
 * compression is applied — just as it is for a build artifact read from disk.
 */
export async function fetchRaw(url, { timeoutMs = 20000 } = {}) {
  const response = await fetch(url, {
    headers: { 'accept-encoding': 'identity', 'user-agent': 'royaraqamia-perf/1' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText || ''} for ${url}`.trim());
  }
  return { raw: Buffer.from(await response.arrayBuffer()), url: response.url };
}

/** Price a fetched document with exactly the same buckets as a built one. */
export async function measureLiveRoute(
  route,
  { origin = 'https://royaraqamia.com', cache = new Map(), concurrency = 8 } = {}
) {
  const normalized = normalizeRoute(route);
  const originUrl = new URL(origin);
  const get = async (url) => {
    const key = new URL(url, originUrl).href;
    if (!cache.has(key)) {
      cache.set(
        key,
        fetchRaw(key).catch((error) => {
          cache.delete(key);
          throw error;
        })
      );
    }
    return cache.get(key);
  };

  const document = await get(new URL(normalized, originUrl).href);
  const assets = extractAssets(document.raw.toString('utf8'));

  const entries = [
    {
      url: normalized,
      kind: 'html',
      raw: document.raw.length,
      gzip: transferredSize(document.raw),
    },
  ];

  const specs = [
    ...assets.scripts.map((url) => ({ url, kind: 'js' })),
    ...assets.styles.map((url) => ({ url, kind: 'css' })),
    ...assets.fontPreloads.map((url) => ({ url, kind: 'fonts' })),
    ...assets.legacyScripts.map((url) => ({ url, kind: 'legacy' })),
  ];

  // Fonts named inside a stylesheet are part of the document's first load, the
  // same way the static mode discovers them inside the on-disk CSS file.
  for (const cssUrl of assets.styles) {
    const css = await get(cssUrl);
    for (const fontUrl of extractCssFontUrls(css.raw.toString('utf8'), cssUrl)) {
      if (!specs.some((spec) => spec.kind === 'fonts' && spec.url === fontUrl)) {
        specs.push({ url: fontUrl, kind: 'fonts' });
      }
    }
  }

  const measured = await mapWithLimit(specs, concurrency, async (spec) => {
    const asset = await get(spec.url);
    return {
      url: spec.url,
      kind: spec.kind,
      raw: asset.raw.length,
      gzip: transferredSize(asset.raw),
    };
  });
  entries.push(...measured);

  return {
    route: normalized,
    htmlPath: null,
    finalUrl: document.url,
    assets,
    summary: summarizeAssets(entries),
    entries,
  };
}

/**
 * The concrete paths the weight gate prices, derived from the surface matrix.
 * A dynamic segment needs a published `weightSamples` entry; a new pattern
 * without one fails the check instead of silently dropping out of the gate.
 * A sample can be a single path or a list: a pattern whose cost moves with a
 * segment (the surah reader) prices every published sample, so the lightest
 * and heaviest members share one ceiling rather than one lucky member hiding
 * the rest.
 */
export function resolveWeightRoutes(matrix) {
  const samples = matrix?.weightSamples ?? {};
  const routes = [];
  const errors = [];
  const seen = new Set();

  for (const surface of matrix?.surfaces ?? []) {
    const declared = [
      ...(surface.routes ?? []),
      ...(typeof surface.prefix === 'string' ? [`${surface.prefix}/**`] : []),
    ];
    for (const pattern of declared) {
      const route = pattern.replace(/\/\*\*$/, '');
      const declaredSamples = sampleRoutes(samples[route]);
      const paths = declaredSamples.length > 0 ? declaredSamples : sampleRoutes(route);
      if (/\[[^\]]+\]/.test(route) && declaredSamples.length === 0) {
        errors.push(
          `surface "${surface.id}": ${route} has no weightSamples entry in perf/surfaces.json`
        );
        continue;
      }
      for (const path of paths) {
        if (seen.has(path)) continue;
        seen.add(path);
        routes.push({ route: path, surface: surface.id, pattern });
      }
    }
  }

  return { routes, errors };
}

export function checkWeightCoverage(results, expectedRoutes) {
  const measured = new Set(results.map((result) => result.route));
  return expectedRoutes.filter((route) => !measured.has(route));
}

function kb(bytes) {
  return `${(bytes / KB).toFixed(1)} KB`;
}

function signedKb(bytes) {
  const sign = bytes > 0 ? '+' : bytes < 0 ? '-' : '';
  return `${sign}${(Math.abs(bytes) / KB).toFixed(1)} KB`;
}

export function formatReport(results, baselineByRoute) {
  const lines = [];
  for (const { route, summary } of results) {
    const deltas = compareToBaseline(summary, baselineByRoute[route] ?? null);
    lines.push(`\n${route}`);
    lines.push('  category   raw       gzip      delta');
    for (const kind of [...CATEGORIES, ...INFORMATIONAL_CATEGORIES]) {
      const bucket = summary[kind];
      if (bucket.count === 0) continue;
      const delta = deltas ? signedKb(deltas[kind].gzipDelta) : '—';
      lines.push(
        `  ${kind.padEnd(9)}  ${kb(bucket.raw).padEnd(9)} ${kb(bucket.gzip).padEnd(9)} ${delta}`
      );
    }
    const totalDelta = deltas ? signedKb(deltas.total.gzipDelta) : '—';
    lines.push(
      `  ${'TOTAL'.padEnd(9)}  ${kb(summary.total.raw).padEnd(9)} ${kb(summary.total.gzip).padEnd(9)} ${totalDelta}`
    );
    if (summary.legacy.count > 0) {
      lines.push(`  (legacy excluded from TOTAL: ${kb(summary.legacy.gzip)} gzip)`);
    }
  }
  return lines.join('\n');
}

export function formatWeightVerdict(results, budget, weightSamples) {
  const lines = ['\nWeight verdict'];
  let okCount = 0;
  for (const { route, summary, budgetRoute } of results) {
    // A route that redirects is priced against the document it actually serves;
    // its own ceiling would describe bytes this response never ships.
    const priced = budgetRoute ?? route;
    const { ok, violations, checked } = checkBudget(summary, budget, priced, weightSamples);
    const js = checked.find((metric) => metric.metric === 'jsGzipKb');
    const size = js ? `${js.actualKb.toFixed(1)}/${js.budgetKb} KB` : '—';
    const verdict = ok
      ? 'OK'
      : violations.map((v) => `${v.metric} ${v.actualKb.toFixed(1)}/${v.budgetKb}`).join(', ');
    if (ok) okCount += 1;
    const redirect = priced !== route ? ` (-> ${priced})` : '';
    lines.push(`  ${route.padEnd(28)} js ${size.padEnd(14)} ${verdict}${redirect}`);
  }
  lines.push(
    `\n${okCount} OK, ${results.length - okCount} over budget across ${results.length} route(s)`
  );
  return lines.join('\n');
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    // Strip a UTF-8 BOM: Windows editors and PowerShell's Set-Content add one,
    // and JSON.parse rejects it as an unexpected token.
    return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`Could not parse ${path}: ${error.message}`);
  }
}

function resolveRoutes(args, budget) {
  if (args.routes.length) return args.routes;
  if (budget?.measure?.length) return budget.measure;
  const configured = Object.keys(budget?.routes ?? {});
  return configured.length ? configured : ['/'];
}

function parseArgs(argv) {
  const args = {
    routes: [],
    nextDir: '.next',
    publicDir: 'public',
    live: false,
    origin: process.env.PERF_ORIGIN ?? 'https://royaraqamia.com',
    surfacesPath: 'perf/surfaces.json',
    concurrency: 10,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case '--routes':
        args.routes = String(value ?? '')
          .split(',')
          .map((route) => route.trim())
          .filter(Boolean);
        i += 1;
        break;
      case '--next-dir':
        args.nextDir = value;
        i += 1;
        break;
      case '--public-dir':
        args.publicDir = value;
        i += 1;
        break;
      case '--budget':
        args.budgetPath = value;
        i += 1;
        break;
      case '--baseline':
        args.baselinePath = value;
        i += 1;
        break;
      case '--update-baseline':
        args.updateBaseline = true;
        break;
      case '--check':
        args.check = true;
        break;
      case '--live':
        args.live = true;
        break;
      case '--origin':
        args.origin = value;
        i += 1;
        break;
      case '--surfaces':
        args.surfacesPath = value;
        i += 1;
        break;
      case '--concurrency':
        args.concurrency = Number(value);
        i += 1;
        break;
      case '--json':
        args.json = true;
        break;
      default:
        break;
    }
  }
  return args;
}

async function runLive(args, budget) {
  const matrix = args.routes.length ? null : readJson(args.surfacesPath, null);
  if (!args.routes.length && !matrix) throw new Error(`Could not read ${args.surfacesPath}`);
  // With --routes the matrix is not used to pick paths, but a pattern key in
  // the budget still has to resolve through the same samples.
  const weightSamples =
    matrix?.weightSamples ?? readJson(args.surfacesPath, null)?.weightSamples ?? {};

  const { routes, errors } = matrix
    ? resolveWeightRoutes(matrix)
    : {
        routes: args.routes.map((route) => ({
          route: normalizeRoute(route),
          surface: '-',
          pattern: route,
        })),
        errors: [],
      };
  if (errors.length > 0) {
    for (const error of errors) console.log(`  ${error}`);
    throw new Error(
      `${errors.length} surface route(s) cannot be priced — add weightSamples to ${args.surfacesPath}`
    );
  }

  console.log(`Live document weight from ${args.origin} (${routes.length} route(s))`);
  const cache = new Map();
  const results = [];
  const failures = [];
  await mapWithLimit(routes, args.concurrency || 10, async ({ route, surface, pattern }) => {
    try {
      const measured = await measureLiveRoute(route, {
        origin: args.origin,
        cache,
        concurrency: 8,
      });
      const finalRoute = normalizeRoute(new URL(measured.finalUrl).pathname);
      results.push({
        ...measured,
        surface,
        pattern,
        budgetRoute: finalRoute === route ? null : finalRoute,
      });
    } catch (error) {
      failures.push({ route, surface, message: error.message });
    }
  });
  results.sort((a, b) => a.route.localeCompare(b.route));
  failures.sort((a, b) => a.route.localeCompare(b.route));

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          origin: args.origin,
          routes: results.map(({ route, surface, finalUrl, budgetRoute, summary }) => ({
            route,
            surface,
            finalUrl,
            budgetRoute,
            summary,
          })),
          failures,
        },
        null,
        2
      )
    );
  } else {
    console.log(formatWeightVerdict(results, budget, weightSamples));
    for (const failure of failures) {
      console.log(`  ${failure.route.padEnd(28)} ERROR ${failure.message}`);
    }
  }

  const missing = checkWeightCoverage(
    results,
    routes.map(({ route }) => route)
  );
  let failed = failures.length > 0;
  if (missing.length > 0) {
    console.log(
      `\nCoverage check failed: ${missing.length} route(s) in ${args.surfacesPath} were not priced: ${missing.join(', ')}`
    );
    failed = true;
  }
  for (const { route, summary, budgetRoute } of results) {
    if (!checkBudget(summary, budget, budgetRoute ?? route, weightSamples).ok) failed = true;
  }

  if (failed) {
    if (args.check) {
      console.log('\nWeight check failed.');
      process.exitCode = 1;
    } else {
      console.log(
        '\nWeight budget exceeded. Run with --check to fail the gate, or update perf/budget.json.'
      );
    }
  }
}

async function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const budgetPath = args.budgetPath ?? 'perf/budget.json';
  const baselinePath = args.baselinePath ?? 'perf/baseline.json';

  const budget = readJson(budgetPath, null);
  // Pattern keys in the budget are expanded through the same samples the live
  // gate uses, so a static route in a pattern is priced by its pattern ceiling.
  const weightSamples = readJson(args.surfacesPath, null)?.weightSamples ?? {};
  if (args.live) {
    await runLive(args, budget);
    return;
  }
  const baselineFile = readJson(baselinePath, null);
  const baselineByRoute = baselineFile?.routes ?? {};

  const routes = resolveRoutes(args, budget);

  const results = measureRoutes(routes, { nextDir: args.nextDir, publicDir: args.publicDir });

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          routes: results.map(({ route, summary }) => ({ route, summary })),
          baseline: baselineByRoute,
        },
        null,
        2
      )
    );
  } else {
    console.log(formatReport(results, baselineByRoute));
  }

  if (args.updateBaseline) {
    const next = {
      generatedAt: new Date().toISOString(),
      note: 'Program performance baseline. Regenerate with `npm run perf:baseline:update` after `npm run build`.',
      routes: Object.fromEntries(results.map(({ route, summary }) => [route, summary])),
    };
    writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`\nWrote baseline to ${baselinePath} (${results.length} route(s)).`);
  }

  let failed = false;
  if (budget) {
    console.log('\nBudget check');
    for (const { route, summary } of results) {
      const { ok, violations, checked } = checkBudget(summary, budget, route, weightSamples);
      if (checked.length === 0) {
        console.log(`  ${route}: no budget configured`);
        continue;
      }
      if (ok) {
        console.log(`  ${route}: OK (${checked.length} metric(s) within budget)`);
        continue;
      }
      failed = true;
      for (const violation of violations) {
        console.log(
          `  ${route}: ${violation.metric} ${violation.actualKb.toFixed(1)} KB exceeds budget ${violation.budgetKb} KB`
        );
      }
    }
    if (failed && !args.check) {
      console.log(
        '\nBudget exceeded. Run with --check to fail the build, or update perf/budget.json.'
      );
    }
  }

  let gatingFailed = false;
  const buildManifest = readJson(join(args.nextDir, 'build-manifest.json'), null);
  const polyfills = polyfillUrls(buildManifest);
  if (polyfills.length > 0) {
    console.log('\nLegacy polyfill gating');
    for (const { route, assets } of results) {
      const { ok, ungated } = checkLegacyGating(assets, buildManifest);
      if (ok) {
        console.log(`  ${route}: gated (nomodule) — not downloaded by any modern browser`);
        continue;
      }
      gatingFailed = true;
      for (const url of ungated) {
        console.log(
          `  ${route}: ${url} is loaded WITHOUT nomodule — it is now a blocking download`
        );
      }
    }
  }

  if (failed && args.check) {
    console.log('\nBudget check failed.');
    process.exitCode = 1;
  }

  if (gatingFailed) {
    console.log(
      '\nLegacy polyfill is no longer nomodule-gated. Restore the gate, or accept the cost and ' +
        'explain it in perf/budget.json.'
    );
    if (args.check) process.exitCode = 1;
  }
}

async function main(argv = process.argv.slice(2)) {
  try {
    await run(argv);
  } catch (error) {
    console.log(`\nperf-baseline: ${error.message}`);
    process.exitCode = 1;
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) main();
