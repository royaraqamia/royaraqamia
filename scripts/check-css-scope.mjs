/**
 * Route-scoped CSS guardrail (R2).
 *
 * Recompiles the global Tailwind entry (app/global.css) and every product
 * scoped entry (app/<product>/globals.css) with @tailwindcss/postcss, then
 * reports sizes. Fails (exit 1) if:
 *   - the global entry regresses above GLOBAL_MAX_KB (a new product was added
 *     without carving it out of the global scan), or
 *   - a product entry compiles empty/broken (its @source list lost its dirs),
 *     or
 *   - a product entry balloons near the global size (its @source not list lost
 *     the "everything else" exclusions).
 *
 * Keep app/global.css's `@source not` block and the entries in sync with this
 * product list.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GLOBAL_MAX_KB = 680;
const ENTRY_MIN_KB = 3;
const ENTRY_MAX_KB = 300;

const PRODUCTS = ['blogpress', 'spendtrack', 'habitflow', 'linksnap', 'admin'];

async function compile(cssPath) {
  const css = readFileSync(cssPath, 'utf8');
  const result = await postcss([tailwindcss]).process(css, {
    from: cssPath,
    to: join(ROOT, 'node_modules', '.cache', 'css-scope-check.css'),
  });
  return result.css;
}

const kb = (bytes) => (bytes.length / 1024).toFixed(1);

let failures = 0;

function check(label, sizeKB, min, max) {
  const pass = sizeKB >= min && sizeKB <= max;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label.padEnd(28)} ${String(sizeKB).padStart(8)} KB`);
  if (!pass) failures += 1;
}

const globalCss = join(ROOT, 'app', 'global.css');
const globalSize = kb(await compile(globalCss));
check('global (app/global.css)', globalSize, 0, GLOBAL_MAX_KB);

for (const product of PRODUCTS) {
  const entry = join(ROOT, 'app', product, 'globals.css');
  if (!existsSync(entry)) {
    console.error(`FAIL  missing product entry: app/${product}/globals.css`);
    failures += 1;
    continue;
  }
  const size = kb(await compile(entry));
  check(`product:${product}`, size, ENTRY_MIN_KB, ENTRY_MAX_KB);
}

const entriesDir = join(ROOT, 'app');
const unexpected = readdirSync(entriesDir)
  .filter((d) => PRODUCTS.includes(d))
  .filter((d) => !existsSync(join(entriesDir, d, 'globals.css')));
if (unexpected.length) {
  console.error(`FAIL  products missing globals.css entries: ${unexpected.join(', ')}`);
  failures += 1;
}

if (failures > 0) {
  console.error(`\n${failures} CSS scope check(s) failed.`);
  process.exit(1);
}
console.log('\nCSS scope OK.');
