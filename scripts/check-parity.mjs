import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A ported component is a pair, checked (#647, ADR-0098).
 *
 * `docs/mobile/two-clients.md` could only say that visual drift between the site
 * and the app was "mitigated by review", and the plan card showed what that costs:
 * the app drew 8dp corners where the site draws 16, a grey badge where the site
 * draws green, counters without the owned-item caps, no expiry line, and a guest
 * prompt with no way in. None of that was a bug in either client — the two had
 * simply never been held against each other.
 *
 * `docs/mobile/parity.json` is the pair list. This script answers, from the
 * working tree and with no build:
 *
 * 1. Does every listed file exist, and does every copy source belong to a row?
 * 2. Is the surface one the app is allowed to draw (`perf/surfaces.json`)?
 * 3. Does the app's state file declare exactly the states the row lists, and does
 *    the row list every state it declares? A state on one side only is the drift.
 * 4. Does each state render the *same* string on both sides, from the one
 *    generated copy source rather than a retyped label?
 * 5. Is every string in the copy source rendered by the reference component? A
 *    key no client draws is copy that exists only to go stale.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'docs', 'mobile', 'parity.json');
const MATRIX = join(ROOT, 'perf', 'surfaces.json');
const COPY_DIR = join(ROOT, 'shared', 'copy');
const ICONS = join(ROOT, 'shared', 'icons', 'icons.json');
const VECTORS = 'android/app/src/main/kotlin/com/royaraqamia/app/ui/vectors/LucideVectors.kt';

/** The glyphs a web component imports from the icon library the site uses. */
export function importedIcons(source) {
  const names = new Set();
  for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]lucide-react['"]/g)) {
    for (const name of match[1].split(',')) {
      const trimmed = name
        .trim()
        .split(/\s+as\s+/)[0]
        .trim();
      if (trimmed) names.add(trimmed);
    }
  }
  return [...names];
}

/** `planFree` -> `PLAN_FREE`, the app's name for the same string. */
export function constantName(key) {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

/** The states a Kotlin sealed interface declares: `data object Loading : UsageUiState`. */
export function declaredStates(source) {
  return [...source.matchAll(/^\s*data (?:object|class) ([A-Z][A-Za-z0-9]*)/gm)].map((m) => m[1]);
}

/** Every copy source in the tree, keyed by repo-relative path. */
export function copySources(root = ROOT) {
  const directory = join(root, 'shared', 'copy');
  if (!existsSync(directory)) return new Map();
  return new Map(
    readdirSync(directory)
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => [
        `shared/copy/${entry}`,
        JSON.parse(readFileSync(join(directory, entry), 'utf8')),
      ])
  );
}

/** Every problem, not just the first. `read` returns null for a missing file. */
export function validate({ manifest, surfaces, copies, icons, read }) {
  const errors = [];
  const surfaceIds = new Set((surfaces.surfaces ?? []).map((surface) => surface.id));
  const listedIcons = new Set(icons?.icons ?? []);
  const vectors = read(VECTORS) ?? '';
  const usedIcons = new Set();

  if (manifest.schemaVersion !== 1) {
    errors.push(`docs/mobile/parity.json: schemaVersion must be 1, not ${manifest.schemaVersion}`);
  }

  const rows = manifest.components ?? [];
  if (rows.length === 0) {
    errors.push('docs/mobile/parity.json: no components listed');
  }

  const ids = new Set();
  const claimedSources = new Set();

  for (const row of rows) {
    const id = row.id ?? '(no id)';
    if (!row.id) {
      errors.push('docs/mobile/parity.json: a row has no "id"');
    } else if (ids.has(row.id)) {
      errors.push(`docs/mobile/parity.json: "${row.id}" appears twice`);
    }
    ids.add(id);

    if (row.surface && !surfaceIds.has(row.surface)) {
      errors.push(`"${id}" names a surface perf/surfaces.json does not have: ${row.surface}`);
    }

    const paths = {
      'web.route': row.web?.route,
      'web.component': row.web?.component,
      'web.copyModule': row.web?.copyModule,
      'native.component': row.native?.component,
      'native.state': row.native?.state,
      'native.copy': row.native?.copy,
      copySource: row.copySource,
    };
    const contents = {};
    for (const [label, path] of Object.entries(paths)) {
      if (typeof path !== 'string' || path.length === 0) {
        errors.push(`"${id}" has no "${label}"`);
        continue;
      }
      const text = read(path);
      if (text === null) {
        errors.push(`"${id}" names ${path}, which does not exist`);
        continue;
      }
      contents[label] = text;
    }

    if (typeof row.web?.copyExport !== 'string' || row.web.copyExport.length === 0) {
      errors.push(`"${id}" has no "web.copyExport"`);
    }
    if (typeof row.native?.copyObject !== 'string' || row.native.copyObject.length === 0) {
      errors.push(`"${id}" has no "native.copyObject"`);
    }

    if (row.copySource) {
      claimedSources.add(row.copySource);
      if (!copies.has(row.copySource)) {
        errors.push(`"${id}" names ${row.copySource}, which is not in shared/copy`);
      }
    }

    const states = row.states ?? [];
    if (states.length === 0) {
      errors.push(`"${id}" lists no states`);
    }

    const declared = contents['native.state'] ? declaredStates(contents['native.state']) : [];
    if (contents['native.state'] && declared.length > 0) {
      const listed = states.map((state) => state.name).sort();
      const actual = declared.slice().sort();
      if (listed.join(',') !== actual.join(',')) {
        errors.push(
          `"${id}" lists states ${listed.join(', ')} but ${row.native.state} declares ${actual.join(', ')}`
        );
      }
    }

    const strings = copies.get(row.copySource)?.strings ?? {};
    const webComponent = contents['web.component'] ?? '';
    const nativeComponent = contents['native.component'] ?? '';
    const webExport = row.web?.copyExport;
    const nativeObject = row.native?.copyObject;

    if (webExport && !webComponent.includes(webExport)) {
      errors.push(`"${id}": ${row.web.component} does not read ${webExport}`);
    }
    if (nativeObject && !nativeComponent.includes(nativeObject)) {
      errors.push(`"${id}": ${row.native.component} does not read ${nativeObject}`);
    }
    if (row.web?.copyModule && !webComponent.includes(moduleSpecifier(row.web.copyModule))) {
      errors.push(`"${id}": ${row.web.component} does not import ${row.web.copyModule}`);
    }

    for (const state of states) {
      if (!state.name) {
        errors.push(`"${id}" has a state with no "name"`);
        continue;
      }
      if (!state.copy) {
        errors.push(`"${id}" state "${state.name}" has no "copy" key`);
        continue;
      }
      if (!(state.copy in strings)) {
        errors.push(
          `"${id}" state "${state.name}" names copy "${state.copy}", which ${row.copySource} does not have`
        );
        continue;
      }
      if (webExport && !webComponent.includes(`${webExport}.${state.copy}`)) {
        errors.push(
          `"${id}" state "${state.name}" is not rendered by ${row.web.component} (expected ${webExport}.${state.copy})`
        );
      }
      if (
        nativeObject &&
        !nativeComponent.includes(`${nativeObject}.${constantName(state.copy)}`)
      ) {
        errors.push(
          `"${id}" state "${state.name}" is not rendered by ${row.native.component} (expected ${nativeObject}.${constantName(state.copy)})`
        );
      }
    }

    // The site is the reference: a string it does not render is copy that only
    // the app reads, which is the drift direction this pair exists to forbid.
    for (const key of Object.keys(strings)) {
      if (!webComponent.includes(`${webExport}.${key}`)) {
        errors.push(`"${row.copySource}" key "${key}" is not rendered by ${row.web.component}`);
      }
    }

    // Icons are design too: the glyph the site imports is the glyph the app must
    // draw, from the generated vector rather than a redrawing (ADR-0100).
    for (const icon of importedIcons(webComponent)) {
      usedIcons.add(icon);
      if (!listedIcons.has(icon)) {
        errors.push(
          `"${id}": ${row.web.component} imports the icon ${icon}, which shared/icons/icons.json does not list`
        );
        continue;
      }
      if (nativeObject && !nativeComponent.includes(`LucideVectors.${icon}`)) {
        errors.push(`"${id}": ${row.native.component} does not draw LucideVectors.${icon}`);
      }
      if (vectors && !vectors.includes(`val ${icon}:`)) {
        errors.push(`${VECTORS} has no generated ${icon}; run \`npm run vectors:generate\``);
      }
    }
  }

  for (const icon of listedIcons) {
    if (!usedIcons.has(icon)) {
      errors.push(`shared/icons/icons.json lists ${icon}, which no ported component draws`);
    }
  }

  for (const [source] of copies) {
    if (!claimedSources.has(source)) {
      errors.push(`${source} is not claimed by a row in docs/mobile/parity.json`);
    }
  }

  return errors;
}

/** `frontend/ui/account/plan-card-copy.ts` -> `./plan-card-copy`, as the import spells it. */
function moduleSpecifier(file) {
  return `./${file
    .split('/')
    .pop()
    .replace(/\.tsx?$/, '')}`;
}

function main() {
  for (const file of [MANIFEST, MATRIX]) {
    if (!existsSync(file)) {
      console.error(`x ${relative(ROOT, file)} is missing`);
      return 1;
    }
  }

  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const surfaces = JSON.parse(readFileSync(MATRIX, 'utf8'));
  const copies = copySources();
  const icons = existsSync(ICONS) ? JSON.parse(readFileSync(ICONS, 'utf8')) : null;
  const read = (file) => {
    const target = resolve(ROOT, file);
    return existsSync(target) ? readFileSync(target, 'utf8') : null;
  };

  if (!icons) {
    console.error(`x ${relative(ROOT, ICONS)} is missing`);
    return 1;
  }

  const errors = validate({ manifest, surfaces, copies, icons, read });
  if (errors.length > 0) {
    for (const error of errors) console.error(`x ${error}`);
    return 1;
  }

  const components = manifest.components ?? [];
  const states = components.reduce((total, row) => total + (row.states?.length ?? 0), 0);
  console.log(
    `  ok ${components.length} ported components, ${states} states, ${copies.size} copy sources`
  );
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
