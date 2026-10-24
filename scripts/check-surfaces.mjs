import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The surface matrix, checked (#561).
 *
 * `perf/surfaces.json` is the program's scope: every user-facing route, who owns
 * its data, what it does with the radio off, and which spec proves it. It lives
 * in the repository rather than an issue body because three other checks have to
 * read it — the precache coverage (#557), the paint budgets (#558) and the
 * Android bundle split (#502/#504) — and a list no script can read is a wish.
 *
 * This check answers four questions, all from the working tree, with no build:
 *
 * 1. Does every `app/**\/page.tsx` route belong to exactly one surface? A page
 *    added without a decision fails here.
 * 2. Does every surface marked `shell: precached` have a source that can be
 *    prerendered? A page that reads `searchParams` or cookies can never appear
 *    in `PRECACHE_ROUTES`, which is how `/news` silently lost its shell. This is
 *    a source heuristic and it is deliberately narrow: it sees the page and its
 *    layouts, not a helper they import, so `/hire` — which reads the session
 *    through `getOptionalUser()` — passes here and is caught by the build
 *    instead (`npm run check:precache`). The heuristic is the cheap early
 *    warning; the build is the verdict.
 * 3. Does every claimed spec exist on disk? The first version of this table
 *    named four spec files that do not exist.
 * 4. Does `docs/specs/surfaces.md` still match the JSON it is generated from?
 *
 * Run with `--write` to regenerate the Markdown after an intentional change.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MATRIX = join(ROOT, 'perf', 'surfaces.json');
const RENDERED = join(ROOT, 'docs', 'specs', 'surfaces.md');
const APP_DIR = join(ROOT, 'app');

export const OWNERS = ['local-store', 'server', 'static', 'device'];
export const READS = ['store', 'snapshot', 'swr', 'needs-connection'];
export const WRITES = ['outbox', 'none'];
export const SHELLS = ['precached', 'swr', 'pinned', 'none'];
export const BUNDLES = ['bundled', 'remote'];

/**
 * The build-time markers that make a route render per request. A route that
 * matches one cannot be prerendered, so it cannot be a precached shell — the
 * worker would have no document to fetch.
 *
 * The patterns are deliberately narrow, because the first draft matched prose
 * and client hooks: `cookies()` inside a comment explaining that the subtree no
 * longer calls it, and `useSearchParams()` in a client component, both read as
 * "dynamic" and produced four false failures. Markers match comment-stripped
 * source, and the `searchParams` form is only the awaited server prop.
 */
const DYNAMIC_MARKERS = [
  { pattern: /\bawait\s+(?:props\.)?searchParams\b/, name: 'await searchParams' },
  { pattern: /\bcookies\s*\(\s*\)/, name: 'cookies()' },
  { pattern: /\bheaders\s*\(\s*\)/, name: 'headers()' },
  { pattern: /\bconnection\s*\(\s*\)/, name: 'connection()' },
  { pattern: /\bunstable_noStore\s*\(/, name: 'unstable_noStore()' },
  { pattern: /dynamic\s*=\s*['"]force-dynamic['"]/, name: "dynamic = 'force-dynamic'" },
];

/** Every page route the app defines, as `/segment/[param]` strings. */
export function pageRoutes(appDir = APP_DIR) {
  const routes = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === 'page.tsx' || entry.name === 'page.jsx') {
        routes.push(toRoute(relative(appDir, dir)));
      }
    }
  };

  walk(appDir);
  return routes.sort();
}

/** `account/(app)/plan` → `/account/plan`; route groups are not segments. */
export function toRoute(relativeDir) {
  // Split on either separator: `pageRoutes` feeds a `path.relative` result,
  // which is backslash-separated on Windows and slash-separated elsewhere.
  const segments = relativeDir
    .split(/[\\/]/)
    .filter((segment) => segment.length > 0 && !/^\(.*\)$/.test(segment));
  return `/${segments.join('/')}`;
}

/**
 * The surface that owns a route. An exact `routes` entry wins; otherwise the
 * longest matching `prefix` does. Two surfaces claiming the same route is an
 * error rather than a silent first-wins, so the table cannot drift into overlap.
 */
export function matchSurfaces(route, surfaces) {
  const exact = surfaces.filter((surface) => (surface.routes ?? []).includes(route));
  if (exact.length > 0) return exact;

  const prefixed = surfaces.filter(
    (surface) =>
      typeof surface.prefix === 'string' &&
      (route === surface.prefix || route.startsWith(`${surface.prefix}/`))
  );
  if (prefixed.length === 0) return [];

  const longest = Math.max(...prefixed.map((surface) => surface.prefix.length));
  return prefixed.filter((surface) => surface.prefix.length === longest);
}

/** The page and layout sources a route renders through. */
export function routeSources(route, appDir = APP_DIR) {
  const segments = route.split('/').filter(Boolean);
  const files = [];
  let dir = appDir;

  const pageFile = ['page.tsx', 'page.jsx'].map((name) => join(dir, ...segments, name));
  for (const candidate of pageFile) {
    if (existsSync(candidate)) {
      files.push(candidate);
      dir = join(dir, ...segments);
      break;
    }
  }

  // Layouts above the page decide its rendering mode too: a layout that reads
  // cookies makes every route beneath it dynamic.
  const chain = [appDir];
  let cursor = appDir;
  for (const segment of segments) {
    cursor = join(cursor, segment);
    if (existsSync(cursor)) chain.push(cursor);
  }
  for (const dirPath of chain) {
    for (const name of ['layout.tsx', 'layout.jsx']) {
      const candidate = join(dirPath, name);
      if (existsSync(candidate) && !files.includes(candidate)) files.push(candidate);
    }
  }

  return files;
}

/** Drops block and line comments, keeping URLs inside strings intact. */
export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

/** Whether the source can be prerendered; returns the marker that stops it. */
export function dynamicMarker(sources) {
  for (const file of sources) {
    if (!existsSync(file)) continue;
    const raw = readFileSync(file, 'utf8');
    // A client component cannot call the server request APIs, so a match there
    // would be a local name rather than a rendering decision.
    if (/^['"]use client['"]/.test(raw.trimStart())) continue;
    const source = stripComments(raw);
    for (const marker of DYNAMIC_MARKERS) {
      if (marker.pattern.test(source)) {
        return { file: relative(ROOT, file), marker: marker.name };
      }
    }
  }
  return null;
}

/** The surface ids `perf/paint-budget.json` gates, or `null` when there is no file. */
export function paintBudgetIds(path) {
  if (!existsSync(path)) return null;
  try {
    const file = JSON.parse(readFileSync(path, 'utf8'));
    return new Set((file.surfaces ?? []).map((surface) => surface.id));
  } catch {
    // A malformed budget is its own failure; an empty set makes the row that
    // names it report the problem rather than hide it.
    return new Set();
  }
}

function checkEnums(surface, errors) {
  const where = `surface "${surface.id}"`;
  if (!surface.id) errors.push('a surface has no id');
  if (!OWNERS.includes(surface.owner)) errors.push(`${where}: owner must be one of ${OWNERS}`);
  if (!READS.includes(surface.read)) errors.push(`${where}: read must be one of ${READS}`);
  if (!WRITES.includes(surface.write)) errors.push(`${where}: write must be one of ${WRITES}`);
  if (!SHELLS.includes(surface.shell)) errors.push(`${where}: shell must be one of ${SHELLS}`);
  if (!BUNDLES.includes(surface.bundle)) errors.push(`${where}: bundle must be one of ${BUNDLES}`);
  if (!Array.isArray(surface.routes) && typeof surface.prefix !== 'string') {
    errors.push(`${where}: needs routes[] or prefix`);
  }
  // The Android split's own rule (#504): bundling ships documents, so the one
  // thing that cannot be in the bundle is a surface the worker may not cache —
  // `/admin` and `/mcp/connect`, whose guards answer on the server.
  if (surface.bundle === 'bundled' && surface.shell === 'none') {
    errors.push(`${where}: a surface with no cacheable document cannot be bundled (#504)`);
  }
}

export function validate({ matrix, repoRoot = ROOT, routes = pageRoutes() }) {
  const errors = [];
  const surfaces = matrix.surfaces ?? [];
  const defaultUngated = matrix.defaultUngated;
  const paintIds = paintBudgetIds(join(repoRoot, 'perf', 'paint-budget.json'));

  const seenIds = new Set();
  for (const surface of surfaces) {
    if (seenIds.has(surface.id)) errors.push(`duplicate surface id "${surface.id}"`);
    seenIds.add(surface.id);
    checkEnums(surface, errors);

    for (const spec of surface.specs ?? []) {
      if (!existsSync(join(repoRoot, spec))) {
        errors.push(`surface "${surface.id}" names a spec that does not exist: ${spec}`);
      }
    }

    if (!surface.paint && !surface.ungated && !defaultUngated) {
      errors.push(
        `surface "${surface.id}" has no paint budget and no ungated reason — #558 needs one or the other`
      );
    }

    // A row that claims a paint budget has to name one the gate actually runs, or
    // the matrix says "gated" while nothing measures it (#558).
    if (surface.paint && paintIds !== null && !paintIds.has(surface.paint)) {
      errors.push(
        `surface "${surface.id}" names paint budget "${surface.paint}", which perf/paint-budget.json does not define`
      );
    }

    for (const route of surface.routes ?? []) {
      if (surface.shell !== 'precached') continue;
      const source = dynamicMarker(routeSources(route, join(repoRoot, 'app')));
      if (source) {
        errors.push(
          `surface "${surface.id}" claims shell: precached for ${route}, but ${source.file} reads ${source.marker} — that route can never be prerendered, so it can never be precached`
        );
      }
    }
  }

  const uncovered = [];
  const ambiguous = [];
  for (const route of routes) {
    const matches = matchSurfaces(route, surfaces);
    if (matches.length === 0) uncovered.push(route);
    else if (matches.length > 1) {
      ambiguous.push(`${route} → ${matches.map((surface) => surface.id).join(', ')}`);
    }
  }

  if (uncovered.length > 0) {
    errors.push(
      `routes with no surface (decide their offline behaviour in perf/surfaces.json): ${uncovered.join(', ')}`
    );
  }
  if (ambiguous.length > 0) {
    errors.push(`routes claimed by more than one surface: ${ambiguous.join('; ')}`);
  }

  return errors;
}

function cells(surface) {
  const routes = [
    ...(surface.routes ?? []),
    ...(typeof surface.prefix === 'string' ? [`${surface.prefix}/**`] : []),
  ];
  return [
    `\`${surface.id}\``,
    routes.map((route) => `\`${route}\``).join('<br>'),
    surface.owner,
    surface.read,
    surface.write,
    surface.shell,
    surface.bundle,
    (surface.specs ?? []).length > 0
      ? surface.specs.map((spec) => `\`${spec.split('/').pop()}\``).join('<br>')
      : '_ungated_',
    surface.paint ? `\`paint:${surface.paint}\`` : '',
    surface.issue ?? '',
  ];
}

export function renderMarkdown(matrix) {
  const header =
    '<!-- Generated by scripts/check-surfaces.mjs from perf/surfaces.json — do not edit by hand.\n' +
    '     Run `npm run check:surfaces -- --write` after changing the JSON. -->\n\n';
  const intro =
    '# Surface matrix\n\n' +
    'Every user-facing route, what owns its data, and what it owes the user with the radio off. ' +
    'This is the scope of the offline program (#486): a route added without a row fails ' +
    '`npm run check:surfaces`, and so does a `precached` claim on a page that cannot be prerendered.\n\n' +
    '`shell` describes the remote document; `bundle` describes the Android app, where a bundled SPA ' +
    'routes client-side and so handles dynamic segments the remote precache cannot. `Paint` names the ' +
    'row in `perf/paint-budget.json` that the paint gate measures (#558); an empty cell is a row the ' +
    'gate cannot see yet.\n\n';

  const rows = (matrix.surfaces ?? [])
    .map((surface) => `| ${cells(surface).join(' | ')} |`)
    .join('\n');
  const table =
    '| Surface | Routes | Owner | Offline read | Offline write | Shell | Bundle | Verified by | Paint | Issue |\n' +
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n' +
    `${rows}\n\n`;

  const ungated = matrix.defaultUngated ? `_ungated_ — ${matrix.defaultUngated}\n` : '';
  return `${header}${intro}${table}${ungated}`;
}

export function main(argv = process.argv.slice(2)) {
  if (!existsSync(MATRIX)) {
    console.error('✗ perf/surfaces.json is missing');
    return 1;
  }

  const matrix = JSON.parse(readFileSync(MATRIX, 'utf8'));
  const errors = validate({ matrix });
  const rendered = renderMarkdown(matrix);
  const write = argv.includes('--write');

  if (write && errors.length === 0) {
    writeFileSync(RENDERED, rendered);
    console.log(`  ✓ ${relative(ROOT, RENDERED)} regenerated`);
  } else if (!write) {
    const current = existsSync(RENDERED) ? readFileSync(RENDERED, 'utf8') : '';
    if (current !== rendered) {
      errors.push(
        `${relative(ROOT, RENDERED)} does not match perf/surfaces.json — run \`npm run check:surfaces -- --write\``
      );
    }
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`✗ ${error}`);
    return 1;
  }

  const count = (matrix.surfaces ?? []).length;
  const ungated = (matrix.surfaces ?? []).filter(
    (surface) => !surface.paint && surface.specs?.length === 0
  ).length;
  console.log(`  ✓ ${count} surfaces, ${ungated} with no behaviour spec`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
