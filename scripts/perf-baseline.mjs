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
 */

export const CATEGORIES = ['html', 'js', 'css', 'fonts'];
export const INFORMATIONAL_CATEGORIES = ['legacy'];

const TAG_RE = /<(script|link)\b[^>]*>/gi;
const CSS_URL_RE = /url\(\s*(?:"([^"]+)"|'([^']+)'|([^)'"]+))\s*\)/gi;
const KB = 1024;

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
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

const BUDGET_METRICS = {
  totalGzipKb: 'total',
  jsGzipKb: 'js',
  cssGzipKb: 'css',
  htmlGzipKb: 'html',
  fontsGzipKb: 'fonts',
};

function routeOverrides(routes, route) {
  if (!routes) return {};
  for (const [key, value] of Object.entries(routes)) {
    if (normalizeRoute(key) === route) return value;
  }
  return {};
}

export function checkBudget(summary, budget, route) {
  const limits = {
    ...((budget && budget.default) ?? {}),
    ...routeOverrides(budget && budget.routes, route),
  };
  const violations = [];
  const checked = [];

  for (const [metric, category] of Object.entries(BUDGET_METRICS)) {
    const budgetKb = limits[metric];
    if (typeof budgetKb !== 'number') continue;
    const actualKb = summary[category].gzip / KB;
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

  return { route: normalized, htmlPath, summary: summarizeAssets(entries), entries };
}

export function measureRoutes(routes, opts) {
  return routes.map((route) => measureRoute(route, opts));
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
  const args = { routes: [], nextDir: '.next', publicDir: 'public' };
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
      case '--json':
        args.json = true;
        break;
      default:
        break;
    }
  }
  return args;
}

function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const budgetPath = args.budgetPath ?? 'perf/budget.json';
  const baselinePath = args.baselinePath ?? 'perf/baseline.json';

  const budget = readJson(budgetPath, null);
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
      const { ok, violations, checked } = checkBudget(summary, budget, route);
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

  if (failed && args.check) {
    console.log('\nBudget check failed.');
    process.exitCode = 1;
  }
}

function main(argv = process.argv.slice(2)) {
  try {
    run(argv);
  } catch (error) {
    console.log(`\nperf-baseline: ${error.message}`);
    process.exitCode = 1;
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) main();
