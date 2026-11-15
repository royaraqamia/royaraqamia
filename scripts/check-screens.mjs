import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The screen inventory, checked (#665).
 *
 * Two clients implement one design: the site (`app/`) and the app (`android/`,
 * which serves the site's surfaces in a shell today and will draw more of them
 * natively). A screen that exists in one and not the other is not a discovery to
 * make on a device — it is a row here, with the ticket that lands it or the
 * reason it never will.
 *
 * `docs/mobile/screens.json` is the row list; this script answers four
 * questions from the working tree, with no build:
 *
 * 1. Does every surface in `perf/surfaces.json` have a row? `check:surfaces`
 *    already forces a decision for a new route; this forces the second half of
 *    it — which client draws the screen.
 * 2. Does every row name a surface that still exists? A renamed or removed
 *    surface would otherwise leave a row describing nothing.
 * 3. Does a row claim a native screen that is not there, or claim the same
 *    Kotlin screen twice?
 * 4. Does every `*Screen.kt` in the app belong to a row? A native screen added
 *    without a row is exactly the gap this exists to list.
 * 5. Does every registration name a surface this registry has? A surface
 *    registers itself as `<surface>.<name>` for the assistant's eyes
 *    (ADR-0181), and a registration that names a screen the registry does not
 *    have is a snapshot the model can never be given.
 *
 * The same rows are what the assistant's eyes read (ADR-0181): a turn knows
 * which screen it is on because a route maps to a surface id, and that mapping
 * is generated here into `shared/contracts/screens.generated.ts` rather than
 * retyped in a client component. A route added to the matrix reaches the site's
 * shell in the same change, or this check says so.
 *
 * Run with `--write` to regenerate the Markdown and the route table after an
 * intentional change.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INVENTORY = join(ROOT, 'docs', 'mobile', 'screens.json');
const RENDERED = join(ROOT, 'docs', 'mobile', 'screens.md');
const MATRIX = join(ROOT, 'perf', 'surfaces.json');
const ROUTES = join(ROOT, 'shared', 'contracts', 'screens.generated.ts');
const SOURCE_ROOTS = ['frontend', 'app'];
const NATIVE_ROOT = join(
  ROOT,
  'android',
  'app',
  'src',
  'main',
  'kotlin',
  'com',
  'royaraqamia',
  'app'
);

/**
 * The app's screens are Kotlin files that end in `Screen.kt`, wherever they sit.
 * The convention is what makes an unlisted screen findable: a screen named
 * otherwise is one this check cannot see, so it does not get to exist silently.
 */
export function nativeScreens(root = NATIVE_ROOT) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true })
    .map((entry) => join(root, String(entry)))
    .filter((path) => /[A-Za-z][A-Za-z0-9]*Screen\.kt$/.test(path))
    .sort();
}

/**
 * The arguments of one call, from its opening parenthesis to its closing one.
 *
 * A registration is read from the source rather than from a second list, so a
 * surface that registers a screen the registry does not have is found where it
 * is written. The scan is deliberately narrow: the id must be a string literal
 * in the call, which is what makes the convention checkable at all.
 */
function callArguments(text, start) {
  let depth = 0;
  let quote = '';
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
    } else if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return '';
}

/** The scope ids one file registers: `useScreenScope({ id: 'news.page', … })`. */
export function scopeIds(text) {
  const ids = [];
  for (const match of text.matchAll(/\buseScreenScope\s*\(/g)) {
    const call = callArguments(text, match.index + match[0].length - 1);
    const id = /id:\s*'([^']+)'/.exec(call);
    if (id) ids.push(id[1]);
  }
  return ids;
}

/**
 * Every registration in the site's source, by the id it names.
 *
 * Two shapes count, because a surface writes its scope in one of two ways: an
 * inline object at the call site (`useScreenScope({ id: 'news.page', … })`), or
 * a builder in a `*-screen-scope.ts` module that the component calls with the
 * state it holds. Both name the id literally, which is what the scan reads.
 *
 * The part before the first dot is the surface id (ADR-0181's convention), so a
 * registration and the two-client registry are one list: `news.page` is the
 * `news` surface, `spendtrack.expense` is `spendtrack`. Tests are skipped — a
 * fixture that registers a made-up id is a fixture, not a screen.
 */
export function registrations(root = ROOT) {
  const found = [];
  for (const dir of SOURCE_ROOTS) {
    const base = join(root, dir);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { recursive: true })) {
      const path = join(base, String(entry));
      if (!/\.(ts|tsx)$/.test(path)) continue;
      if (path.split(/[\\/]/).includes('__tests__')) continue;
      const relativePath = relative(root, path).split('\\').join('/');
      const text = readFileSync(path, 'utf8');
      const ids = path.endsWith('-screen-scope.ts')
        ? [...text.matchAll(/\bid:\s*'([^']+)'/g)].map((match) => match[1])
        : scopeIds(text);
      for (const id of ids) found.push({ id, path: relativePath });
    }
  }
  // Deterministic across filesystems: the directory walk's own order differs
  // between Windows and Linux, and a check whose output moves is a check nobody
  // can read a diff of.
  return found.sort((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
  });
}

/** Every problem, not just the first: a half-listed screen is a discovery waiting to happen. */
export function validate({
  inventory,
  matrix,
  repoRoot = ROOT,
  nativeRoot = NATIVE_ROOT,
  registered,
}) {
  const errors = [];
  const rows = inventory.screens ?? [];
  const surfaces = (matrix.surfaces ?? []).map((surface) => surface.id);

  if (inventory.schemaVersion !== 1) {
    errors.push(
      `docs/mobile/screens.json: schemaVersion must be 1, not ${inventory.schemaVersion}`
    );
  }

  const listed = new Set();
  const claimed = new Map();
  for (const row of rows) {
    const id = row.surface;
    if (!id) {
      errors.push('docs/mobile/screens.json: a row has no "surface"');
      continue;
    }
    if (!surfaces.includes(id)) {
      errors.push(`row "${id}" names a surface perf/surfaces.json does not have`);
    }
    if (listed.has(id)) {
      errors.push(`row "${id}" appears twice`);
    }
    listed.add(id);

    const hasNative = typeof row.native === 'string' && row.native.length > 0;
    const hasReason = typeof row.reason === 'string' && row.reason.trim().length > 0;
    // A port can exist and be switched off: the screen is in the tree, the shell
    // does not route to it, and the reason says why (#872). That is a third state
    // rather than a lie in either direction - `native` alone claims the app draws
    // it, `reason` alone denies the file exists.
    const off = row.enabled === false;
    if (off && !hasNative) {
      errors.push(`row "${id}" is disabled ("enabled": false) but names no Kotlin screen`);
      continue;
    }
    if (off && !hasReason) {
      errors.push(`row "${id}" is disabled, so it needs a "reason" (why the port is off)`);
      continue;
    }
    if (!off && hasNative === hasReason) {
      errors.push(
        `row "${id}" needs exactly one of "native" (a Kotlin screen) and "reason" (why there is none)`
      );
      continue;
    }
    if (!hasNative) continue;

    const path = resolve(repoRoot, row.native);
    if (!existsSync(path)) {
      errors.push(`row "${id}" claims ${row.native}, which does not exist`);
    } else if (!/Screen\.kt$/.test(row.native)) {
      errors.push(`row "${id}" claims ${row.native}, which is not a *Screen.kt file`);
    }
    if (claimed.has(path)) {
      errors.push(`${row.native} is claimed by "${claimed.get(path)}" and "${id}"`);
    }
    claimed.set(path, id);
  }

  const missing = surfaces.filter((id) => !listed.has(id));
  if (missing.length > 0) {
    errors.push(
      `surfaces with no row (decide which client draws them, in docs/mobile/screens.json): ${missing.join(', ')}`
    );
  }

  const unlisted = nativeScreens(nativeRoot).filter((path) => !claimed.has(resolve(path)));
  if (unlisted.length > 0) {
    errors.push(
      `native screens with no row: ${unlisted.map((path) => relative(repoRoot, path).split('\\').join('/')).join(', ')}`
    );
  }

  // A registration names `<surface>.<name>`, and the surface is a row in this
  // same registry: a screen the assistant can be told about is a screen the two
  // clients know (ADR-0181). The reverse — a surface with no registration — is
  // not an error yet: #1421 registers the rest, and the day it lands this check
  // names the gap instead of leaving it silent.
  const found = registered ?? registrations(repoRoot);
  const seen = new Map();
  for (const { id, path } of found) {
    const surface = String(id).split('.')[0];
    const name = String(id).slice(surface.length + 1);
    if (!surface || !name || !/^[a-z0-9-]+$/.test(surface)) {
      errors.push(`registration "${id}" in ${path} must name a screen as "<surface>.<name>"`);
      continue;
    }
    if (!listed.has(surface)) {
      errors.push(
        `registration "${id}" in ${path} names surface "${surface}" that docs/mobile/screens.json does not have`
      );
    }
    if (seen.has(id)) {
      errors.push(`registration "${id}" appears in ${seen.get(id)} and ${path}`);
    } else {
      seen.set(id, path);
    }
  }

  return errors;
}

function cells(row, surface) {
  const routes = [
    ...(surface?.routes ?? []),
    ...(typeof surface?.prefix === 'string' ? [`${surface.prefix}/**`] : []),
  ];
  const app =
    typeof row.native === 'string'
      ? `\`${row.native.split('/').pop()}\`${row.enabled === false ? ' (off)' : ''}`
      : '_web only_';
  const why = typeof row.reason === 'string' ? row.reason : '';
  const ticket = row.issue ? ` ${row.issue}` : '';
  return [
    `\`${row.surface}\``,
    routes.map((route) => `\`${route}\``).join('<br>'),
    app,
    `${why}${ticket}`.trim(),
  ];
}

/**
 * A matrix route is a path and, for the app's tab routes, the `?tab=` value the
 * page reads. Splitting it is what lets `/` be `home` and `/?tab=/notes` be
 * `notes` without a match order a reader has to guess.
 */
export function splitRoute(route) {
  const [path, query = ''] = String(route).split('?');
  const tab = new URLSearchParams(query).get('tab');
  return { pattern: path || '/', tab: tab || null };
}

/**
 * The product a surface belongs to, as its id's own first segment —
 * `spendtrack-categories` belongs to `spendtrack`. One id, one product, so a
 * new row never needs a second list kept in step by hand.
 */
export function productOf(surface) {
  return String(surface).split('-')[0];
}

/** A generated string literal, quoted for the TypeScript it lands in. */
function q(value) {
  return `'${String(value).split('\\').join('\\\\').split("'").join("\\'")}'`;
}

/**
 * The route table the site's shell reads (ADR-0181, decision 2).
 *
 * It is generated from the matrix rather than written by hand because a route
 * the shell cannot place is a screen the assistant cannot see, and a hand-made
 * copy of 39 surfaces drifts on the first rename. Rows carrying a `?tab=` come
 * first: `/` alone is the home screen, and `/` with a tab is that tab's own
 * surface — the first row that matches wins.
 */
/**
 * One row, laid out the way Prettier would lay it out: on one line when it
 * fits, expanded when it does not. A generated file that `format:check`
 * rewrites is a gate that fails on a pull request for no reason.
 */
const PRINT_WIDTH = 100;
function row(fields) {
  const single = `  { ${Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ')} },`;
  if (single.length <= PRINT_WIDTH) return single;
  return [
    '  {',
    ...Object.entries(fields).map(([key, value]) => `    ${key}: ${value},`),
    '  },',
  ].join('\n');
}

export function renderRoutes(matrix) {
  const routes = [];
  const prefixes = [];

  for (const surface of matrix.surfaces ?? []) {
    const product = productOf(surface.id);
    for (const route of surface.routes ?? []) {
      const { pattern, tab } = splitRoute(route);
      routes.push({ pattern, surface: surface.id, product, tab });
    }
    if (typeof surface.prefix === 'string') {
      prefixes.push({ prefix: surface.prefix, surface: surface.id, product });
    }
  }

  // Stable in Node, so matrix order survives inside each group.
  routes.sort((a, b) => Number(Boolean(b.tab)) - Number(Boolean(a.tab)));

  const rows = routes
    .map((item) =>
      row({
        pattern: q(item.pattern),
        surface: q(item.surface),
        product: q(item.product),
        tab: item.tab ? q(item.tab) : 'null',
      })
    )
    .join('\n');
  const prefixed = prefixes
    .map((item) =>
      row({ prefix: q(item.prefix), surface: q(item.surface), product: q(item.product) })
    )
    .join('\n');

  return (
    '// Generated by scripts/check-screens.mjs from perf/surfaces.json - do not edit by hand.\n' +
    '// Run `npm run check:screens -- --write` after changing the matrix.\n\n' +
    '/** One route the site serves, and the surface that draws it. */\n' +
    'export interface ScreenRouteRow {\n' +
    '  /** The route pattern, with `[param]` for a dynamic segment. */\n' +
    '  pattern: string;\n' +
    '  /** The surface id in docs/mobile/screens.json. */\n' +
    '  surface: string;\n' +
    '  /** The product the surface belongs to. */\n' +
    '  product: string;\n' +
    '  /** The `?tab=` value the route reads, when it is a tab of `/`. */\n' +
    '  tab: string | null;\n' +
    '}\n\n' +
    '/** Tab routes first: `/` alone is `home`, and `/` with a tab is not. */\n' +
    'export const SCREEN_ROUTES: readonly ScreenRouteRow[] = [\n' +
    `${rows}\n` +
    '];\n\n' +
    '/** A whole subtree one surface owns, such as the admin area. */\n' +
    'export interface ScreenPrefixRow {\n' +
    '  prefix: string;\n' +
    '  surface: string;\n' +
    '  product: string;\n' +
    '}\n\n' +
    'export const SCREEN_PREFIXES: readonly ScreenPrefixRow[] = [\n' +
    `${prefixed}\n` +
    '];\n'
  );
}

export function renderMarkdown(inventory, matrix) {
  const byId = new Map((matrix.surfaces ?? []).map((surface) => [surface.id, surface]));
  const header =
    '<!-- Generated by scripts/check-screens.mjs from docs/mobile/screens.json - do not edit by hand.\n' +
    '     Run `npm run check:screens -- --write` after changing the JSON. -->\n\n';
  const intro =
    '# Screens in each client\n\n' +
    'Every surface the site serves, and which client draws it. A screen that exists in the app and not ' +
    'the site — or the other way round — is a row here with the ticket that lands it or the reason it ' +
    'never will, because a gap found on a device is a bug and a gap listed here is a decision ' +
    '(#665, [two-clients.md](two-clients.md)).\n\n' +
    '`App` names the Kotlin screen that draws the surface. `_web only_` means the app shows it as a web ' +
    'surface in the shell; the reason says why, and the phases are in ' +
    '[native-app.md](native-app.md). `(off)` means the port exists in the app and the shell does not ' +
    'route to it yet: it is switched on by the change that makes it the same screen as the page ' +
    '(#872, [ADR-0117](../adr/0117-the-document-is-the-app-until-a-port-is-the-same-screen.md)), ' +
    'and only when [the visual gate](../adr/0118-a-port-is-switched-on-by-two-measurements.md) ' +
    'passes. The ' +
    'offline half of the same question — whether the app can show a ' +
    'surface with the radio off — is stated natively in ' +
    '[offline-first.md](../specs/offline-first.md#limits-of-instant); the app has no bundle, so ' +
    'there is no bundle column to read.\n\n';

  const rows = (inventory.screens ?? [])
    .map((row) => `| ${cells(row, byId.get(row.surface)).join(' | ')} |`)
    .join('\n');
  const table = `| Screen | Routes | App | Why / ticket |\n| --- | --- | --- | --- |\n${rows}\n`;

  return `${header}${intro}${table}`;
}

export function main(argv = process.argv.slice(2)) {
  for (const file of [INVENTORY, MATRIX]) {
    if (!existsSync(file)) {
      console.error(`x ${relative(ROOT, file)} is missing`);
      return 1;
    }
  }

  const inventory = JSON.parse(readFileSync(INVENTORY, 'utf8'));
  const matrix = JSON.parse(readFileSync(MATRIX, 'utf8'));
  const errors = validate({ inventory, matrix });
  const write = argv.includes('--write');

  // Two generated artifacts, one list: the table a person reads and the route
  // table the shell runs. Both are stale together or neither is.
  const artifacts = [
    { path: RENDERED, content: renderMarkdown(inventory, matrix), hint: 'screens.json' },
    { path: ROUTES, content: renderRoutes(matrix), hint: 'perf/surfaces.json' },
  ];

  if (write && errors.length === 0) {
    for (const artifact of artifacts) {
      writeFileSync(artifact.path, artifact.content);
      console.log(`  ok ${relative(ROOT, artifact.path)} regenerated`);
    }
  } else if (!write) {
    for (const artifact of artifacts) {
      const current = existsSync(artifact.path) ? readFileSync(artifact.path, 'utf8') : '';
      if (current !== artifact.content) {
        errors.push(
          `${relative(ROOT, artifact.path).split('\\').join('/')} does not match ${artifact.hint} - run \`npm run check:screens -- --write\``
        );
      }
    }
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`x ${error}`);
    return 1;
  }

  const screens = inventory.screens ?? [];
  const ported = screens.filter((row) => typeof row.native === 'string');
  const on = ported.filter((row) => row.enabled !== false).length;
  const found = registrations();
  const named = new Set(found.map(({ id }) => id.split('.')[0]));
  console.log(
    `  ok ${screens.length} screens, ${on} drawn natively, ${ported.length - on} ported but off, ` +
      `${found.length} registrations over ${named.size} surfaces`
  );
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
