import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import {
  extractAssets,
  extractCssFontUrls,
  resolveAssetPath,
  gzipSize,
  transferredSize,
  summarizeAssets,
  compareToBaseline,
  checkBudget,
  resolveBudgetRoutes,
  polyfillUrls,
  checkLegacyGating,
  measureRoute,
  fetchRaw,
  measureLiveRoute,
  resolveWeightRoutes,
  checkWeightCoverage,
  formatWeightVerdict,
} from '../perf-baseline.mjs';

const madeDirs = [];
const madeServers = [];

afterEach(async () => {
  while (madeDirs.length) rmSync(madeDirs.pop(), { recursive: true, force: true });
  while (madeServers.length) {
    await new Promise((resolve) => madeServers.pop().close(resolve));
  }
});

// Deterministic low-compressibility filler, so gzip totals land in a realistic
// range instead of collapsing to a handful of bytes on a perfect repeat.
function pseudoText(seed, length) {
  let out = '';
  let x = seed;
  while (out.length < length) {
    x = (x * 1103515245 + 12345) % 2147483648;
    out += x.toString(36);
  }
  return out.slice(0, length);
}

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'perf-baseline-'));
  madeDirs.push(root);
  const nextDir = join(root, '.next');
  const publicDir = join(root, 'public');
  mkdirSync(join(nextDir, 'server', 'app'), { recursive: true });
  mkdirSync(join(nextDir, 'static', 'chunks'), { recursive: true });
  mkdirSync(join(nextDir, 'static', 'media'), { recursive: true });
  mkdirSync(publicDir, { recursive: true });

  const bodies = {
    'chunks/app.js': pseudoText(1, 40000),
    'chunks/pre.js': pseudoText(2, 10000),
    'chunks/legacy.js': pseudoText(3, 45000),
    'chunks/styles.css': `@font-face{src:url(../media/font.woff2)}\n${pseudoText(4, 9000)}`,
    'media/font.woff2': pseudoText(5, 6000),
  };
  for (const [rel, body] of Object.entries(bodies)) {
    writeFileSync(join(nextDir, 'static', rel), body);
  }
  writeFileSync(join(publicDir, 'logo.webp'), pseudoText(6, 500));

  const html = [
    '<!DOCTYPE html><html><head>',
    '<link rel="preload" as="script" href="/_next/static/chunks/pre.js"/>',
    '<link rel="stylesheet" href="/_next/static/chunks/styles.css" data-precedence="next"/>',
    '<link rel="preload" href="/_next/static/media/font.woff2" as="font" crossorigin="" type="font/woff2"/>',
    '<link rel="preload" as="image" imageSrcSet="/_next/image?url=%2Flogo.webp&amp;w=48&amp;q=75 1x"/>',
    '<script src="https://cdn.example.com/analytics.js"></script>',
    '<script>self.__next_f.push([1,"inline"]);</script>',
    '<style>.x{color:red}</style>',
    '</head><body>',
    '<script src="/_next/static/chunks/app.js" async=""></script>',
    '<script src="/_next/static/chunks/app.js"></script>',
    '<script src="/_next/static/chunks/legacy.js" nomodule=""></script>',
    '</body></html>',
  ].join('\n');

  writeFileSync(join(nextDir, 'server', 'app', 'index.html'), html);
  return { root, nextDir, publicDir, html, bodies };
}

describe('extractAssets', () => {
  it('collects same-origin module scripts in document order, de-duplicated', () => {
    const { html } = makeFixture();
    expect(extractAssets(html).scripts).toEqual([
      '/_next/static/chunks/pre.js',
      '/_next/static/chunks/app.js',
    ]);
  });

  it('separates nomodule scripts so legacy-only downloads stay out of the modern total', () => {
    const { html } = makeFixture();
    const assets = extractAssets(html);
    expect(assets.legacyScripts).toEqual(['/_next/static/chunks/legacy.js']);
    expect(assets.scripts).not.toContain('/_next/static/chunks/legacy.js');
  });

  it('ignores inline scripts, inline styles and cross-origin scripts', () => {
    const { html } = makeFixture();
    const assets = extractAssets(html);
    expect(assets.scripts.every((u) => u.startsWith('/'))).toBe(true);
    expect(
      assets.scripts.some((u) => new URL(u, 'https://app.example').hostname === 'cdn.example.com')
    ).toBe(false);
    expect(assets.scripts.some((u) => u.includes('__next_f'))).toBe(false);
  });

  it('collects stylesheets and font preloads', () => {
    const { html } = makeFixture();
    const assets = extractAssets(html);
    expect(assets.styles).toEqual(['/_next/static/chunks/styles.css']);
    expect(assets.fontPreloads).toEqual(['/_next/static/media/font.woff2']);
  });

  it('does not treat the image optimizer URL as a shippable asset', () => {
    const { html } = makeFixture();
    const assets = extractAssets(html);
    expect(assets.styles).not.toContain('/_next/image?url=%2Flogo.webp&amp;w=48&amp;q=75 1x');
    expect(assets.fontPreloads.some((u) => u.startsWith('/_next/image'))).toBe(false);
  });
});

describe('extractCssFontUrls', () => {
  it('resolves a relative font URL against the stylesheet location', () => {
    expect(
      extractCssFontUrls('@font-face{src:url(../media/f.woff2)}', '/_next/static/chunks/s.css')
    ).toEqual(['/_next/static/media/f.woff2']);
  });

  it('handles quoted URLs and de-duplicates repeats', () => {
    const css = '@font-face{src:url("../media/f.woff2")}@font-face{src:url("../media/f.woff2")}';
    expect(extractCssFontUrls(css, '/_next/static/chunks/s.css')).toEqual([
      '/_next/static/media/f.woff2',
    ]);
  });

  it('keeps absolute font URLs and ignores non-font and data URLs', () => {
    const css =
      '@font-face{src:url("/fonts/root.woff2")} .a{background:url(data:image/png;base64,AAA)} .b{background:url(/img/bg.png)}';
    expect(extractCssFontUrls(css, '/_next/static/chunks/s.css')).toEqual(['/fonts/root.woff2']);
  });
});

describe('resolveAssetPath', () => {
  const opts = { nextDir: 'N', publicDir: 'P' };

  it('maps build assets and public assets to their on-disk locations', () => {
    expect(resolveAssetPath('/_next/static/chunks/app.js', opts)).toBe(
      join('N', 'static', 'chunks', 'app.js')
    );
    expect(resolveAssetPath('/logo.webp', opts)).toBe(join('P', 'logo.webp'));
  });

  it('strips query strings and hashes and decodes percent-encoding', () => {
    expect(resolveAssetPath('/fonts/x.woff2?ver=1', opts)).toBe(join('P', 'fonts', 'x.woff2'));
    expect(resolveAssetPath('/a%20b/c.js#frag', opts)).toBe(join('P', 'a b', 'c.js'));
  });

  it('returns null for anything the local build cannot resolve', () => {
    expect(resolveAssetPath('https://cdn.example.com/a.js', opts)).toBeNull();
    expect(resolveAssetPath('//cdn.example.com/a.js', opts)).toBeNull();
    expect(resolveAssetPath('data:text/javascript,1', opts)).toBeNull();
    expect(resolveAssetPath('/_next/image?url=%2Flogo.webp', opts)).toBeNull();
  });
});

describe('gzipSize', () => {
  it('compresses repetitive payloads below their raw size', () => {
    const raw = Buffer.from('abcdefgh'.repeat(1000));
    expect(gzipSize(raw)).toBeGreaterThan(0);
    expect(gzipSize(raw)).toBeLessThan(raw.length);
  });
});

describe('transferredSize', () => {
  it('uses the gzip size when compression actually helps', () => {
    const raw = Buffer.from('abcdefgh'.repeat(1000));
    expect(transferredSize(raw)).toBe(gzipSize(raw));
    expect(transferredSize(raw)).toBeLessThan(raw.length);
  });

  it('falls back to raw for already-compressed payloads so woff2 never reports gzip > raw', () => {
    // Deterministic high-entropy bytes (first byte of 4096 distinct digests):
    // gzip cannot shrink them, so it emits slightly more than raw.
    const incompressible = Buffer.from(
      Array.from({ length: 4096 }, (_, i) => createHash('sha256').update(String(i)).digest()[0])
    );
    expect(gzipSize(incompressible)).toBeGreaterThan(incompressible.length);
    expect(transferredSize(incompressible)).toBe(incompressible.length);
  });
});

describe('summarizeAssets', () => {
  it('totals raw and gzip per category and excludes legacy from the total', () => {
    const summary = summarizeAssets([
      { kind: 'html', raw: 1000, gzip: 300 },
      { kind: 'js', raw: 5000, gzip: 1500 },
      { kind: 'js', raw: 1000, gzip: 400 },
      { kind: 'css', raw: 2000, gzip: 600 },
      { kind: 'fonts', raw: 800, gzip: 790 },
      { kind: 'legacy', raw: 9000, gzip: 3000 },
    ]);

    expect(summary.js).toEqual({ raw: 6000, gzip: 1900, count: 2 });
    expect(summary.html).toEqual({ raw: 1000, gzip: 300, count: 1 });
    expect(summary.legacy).toEqual({ raw: 9000, gzip: 3000, count: 1 });
    expect(summary.total).toEqual({ raw: 9800, gzip: 3590, count: 5 });
  });
});

describe('compareToBaseline', () => {
  it('reports absolute and percentage gzip deltas per category', () => {
    const summary = summarizeAssets([{ kind: 'js', raw: 2000, gzip: 1000 }]);
    const baseline = { js: { raw: 1000, gzip: 800, count: 1 } };
    const delta = compareToBaseline(summary, baseline);
    expect(delta.js.gzipDelta).toBe(200);
    expect(delta.js.gzipPct).toBeCloseTo(25, 5);
  });

  it('returns null when there is no baseline to compare against', () => {
    const summary = summarizeAssets([]);
    expect(compareToBaseline(summary, null)).toBeNull();
  });
});

describe('checkBudget', () => {
  const summary = summarizeAssets([
    { kind: 'html', raw: 60 * 1024, gzip: 60 * 1024 },
    { kind: 'js', raw: 300 * 1024, gzip: 300 * 1024 },
  ]);

  it('passes when every constrained metric is within budget', () => {
    const result = checkBudget(summary, { default: { totalGzipKb: 400, jsGzipKb: 320 } }, '/');
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.checked).toHaveLength(2);
  });

  it('fails and names each metric that exceeds its budget', () => {
    const result = checkBudget(summary, { default: { jsGzipKb: 250, totalGzipKb: 300 } }, '/');
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.metric).sort()).toEqual(['jsGzipKb', 'totalGzipKb']);
    expect(result.violations[0].actualKb).toBeGreaterThan(result.violations[0].budgetKb);
  });

  it('lets a route override tighten or relax the default without inheriting unset keys twice', () => {
    const budget = {
      default: { totalGzipKb: 1000, jsGzipKb: 1000 },
      routes: { '/': { jsGzipKb: 100 } },
    };
    const result = checkBudget(summary, budget, '/');
    expect(result.violations.map((v) => v.metric)).toEqual(['jsGzipKb']);
    expect(checkBudget(summary, budget, '/community').ok).toBe(true);
  });

  it('treats a missing budget as no constraint', () => {
    expect(checkBudget(summary, {}, '/').ok).toBe(true);
    expect(checkBudget(summary, undefined, '/').ok).toBe(true);
  });

  it('matches route overrides regardless of how the key was written', () => {
    const budget = { default: { jsGzipKb: 1000 }, routes: { community: { jsGzipKb: 100 } } };
    expect(checkBudget(summary, budget, '/community').violations.map((v) => v.metric)).toEqual([
      'jsGzipKb',
    ]);
    expect(checkBudget(summary, budget, '/').ok).toBe(true);
  });

  it('expands a pattern key through weightSamples so every sample inherits its ceiling', () => {
    const heavy = summarizeAssets([{ kind: 'html', raw: 95 * 1024, gzip: 95 * 1024 }]);
    const weights = { '/quran/[surah]': ['/quran/1', '/quran/2'] };
    const budget = {
      default: { htmlGzipKb: 63 },
      routes: { '/quran/[surah]': { htmlGzipKb: 96 } },
    };

    // The pattern is resolved through the matrix, not by matching the raw key.
    expect(checkBudget(heavy, budget, '/quran/2').violations.map((v) => v.metric)).toEqual([
      'htmlGzipKb',
    ]);
    expect(checkBudget(heavy, budget, '/quran/1', weights).ok).toBe(true);
    expect(checkBudget(heavy, budget, '/quran/2', weights).ok).toBe(true);
    expect(checkBudget(heavy, budget, '/quran/2', weights).checked[0]).toEqual({
      metric: 'htmlGzipKb',
      budgetKb: 96,
      actualKb: 95,
    });
  });

  it('lets an exact key override a pattern key for the same concrete route', () => {
    const budget = {
      default: { htmlGzipKb: 63 },
      routes: { '/quran/[surah]': { htmlGzipKb: 96 }, '/quran/2': { htmlGzipKb: 90 } },
    };
    const weights = { '/quran/[surah]': ['/quran/1', '/quran/2'] };
    const heavy = summarizeAssets([{ kind: 'html', raw: 95 * 1024, gzip: 95 * 1024 }]);

    expect(checkBudget(heavy, budget, '/quran/1', weights).ok).toBe(true);
    expect(checkBudget(heavy, budget, '/quran/2', weights).violations.map((v) => v.metric)).toEqual(
      ['htmlGzipKb']
    );
  });

  it('resolves patterns to concrete routes without mutating the budget', () => {
    const routes = { '/quran/[surah]': { htmlGzipKb: 96 }, '/quran/2': { htmlGzipKb: 90 } };
    const weights = { '/quran/[surah]': ['/quran/1', '/quran/2'] };
    expect(resolveBudgetRoutes(routes, weights)).toEqual({
      '/quran/1': { htmlGzipKb: 96 },
      '/quran/2': { htmlGzipKb: 90 },
    });
    expect(Object.keys(routes)).toEqual(['/quran/[surah]', '/quran/2']);
  });

  it('prices cssRawKb against the raw bytes, not the gzip ones', () => {
    const cssSummary = summarizeAssets([
      { kind: 'html', raw: 60 * 1024, gzip: 60 * 1024 },
      { kind: 'css', raw: 360 * 1024, gzip: 50 * 1024 },
    ]);

    const ok = checkBudget(cssSummary, { default: { cssRawKb: 400 } }, '/');
    expect(ok.checked).toEqual([{ metric: 'cssRawKb', budgetKb: 400, actualKb: 360 }]);

    const over = checkBudget(cssSummary, { default: { cssRawKb: 350 } }, '/');
    expect(over.violations.map((v) => v.metric)).toEqual(['cssRawKb']);
  });
});

describe('checkLegacyGating', () => {
  const manifest = { polyfillFiles: ['static/chunks/legacy.js'] };

  it('passes when the polyfill is only reachable behind nomodule', () => {
    const assets = {
      scripts: ['/_next/static/chunks/app.js'],
      legacyScripts: ['/_next/static/chunks/legacy.js'],
    };
    const result = checkLegacyGating(assets, manifest);
    expect(result.ok).toBe(true);
    expect(result.gated).toEqual(['/_next/static/chunks/legacy.js']);
    expect(result.ungated).toEqual([]);
  });

  it('fails when the polyfill is loaded as a modern script', () => {
    const assets = { scripts: ['/_next/static/chunks/legacy.js'], legacyScripts: [] };
    const result = checkLegacyGating(assets, manifest);
    expect(result.ok).toBe(false);
    expect(result.ungated).toEqual(['/_next/static/chunks/legacy.js']);
  });

  it('has nothing to gate when the manifest lists no polyfills', () => {
    expect(polyfillUrls(null)).toEqual([]);
    expect(checkLegacyGating({ scripts: [], legacyScripts: [] }, null).ok).toBe(true);
  });
});

describe('measureRoute', () => {
  it('measures HTML, JS, CSS and CSS-referenced fonts for a static route', () => {
    const { nextDir, publicDir, html, bodies } = makeFixture();
    const { summary, entries } = measureRoute('/', { nextDir, publicDir });

    expect(summary.html.count).toBe(1);
    expect(summary.html.raw).toBe(Buffer.byteLength(html));
    expect(summary.js.count).toBe(2);
    expect(summary.js.raw).toBe(
      Buffer.byteLength(bodies['chunks/app.js']) + Buffer.byteLength(bodies['chunks/pre.js'])
    );
    expect(summary.css.count).toBe(1);
    expect(summary.css.raw).toBe(Buffer.byteLength(bodies['chunks/styles.css']));
    expect(summary.fonts.count).toBe(1);
    expect(summary.fonts.raw).toBe(Buffer.byteLength(bodies['media/font.woff2']));
    expect(summary.legacy.count).toBe(1);
    expect(summary.legacy.raw).toBe(Buffer.byteLength(bodies['chunks/legacy.js']));
    expect(summary.total.count).toBe(5);
    expect(summary.total.gzip).toBeGreaterThan(0);
    expect(entries.find((e) => e.kind === 'fonts').url).toBe('/_next/static/media/font.woff2');
  });

  it('throws a helpful error when the route was never built', () => {
    const { nextDir, publicDir } = makeFixture();
    expect(() => measureRoute('/missing', { nextDir, publicDir })).toThrow(
      /index\.html|never built/i
    );
  });

  it('accepts routes with and without a leading slash and trailing slash', () => {
    const { nextDir, publicDir } = makeFixture();
    expect(measureRoute('/', { nextDir, publicDir }).summary.html.count).toBe(1);
    expect(measureRoute('', { nextDir, publicDir }).summary.html.count).toBe(1);
  });
});

const SCRIPT = join(import.meta.dirname, '..', 'perf-baseline.mjs');

function runCli(args, cwd) {
  try {
    return {
      status: 0,
      stdout: execFileSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' }),
    };
  } catch (error) {
    return { status: error.status ?? 1, stdout: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

// The live CLI needs the test's local HTTP server to keep serving while it
// runs, so these calls must not block the event loop like execFileSync does.
const execFileAsync = promisify(execFile);
async function runCliAsync(args, cwd) {
  try {
    const { stdout } = await execFileAsync(process.execPath, [SCRIPT, ...args], {
      cwd,
      encoding: 'utf8',
    });
    return { status: 0, stdout };
  } catch (error) {
    return { status: error.status ?? 1, stdout: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

describe('perf-baseline CLI', () => {
  it('reports shipped bytes for the configured route and exits 0 without a budget alert', () => {
    const { root, nextDir, publicDir } = makeFixture();
    const result = runCli(
      ['--next-dir', nextDir, '--public-dir', publicDir, '--budget', 'absent.json'],
      root
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('TOTAL');
    expect(result.stdout).toContain('legacy excluded from TOTAL');
  });

  it('exits non-zero when --check is set and a metric is over budget', () => {
    const { root, nextDir, publicDir } = makeFixture();
    writeFileSync(join(root, 'budget.json'), '{"measure":["/"],"default":{"totalGzipKb":1}}');
    const result = runCli(
      ['--next-dir', nextDir, '--public-dir', publicDir, '--budget', 'budget.json', '--check'],
      root
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('exceeds budget');
  });

  it('warns without failing when a metric is over budget and --check is absent', () => {
    const { root, nextDir, publicDir } = makeFixture();
    writeFileSync(join(root, 'budget.json'), '{"measure":["/"],"default":{"totalGzipKb":1}}');
    const result = runCli(
      ['--next-dir', nextDir, '--public-dir', publicDir, '--budget', 'budget.json'],
      root
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Budget exceeded');
  });

  it('tolerates a UTF-8 BOM in the budget file', () => {
    const { root, nextDir, publicDir } = makeFixture();
    writeFileSync(join(root, 'budget.json'), '\uFEFF{"measure":["/"],"default":{"totalGzipKb":1}}');
    const result = runCli(
      ['--next-dir', nextDir, '--public-dir', publicDir, '--budget', 'budget.json'],
      root
    );
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('Could not parse');
  });

  it('fails with a readable message, not a stack trace, when the config is malformed', () => {
    const { root, nextDir, publicDir } = makeFixture();
    writeFileSync(join(root, 'budget.json'), '{ not json');
    const result = runCli(
      ['--next-dir', nextDir, '--public-dir', publicDir, '--budget', 'budget.json'],
      root
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Could not parse');
    expect(result.stdout).not.toMatch(/\n\s+at /);
  });

  it('fails with a readable message when the route was never built', () => {
    const { root, nextDir, publicDir } = makeFixture();
    const result = runCli(
      [
        '--routes',
        '/missing',
        '--next-dir',
        nextDir,
        '--public-dir',
        publicDir,
        '--budget',
        'absent.json',
      ],
      root
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/index\.html|never built/i);
    expect(result.stdout).not.toMatch(/\n\s+at /);
  });

  it('reports the legacy polyfill as gated for a normal build', () => {
    const { root, nextDir, publicDir } = makeFixture();
    writeFileSync(
      join(nextDir, 'build-manifest.json'),
      JSON.stringify({ polyfillFiles: ['static/chunks/legacy.js'] })
    );
    const result = runCli(
      ['--next-dir', nextDir, '--public-dir', publicDir, '--budget', 'absent.json'],
      root
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('gated (nomodule)');
  });

  it('fails --check when the legacy polyfill loses its nomodule gate', () => {
    const { root, nextDir, publicDir, html } = makeFixture();
    writeFileSync(
      join(nextDir, 'build-manifest.json'),
      JSON.stringify({ polyfillFiles: ['static/chunks/legacy.js'] })
    );
    writeFileSync(
      join(nextDir, 'server', 'app', 'index.html'),
      html.replace('nomodule=""', 'async=""')
    );
    const result = runCli(
      ['--next-dir', nextDir, '--public-dir', publicDir, '--budget', 'absent.json', '--check'],
      root
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('no longer nomodule-gated');
  });
});

/* Live-document mode ------------------------------------------------------- */

async function makeLiveServer({ flaky = {} } = {}) {
  const bodies = {
    '/': [
      '<!DOCTYPE html><html><head>',
      '<link rel="stylesheet" href="/_next/static/chunks/styles.css"/>',
      '<link rel="preload" as="font" href="/_next/static/media/font.woff2"/>',
      '</head><body>',
      '<script src="/_next/static/chunks/app.js"></script>',
      '<script src="/_next/static/chunks/legacy.js" nomodule=""></script>',
      '</body></html>',
    ].join('\n'),
    '/account':
      '<!DOCTYPE html><html><head><script src="/_next/static/chunks/app.js"></script></head></html>',
    '/_next/static/chunks/app.js': pseudoText(11, 40000),
    '/_next/static/chunks/styles.css':
      '@font-face{src:url(../media/font.woff2)}' + pseudoText(12, 8000),
    '/_next/static/media/font.woff2': pseudoText(13, 6000),
    '/_next/static/chunks/legacy.js': pseudoText(14, 45000),
  };
  const hits = new Map();
  const server = createServer((req, res) => {
    const attempts = flaky[req.url] ?? 0;
    const seen = hits.get(req.url) ?? 0;
    if (seen < attempts) {
      hits.set(req.url, seen + 1);
      res.writeHead(503);
      res.end();
      return;
    }
    if (req.url === '/redirect') {
      res.writeHead(307, { location: '/account' });
      res.end();
      return;
    }
    const body = bodies[req.url];
    if (body === undefined) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (req.url === '/_next/static/chunks/app.js') {
      // Deliberately ignore Accept-Encoding: identity: fetchRaw must decode so
      // transferredSize stays the single place compression is applied.
      res.writeHead(200, { 'content-encoding': 'gzip' });
      res.end(gzipSync(Buffer.from(body)));
      return;
    }
    res.writeHead(200);
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  madeServers.push(server);
  return { origin: `http://127.0.0.1:${server.address().port}`, bodies };
}

describe('fetchRaw', () => {
  it('decodes a compressed response before it is priced', async () => {
    const { origin } = await makeLiveServer();
    const { raw } = await fetchRaw(`${origin}/_next/static/chunks/app.js`);
    expect(raw.toString()).toBe(pseudoText(11, 40000));
  });

  it('retries a timed-out request with a fresh signal instead of dropping the route', async () => {
    const signals = [];
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('The operation was aborted due to timeout'))
      .mockImplementation((_url, init) => {
        signals.push(init.signal);
        return Promise.resolve(new Response('ok'));
      });

    const { raw } = await fetchRaw('https://perf.local/', {
      fetchImpl,
      sleep: () => Promise.resolve(),
    });

    expect(raw.toString()).toBe('ok');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[0].aborted).toBe(false);
  });

  it('backs off progressively across three attempts', async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const fetchImpl = vi.fn().mockRejectedValue(new Error('socket hang up'));

    await expect(
      fetchRaw('https://perf.local/', { fetchImpl, sleep, attempts: 3 })
    ).rejects.toThrow(/socket hang up/);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([250, 500]);
  });

  it('never retries a definite answer such as a 404', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('gone', { status: 404 }));

    await expect(
      fetchRaw('https://perf.local/missing', { fetchImpl, sleep: () => Promise.resolve() })
    ).rejects.toThrow(/404/);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries a 5xx up to the attempt limit, then fails with its status', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('busy', { status: 503, statusText: 'Service Unavailable' }));

    await expect(
      fetchRaw('https://perf.local/', { fetchImpl, sleep: () => Promise.resolve(), attempts: 3 })
    ).rejects.toThrow(/503/);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe('measureLiveRoute', () => {
  it('prices a fetched document with the same buckets as a built one', async () => {
    const { origin, bodies } = await makeLiveServer();
    const { summary, finalUrl } = await measureLiveRoute('/', { origin });

    expect(summary.html.count).toBe(1);
    expect(summary.html.raw).toBe(Buffer.byteLength(bodies['/']));
    expect(summary.js.count).toBe(1);
    expect(summary.js.raw).toBe(Buffer.byteLength(bodies['/_next/static/chunks/app.js']));
    expect(summary.css.count).toBe(1);
    expect(summary.fonts.count).toBe(1);
    expect(summary.legacy.count).toBe(1);
    expect(summary.total.count).toBe(4); // legacy is reported but not in TOTAL
    expect(new URL(finalUrl).pathname).toBe('/');
  });

  it('reports the final document when a route redirects', async () => {
    const { origin } = await makeLiveServer();
    const result = await measureLiveRoute('/redirect', { origin });
    expect(new URL(result.finalUrl).pathname).toBe('/account');
    expect(result.summary.js.count).toBe(1);
  });

  it('throws a readable error when the document is missing', async () => {
    const { origin } = await makeLiveServer();
    await expect(measureLiveRoute('/not-here', { origin })).rejects.toThrow(/404/);
  });
});

describe('weight route coverage', () => {
  const matrix = {
    surfaces: [
      { id: 'home', routes: ['/'] },
      { id: 'profile', routes: ['/u/[username]', '/u/[username]/followers'] },
      { id: 'admin', prefix: '/admin' },
    ],
    weightSamples: {
      '/u/[username]': '/u/royaraqamia',
      '/u/[username]/followers': '/u/royaraqamia',
    },
  };

  it('resolves dynamic patterns to concrete paths and de-duplicates them', () => {
    const { routes, errors } = resolveWeightRoutes(matrix);
    expect(errors).toEqual([]);
    expect(routes.map((route) => route.route)).toEqual(['/', '/u/royaraqamia', '/admin']);
  });

  it('prices every sample in a list and de-duplicates repeated concrete paths', () => {
    const { routes, errors } = resolveWeightRoutes({
      surfaces: [
        { id: 'quran-surah', routes: ['/quran/[surah]'] },
        { id: 'home', routes: ['/quran/1'] },
      ],
      weightSamples: { '/quran/[surah]': ['/quran/1', '/quran/2'] },
    });
    expect(errors).toEqual([]);
    expect(routes.map((route) => route.route)).toEqual(['/quran/1', '/quran/2']);
    expect(routes.map((route) => route.surface)).toEqual(['quran-surah', 'quran-surah']);
  });

  it('fails a dynamic pattern whose sample list is empty', () => {
    const { errors } = resolveWeightRoutes({
      surfaces: [{ id: 'quran-surah', routes: ['/quran/[surah]'] }],
      weightSamples: { '/quran/[surah]': [] },
    });
    expect(errors.join(' ')).toMatch(/weightSamples/);
  });

  it('fails a dynamic pattern that has no sample', () => {
    const { errors } = resolveWeightRoutes({
      surfaces: [{ id: 'post', routes: ['/community/[slug]'] }],
    });
    expect(errors.join(' ')).toMatch(/weightSamples/);
  });

  it('lists the matrix routes that were not priced', () => {
    expect(checkWeightCoverage([{ route: '/' }], ['/', '/account'])).toEqual(['/account']);
  });

  it('holds both samples of a pattern to the same ceiling', () => {
    const results = ['/quran/1', '/quran/2'].map((route) => ({
      route,
      summary: summarizeAssets([{ kind: 'html', raw: 95 * 1024, gzip: 95 * 1024 }]),
    }));
    const budget = {
      default: { htmlGzipKb: 63 },
      routes: { '/quran/[surah]': { htmlGzipKb: 96 } },
    };
    const weights = { '/quran/[surah]': ['/quran/1', '/quran/2'] };
    const report = formatWeightVerdict(results, budget, weights);
    expect(report).toContain('/quran/2');
    expect(report).toContain('2 OK, 0 over budget across 2 route(s)');
  });

  it('checks a redirected route against the final document ceiling', () => {
    const results = [
      {
        route: '/old',
        budgetRoute: '/account',
        summary: summarizeAssets([{ kind: 'js', raw: 1000, gzip: 1000 }]),
      },
    ];
    const budget = { default: { jsGzipKb: 2 }, routes: { '/account': { jsGzipKb: 0.5 } } };
    const report = formatWeightVerdict(results, budget);
    expect(report).toContain('(-> /account)');
    expect(report).toContain('jsGzipKb');
  });
});

describe('perf-baseline CLI --live', () => {
  it('prices an origin document and exits 0 when it is within budget', async () => {
    const { origin } = await makeLiveServer();
    const { root } = makeFixture();
    writeFileSync(join(root, 'budget.json'), '{"default":{"jsGzipKb":500}}');
    const result = await runCliAsync(
      ['--live', '--origin', origin, '--routes', '/account', '--budget', 'budget.json', '--check'],
      root
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('0 over budget');
  });

  it('prices every matrix route when the origin blips once', async () => {
    const { origin } = await makeLiveServer({ flaky: { '/account': 1 } });
    const { root } = makeFixture();
    mkdirSync(join(root, 'perf'), { recursive: true });
    writeFileSync(
      join(root, 'perf', 'surfaces.json'),
      JSON.stringify({
        surfaces: [
          { id: 'home', routes: ['/'] },
          { id: 'account', routes: ['/account'] },
        ],
      })
    );
    const result = await runCliAsync(
      ['--live', '--origin', origin, '--budget', 'absent.json', '--check'],
      root
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('2 OK, 0 over budget across 2 route(s)');
    expect(result.stdout).not.toContain('were not priced');
  });

  it('exits 1 on a budget breach measured from the origin', async () => {
    const { origin } = await makeLiveServer();
    const { root } = makeFixture();
    writeFileSync(join(root, 'budget.json'), '{"default":{"jsGzipKb":0.01}}');
    const result = await runCliAsync(
      ['--live', '--origin', origin, '--routes', '/account', '--budget', 'budget.json', '--check'],
      root
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('jsGzipKb');
  });

  it('fails before fetching when a matrix route has no weight sample', async () => {
    const { root } = makeFixture();
    mkdirSync(join(root, 'perf'), { recursive: true });
    writeFileSync(
      join(root, 'perf', 'surfaces.json'),
      JSON.stringify({ surfaces: [{ id: 'post', routes: ['/community/[slug]'] }] })
    );
    const result = await runCliAsync(['--live', '--budget', 'absent.json', '--check'], root);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('weightSamples');
  });

  it('fails coverage when a matrix route cannot be priced', async () => {
    const { origin } = await makeLiveServer();
    const { root } = makeFixture();
    mkdirSync(join(root, 'perf'), { recursive: true });
    writeFileSync(
      join(root, 'perf', 'surfaces.json'),
      JSON.stringify({ surfaces: [{ id: 'missing', routes: ['/not-here'] }] })
    );
    const result = await runCliAsync(
      ['--live', '--origin', origin, '--budget', 'absent.json', '--check'],
      root
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('were not priced');
  });
});
