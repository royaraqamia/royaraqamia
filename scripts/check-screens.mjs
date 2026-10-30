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
 *
 * Run with `--write` to regenerate the Markdown after an intentional change.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INVENTORY = join(ROOT, 'docs', 'mobile', 'screens.json');
const RENDERED = join(ROOT, 'docs', 'mobile', 'screens.md');
const MATRIX = join(ROOT, 'perf', 'surfaces.json');
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

/** Every problem, not just the first: a half-listed screen is a discovery waiting to happen. */
export function validate({ inventory, matrix, repoRoot = ROOT, nativeRoot = NATIVE_ROOT }) {
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
    if (hasNative === hasReason) {
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

  return errors;
}

function cells(row, surface) {
  const routes = [
    ...(surface?.routes ?? []),
    ...(typeof surface?.prefix === 'string' ? [`${surface.prefix}/**`] : []),
  ];
  const app = typeof row.native === 'string' ? `\`${row.native.split('/').pop()}\`` : '_web only_';
  const why = typeof row.reason === 'string' ? row.reason : '';
  const ticket = row.issue ? ` ${row.issue}` : '';
  return [
    `\`${row.surface}\``,
    routes.map((route) => `\`${route}\``).join('<br>'),
    app,
    `${why}${ticket}`.trim(),
  ];
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
    '[native-app.md](native-app.md). The offline half of the same question — whether the app can show a ' +
    'surface with the radio off — is the `Bundle` column of ' +
    '[the surface matrix](../specs/surfaces.md), not this table.\n\n';

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
  const rendered = renderMarkdown(inventory, matrix);
  const write = argv.includes('--write');

  if (write && errors.length === 0) {
    writeFileSync(RENDERED, rendered);
    console.log(`  ok ${relative(ROOT, RENDERED)} regenerated`);
  } else if (!write) {
    const current = existsSync(RENDERED) ? readFileSync(RENDERED, 'utf8') : '';
    if (current !== rendered) {
      errors.push(
        `${relative(ROOT, RENDERED)} does not match docs/mobile/screens.json - run \`npm run check:screens -- --write\``
      );
    }
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`x ${error}`);
    return 1;
  }

  const screens = inventory.screens ?? [];
  console.log(
    `  ok ${screens.length} screens, ${screens.filter((row) => row.native).length} drawn natively`
  );
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
