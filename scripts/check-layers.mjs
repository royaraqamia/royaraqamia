import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';

/**
 * The two-compilation boundary, checked (ADR-0132).
 *
 * The site ships one Tailwind build for the shell (`app/global.css`) and one per
 * surface (`app/<surface>/app.css`). The two overlap — an element can carry a
 * class compiled by one and a class compiled by the other — so a layer has to
 * decide, and it cannot decide correctly for every element. The order is fixed
 * (a surface's utilities outrank the shell's), which leaves one shape to ban:
 *
 *   a shell component that pairs a base utility with a breakpoint variant.
 *
 * The base rule is emitted by every surface that happens to use that base class,
 * and that copy wins the property, so the shell's `sm:`/`lg:` step never applies.
 * That is how the popper scrim lost `max-lg:block` and every `Card` lost its
 * desktop padding. The fix is to write the pair as two variants — `max-sm:pt-5
 * sm:pt-6`, never `pt-5 sm:pt-6` — because a variant class can only be outranked
 * by another variant, which is the same compilation.
 *
 * Only the surfaces that actually render a component can break it, so the check
 * follows imports: a pair is reported when a surface in the component's reach has
 * the base class compiled and not the variant.
 *
 * Run: `npm run check:layers`. Needs no server and no build.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHELL_ENTRY = 'app/global.css';
/** The shell chrome every route renders, whatever surface it belongs to. */
const ROOT_LAYOUT = join(ROOT, 'app', 'layout.tsx');

/** The breakpoint prefixes Tailwind emits. `hover:` and `dark:` are not among
 *  them: a state variant losing to a base declaration is the design, not this
 *  bug, and the check cannot tell the two apart. */
const BREAKPOINTS = ['sm', 'md', 'lg', 'xl', '2xl'];
const BREAKPOINT_VARIANT = new RegExp(`^(?:max-)?(?:${BREAKPOINTS.join('|')}):`);

const unescapeClass = (name) => name.replace(/\\(.)/g, '$1');

/**
 * Padding, margin, inset, borders and the flex shorthands are one property with
 * several names. Comparing raw property names would miss `py-4` vs `pt-5`, which
 * is the shape most of these pairs take.
 */
export function atoms(property) {
  const p = property.toLowerCase().replace(/^-(webkit|moz)-/, '');

  const sided = (base, all, map) => {
    const match = p.match(
      new RegExp(
        `^${base}(?:-(top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?$`
      )
    );
    if (!match) return null;
    return match[1] ? map[match[1]] : all;
  };

  const padding = sided(
    'padding',
    ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
    {
      top: ['padding-top'],
      bottom: ['padding-bottom'],
      left: ['padding-left', 'padding-inline-start'],
      right: ['padding-right', 'padding-inline-end'],
      inline: ['padding-left', 'padding-right', 'padding-inline-start', 'padding-inline-end'],
      block: ['padding-top', 'padding-bottom', 'padding-block-start', 'padding-block-end'],
      'inline-start': ['padding-inline-start', 'padding-left'],
      'inline-end': ['padding-inline-end', 'padding-right'],
      'block-start': ['padding-block-start', 'padding-top'],
      'block-end': ['padding-block-end', 'padding-bottom'],
    }
  );
  if (padding) return padding;

  const margin = sided('margin', ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'], {
    top: ['margin-top'],
    bottom: ['margin-bottom'],
    left: ['margin-left', 'margin-inline-start'],
    right: ['margin-right', 'margin-inline-end'],
    inline: ['margin-left', 'margin-right', 'margin-inline-start', 'margin-inline-end'],
    block: ['margin-top', 'margin-bottom', 'margin-block-start', 'margin-block-end'],
    'inline-start': ['margin-inline-start', 'margin-left'],
    'inline-end': ['margin-inline-end', 'margin-right'],
    'block-start': ['margin-block-start', 'margin-top'],
    'block-end': ['margin-block-end', 'margin-bottom'],
  });
  if (margin) return margin;

  if (p === 'inset') return ['top', 'right', 'bottom', 'left'];
  if (p === 'inset-x') return ['left', 'right'];
  if (p === 'inset-y') return ['top', 'bottom'];
  if (['top', 'bottom', 'left', 'right'].includes(p)) return [p];
  if (p === 'inset-inline') return ['left', 'right', 'inset-inline-start', 'inset-inline-end'];
  if (p === 'inset-inline-start') return ['inset-inline-start', 'left'];
  if (p === 'inset-inline-end') return ['inset-inline-end', 'right'];
  if (p === 'inset-block') return ['top', 'bottom'];
  if (p === 'inset-block-start') return ['inset-block-start', 'top'];
  if (p === 'inset-block-end') return ['inset-block-end', 'bottom'];

  if (p === 'border') return ['border-width', 'border-style', 'border-color'];
  if (p === 'border-radius' || /^border-[a-z-]+-radius$/.test(p)) return ['border-radius'];
  if (
    p === 'border-width' ||
    /^border-(top|right|bottom|left|inline-start|inline-end|block-start|block-end)(-width)?$/.test(
      p
    )
  ) {
    return ['border-width'];
  }

  if (p === 'overflow') return ['overflow-x', 'overflow-y'];
  if (p === 'gap') return ['row-gap', 'column-gap'];
  if (p === 'flex') return ['flex-grow', 'flex-shrink', 'flex-basis', 'flex'];
  if (p === 'flex-flow') return ['flex-direction', 'flex-wrap', 'flex-flow'];
  if (p === 'font') return ['font-size', 'font-weight', 'line-height', 'font-family', 'font'];
  if (p === 'background') return ['background-color', 'background-image', 'background'];
  if (p === 'place-items') return ['align-items', 'justify-items'];
  if (p === 'place-content') return ['align-content', 'justify-content'];
  return [p];
}

/** `class -> Set(atom)` from a compiled stylesheet. */
export function classAtoms(css) {
  const map = new Map();
  postcss.parse(css).walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes/i.test(rule.parent.name)) return;
    const names = [];
    for (const selector of rule.selectors ?? []) {
      const match = selector.match(/^\.((?:\\.|[^\\\s.:>+~[\]()])+)(?::[a-z-]+(?:\([^)]*\))?)*$/);
      if (match) names.push(unescapeClass(match[1]));
    }
    if (names.length === 0) return;
    const properties = new Set();
    rule.walkDecls((declaration) => {
      for (const atom of atoms(declaration.prop)) properties.add(atom);
    });
    if (properties.size === 0) return;
    for (const name of names) {
      if (!map.has(name)) map.set(name, new Set());
      for (const atom of properties) map.get(name).add(atom);
    }
  });
  return map;
}

/**
 * Blank out comments, keeping every offset and line break where it was, so a
 * doc comment that happens to name a utility ("`lg` and up get the fully
 * rounded pill") cannot be read as a class list.
 */
export function maskComments(source) {
  let out = '';
  let index = 0;
  let quote = null;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (quote) {
      out += char;
      if (char === '\\') {
        out += next ?? '';
        index += 2;
        continue;
      }
      if (char === quote) quote = null;
      index += 1;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      out += char;
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(index, stop).replace(/[^\n]/g, ' ');
      index = stop;
      continue;
    }

    if (char === '/' && next === '/' && source[index - 1] !== ':') {
      const end = source.indexOf('\n', index);
      const stop = end === -1 ? source.length : end;
      out += ' '.repeat(stop - index);
      index = stop;
      continue;
    }

    out += char;
    index += 1;
  }

  return out;
}

/**
 * Every class list in a file, with the line it starts on.
 *
 * A `className=` expression is one list: its literals are arguments to the same
 * `cn(...)` and land on the same element, so `grid` in one and `max-sm:flex` in
 * the next still compete. A literal outside a `className=` is a class list of
 * its own — a shell component often keeps its sizes in a constant (`const SIZE =
 * { section: 'text-3xl sm:text-4xl' }`). `known` is the union of both
 * compilations, so only a real utility is read as one.
 */
export function classLists(source, known) {
  const code = maskComments(source);
  const lists = [];
  const consumed = [];

  const attribute = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g;
  let match;
  while ((match = attribute.exec(code))) {
    const body = match[1] ?? match[2] ?? match[3] ?? '';
    const start = match.index + match[0].indexOf(body);
    consumed.push([start, start + body.length]);

    const literals =
      match[3] === undefined
        ? [body]
        : [...body.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((found) => found[2]);
    const tokens = literals
      .flatMap((literal) => literal.split(/\s+/))
      .filter((token) => known.has(token));
    if (tokens.length >= 2) {
      lists.push({ tokens, line: code.slice(0, match.index).split('\n').length });
    }
  }

  const literal = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
  while ((match = literal.exec(code))) {
    const inside = consumed.some(([from, to]) => match.index >= from && match.index < to);
    if (inside) continue;
    const tokens = match[2].split(/\s+/).filter((token) => known.has(token));
    if (tokens.length < 2) continue;
    lists.push({ tokens, line: code.slice(0, match.index).split('\n').length });
  }

  return lists;
}

/** `{a,b}` alternatives, so a `@source` can name several files in one line. */
export function expandBraces(pattern) {
  const match = pattern.match(/\{([^{}]*)\}/);
  if (!match) return [pattern];
  return match[1].split(',').flatMap((part) => expandBraces(pattern.replace(match[0], part)));
}

const CODE = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      walk(full, out);
    } else if (CODE.has(extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

/** Every file a stylesheet entry lists in its `@source`s. */
export function sourceFiles(entry) {
  const absolute = join(ROOT, entry);
  const css = readFileSync(absolute, 'utf8');
  const files = new Set();

  for (const directive of css.matchAll(/@source\s+['"]([^'"]+)['"]/g)) {
    for (const pattern of expandBraces(directive[1])) {
      const target = resolve(dirname(absolute), pattern);
      let stats;
      try {
        stats = statSync(target);
      } catch {
        continue;
      }
      if (stats.isDirectory()) for (const file of walk(target, [])) files.add(file);
      else files.add(target);
    }
  }
  return files;
}

/** The stylesheet entries: the shell, plus every surface that brings its own. */
export function entries() {
  const app = join(ROOT, 'app');
  const found = [];
  for (const entry of readdirSync(app, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = join(app, entry.name, 'app.css');
    try {
      if (statSync(candidate).isFile()) found.push(relative(ROOT, candidate).replace(/\\/g, '/'));
    } catch {
      // Not a surface.
    }
  }
  for (const shared of ['app/landing.css', 'app/leads.css', 'app/marketing.css']) {
    try {
      if (statSync(join(ROOT, shared)).isFile()) found.push(shared);
    } catch {
      // Not shipped.
    }
  }
  return found;
}

const IMPORTS = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;

/** `@/x` is the repository root, `./x` is relative to the importing file. */
export function resolveSpecifier(from, specifier) {
  let base;
  if (specifier.startsWith('@/')) base = join(ROOT, specifier.slice(2));
  else if (specifier.startsWith('.')) base = resolve(dirname(from), specifier);
  else return null;

  for (const suffix of ['', '.tsx', '.ts', '/index.tsx', '/index.ts']) {
    const candidate = base + suffix;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Everything a route draws: its own sources, their imports, and the shell's. */
function reachable(entry) {
  const seen = new Set();
  const queue = [...sourceFiles(entry), ROOT_LAYOUT];
  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(IMPORTS)) {
      const resolved = resolveSpecifier(file, match[1]);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return seen;
}

async function compile(entry) {
  const css = readFileSync(join(ROOT, entry), 'utf8');
  const result = await postcss([tailwindcss()]).process(css, {
    from: join(ROOT, entry),
    to: join(ROOT, entry),
  });
  return result.css;
}

export async function main() {
  const shell = classAtoms(await compile(SHELL_ENTRY));

  const surfaces = new Map();
  for (const entry of entries()) surfaces.set(entry, classAtoms(await compile(entry)));

  // Every class either compilation emits; a literal is only read as a class list
  // when the words in it are those classes.
  const known = new Set(shell.keys());
  for (const compiled of surfaces.values()) for (const name of compiled.keys()) known.add(name);

  // Which surfaces can draw a given shell file at all.
  const reachedBy = new Map();
  for (const entry of surfaces.keys()) {
    for (const file of reachable(entry)) {
      if (!reachedBy.has(file)) reachedBy.set(file, new Set());
      reachedBy.get(file).add(entry);
    }
  }

  const findings = [];
  for (const file of sourceFiles(SHELL_ENTRY)) {
    const surfacesDrawingIt = reachedBy.get(file);
    if (!surfacesDrawingIt) continue;

    const source = readFileSync(file, 'utf8');
    for (const { tokens, line } of classLists(source, known)) {
      const bases = tokens.filter((token) => !token.includes(':') && shell.has(token));
      const variants = tokens.filter((token) => BREAKPOINT_VARIANT.test(token) && shell.has(token));

      for (const base of bases) {
        for (const variant of variants) {
          const shared = [...shell.get(base)].filter((atom) => shell.get(variant).has(atom));
          if (shared.length === 0) continue;

          const losing = [...surfacesDrawingIt].filter((entry) => {
            const compiled = surfaces.get(entry);
            return compiled.has(base) && !compiled.has(variant);
          });
          if (losing.length === 0) continue;

          findings.push({
            file: relative(ROOT, file).replace(/\\/g, '/'),
            line,
            base,
            variant,
            properties: shared,
            surfaces: losing.map((entry) => entry.replace(/^app\//, '').replace(/\/app\.css$/, '')),
          });
        }
      }
    }
  }

  if (findings.length === 0) {
    console.log('✓ layers: no shell component pairs a base utility with a breakpoint variant');
    return;
  }

  console.error(
    `✗ layers: ${findings.length} shell component pair(s) lose their breakpoint step.\n` +
      `  A surface compiles the base class too and outranks the shell (ADR-0132), so the\n` +
      `  variant below never applies. Write the base as the opposite variant instead —\n` +
      `  \`max-sm:pt-5 sm:pt-6\`, never \`pt-5 sm:pt-6\`.\n`
  );
  for (const finding of findings) {
    console.error(
      `  ${finding.file}:${finding.line}  ${finding.base} + ${finding.variant}  ` +
        `[${finding.properties.join(', ')}]  on ${finding.surfaces.join(', ')}`
    );
  }
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
