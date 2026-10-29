/**
 * Generate both clients' design tokens from one source (ADR-0089, #647).
 *
 * The site and the app are two implementations of the same design rather than
 * one component tree, so the only thing that can hold them together is a file
 * neither of them owns the shape of: `shared/tokens/tokens.json`. This script
 * is the seam. It reads that file and emits
 *
 *   - `app/tokens.css` — the CSS custom properties Tailwind's `@theme` maps to
 *     utilities, plus the two `@font-face` declarations for the heading and
 *     digits faces;
 *   - `android/app/src/main/res/values/colors.xml` — the shell's own palette, in
 *     the form Android reads. The dialogs and the launch skeleton are drawn by the
 *     platform rather than by the WebView, so they cannot read a CSS custom
 *     property; this used to be twenty hex values restated by hand beside a
 *     comment explaining how to convert each one (ADR-0054).
 *   - `android/app/src/main/kotlin/com/royaraqamia/app/theme/DesignTokens.kt` —
 *     the same colours, type steps, spacing and radii as plain Kotlin constants
 *     the Compose theme reads;
 *   - `android/app/src/main/kotlin/com/royaraqamia/app/theme/ThemeColors.kt` —
 *     those colours in Compose's own `Color`, so the theme cannot name one the
 *     tokens do not have.
 *
 * Every output is committed, so a pull request that edits the token without
 * regenerating fails CI (`npm run check:tokens`), and a stylesheet that
 * re-declares a generated property by hand fails it too — that is the drift the
 * ADR is about.
 *
 * Usage:
 *
 *   node scripts/generate-tokens.mjs            # write every output
 *   node scripts/generate-tokens.mjs --check    # fail if they are stale
 *
 * Colour values stay HSL components (`240 10% 8%`) because that is what Tailwind's
 * `hsl(var(--background))` mapping consumes; Android's two outputs convert them
 * to ARGB, which is why the conversion is unit-tested rather than trusted.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const SOURCE = 'shared/tokens/tokens.json';
export const CSS_OUTPUT = 'app/tokens.css';
export const KOTLIN_OUTPUT =
  'android/app/src/main/kotlin/com/royaraqamia/app/theme/DesignTokens.kt';
export const ANDROID_COLORS_OUTPUT = 'android/app/src/main/res/values/colors.xml';
export const THEME_COLORS_OUTPUT =
  'android/app/src/main/kotlin/com/royaraqamia/app/theme/ThemeColors.kt';

/** The reverse of a `rem` length in CSS pixels, which is the unit Compose's `dp` reads. */
const REM = 16;

/** The radius token is `--radius`; the JSON name says what it is, not what it is called. */
const RADIUS_PROPERTIES = {
  base: '--radius',
};

/**
 * The spacing tokens predate the source and are referenced by name in every
 * surface stylesheet, so the JSON key and the custom property are not always the
 * same word. Mapping them here keeps the stylesheets still.
 */
const SPACE_PROPERTIES = {
  section: '--section-spacing',
  'section-sm': '--section-spacing-sm',
  'container-padding': '--container-padding',
  'card-padding': '--card-padding',
  'element-gap': '--element-gap',
  'element-gap-sm': '--element-gap-sm',
};

/** A CSS `clamp()` between a design floor and a viewport-scaled ceiling. */
export function fluid({ min, preferred, max }) {
  return `clamp(${min}, ${preferred}, ${max})`;
}

/** `240 10% 8%` -> the opaque ARGB value `0xFF14161A`, as a number. */
export function hslToArgbValue(components) {
  const match = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/.exec(components.trim());
  if (!match) {
    throw new Error(`generate-tokens: "${components}" is not an "H S% L%" triplet`);
  }
  const hue = Number(match[1]) % 360;
  const saturation = Number(match[2]) / 100;
  const lightness = Number(match[3]) / 100;

  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = lightness - chroma / 2;

  const sector = Math.floor(hue / 60);
  const [red, green, blue] = [
    [chroma, secondary, 0],
    [secondary, chroma, 0],
    [0, chroma, secondary],
    [0, secondary, chroma],
    [secondary, 0, chroma],
    [chroma, 0, secondary],
  ][sector];

  const channel = (value) => Math.round((value + offset) * 255);
  return (0xff000000 + (channel(red) << 16) + (channel(green) << 8) + channel(blue)) >>> 0;
}

/** A Kotlin `Long` literal: `0xFF14161A`. */
export function hslToArgb(components) {
  return `0x${hslToArgbValue(components).toString(16).toUpperCase().padStart(8, '0')}`;
}

/** An Android resource value: `#FF14161A`, with the alpha channel written out. */
export function toAndroidColor(value) {
  return `#${value.toString(16).toUpperCase().padStart(8, '0')}`;
}

/** `1.125rem` -> `18`. Any other unit is a token the generator cannot place on a device. */
export function remToDp(length) {
  const match = /^(-?\d+(?:\.\d+)?)rem$/.exec(length.trim());
  if (!match) {
    throw new Error(`generate-tokens: "${length}" is not a rem length the app can read`);
  }
  return Math.round(Number(match[1]) * REM * 100) / 100;
}

/**
 * `5vw` -> `5`, the slope of a fluid step. CSS resolves it against the viewport
 * and the app against the window's width in dp, which are the same measurement
 * of the same screen, so the two clients reach the same number at the same width.
 */
export function vw(length) {
  const match = /^(-?\d+(?:\.\d+)?)vw$/.exec(String(length).trim());
  if (!match) {
    throw new Error(`generate-tokens: "${length}" is not a vw length the app can read`);
  }
  return Number(match[1]);
}

/** A Kotlin `Float`, always with the suffix: `8f`, `-0.02f`. */
function float(value) {
  return `${Number(value)}f`;
}

/** `card-foreground` -> `cardForeground`, `h1` -> `H1`. */
export function camelCase(value) {
  return value.replace(/[-_]([a-z0-9])/g, (_, letter) => letter.toUpperCase());
}

export function pascalCase(value) {
  const camel = camelCase(value);
  return camel[0].toUpperCase() + camel.slice(1);
}

/** Every custom property this generator owns, in emission order. */
export function ownedProperties(tokens) {
  return [
    ...Object.keys(tokens.color).map((name) => `--${name}`),
    '--radius',
    ...Object.keys(tokens.space).map((name) => SPACE_PROPERTIES[name]),
    '--family-ui',
    '--family-heading',
    '--family-digits',
    ...Object.entries(tokens.type).flatMap(([step, entry]) => [
      `--type-${step}-size`,
      ...(entry.weight === undefined ? [] : [`--type-${step}-weight`]),
      ...(entry.lineHeight === undefined ? [] : [`--type-${step}-leading`]),
      ...(entry.letterSpacing === undefined ? [] : [`--type-${step}-tracking`]),
    ]),
    ...Object.keys(tokens.shadow).map((name) => `--shadow-${name}`),
    ...Object.keys(tokens.motion.duration).map((name) => `--duration-${name}`),
    ...Object.keys(tokens.motion.easing).map((name) => `--ease-${name}`),
  ];
}

/** Reject a source the emitters would otherwise render as `undefined`. */
export function validate(tokens) {
  for (const section of ['color', 'radius', 'space', 'font', 'type', 'shadow', 'motion', 'shell']) {
    if (!tokens[section] || typeof tokens[section] !== 'object') {
      throw new Error(`generate-tokens: the source has no "${section}" section`);
    }
  }
  for (const [name, value] of Object.entries(tokens.color)) {
    if (typeof value !== 'string') {
      throw new Error(`generate-tokens: color "${name}" is not an HSL triplet`);
    }
    hslToArgb(value);
  }
  for (const required of ['ui', 'heading', 'digits']) {
    if (!tokens.font[required]?.family) {
      throw new Error(`generate-tokens: the source has no "${required}" font family`);
    }
  }
  for (const [name, entry] of Object.entries(tokens.type)) {
    fluid(entry.size);
    vw(entry.size.preferred);
    if (!entry.lineHeight) {
      throw new Error(`generate-tokens: type step "${name}" has no line height`);
    }
  }
  for (const [name, entry] of Object.entries(tokens.space)) {
    if (!SPACE_PROPERTIES[name]) {
      throw new Error(`generate-tokens: spacing token "${name}" has no custom property name`);
    }
    fluid(entry);
    vw(entry.preferred);
  }
  if (!tokens.shell.color || Object.keys(tokens.shell.color).length === 0) {
    throw new Error('generate-tokens: the source has no "shell.color" entries');
  }
  shellColors(tokens);
  return tokens;
}

/** The note for a token, wrapped to a readable width. Empty when there is none. */
function noteLines(tokens, key, width = 76) {
  const note = tokens.notes?.[key];
  if (!note) {
    return [];
  }
  const lines = [];
  let current = '';
  for (const word of note.split(/\s+/)) {
    if (current && `${current} ${word}`.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

/**
 * A token's own reasoning, wrapped as CSS comments. The source is JSON, so a
 * note lives beside the value it explains instead of in a stylesheet that no
 * longer declares it.
 */
export function commentFor(tokens, section, name) {
  const lines = noteLines(tokens, `${section}.${name}`);
  return lines.length === 0 ? [] : ['    /*', ...lines.map((line) => `       ${line}`), '     */'];
}

/** The same note in XML, which is the form Android's resources are read in. */
function xmlComment(tokens, key, indent = '    ') {
  const lines = noteLines(tokens, key);
  return lines.length === 0
    ? []
    : [`${indent}<!--`, ...lines.map((l) => `${indent}  ${l}`), `${indent}-->`];
}

function fontFace(face, { unicodeRange = false } = {}) {
  const lines = [
    '@font-face {',
    `  font-family: '${face.family}';`,
    `  src: url('${face.file}') format('woff2');`,
    `  font-weight: ${face.weight};`,
    '  font-style: normal;',
    '  font-display: swap;',
  ];
  if (unicodeRange && face.unicodeRange) {
    lines.push(`  unicode-range: ${face.unicodeRange};`);
  }
  lines.push('}');
  return lines;
}

/** The web half: custom properties plus the two faces they name. */
export function renderCss(tokens) {
  validate(tokens);

  const lines = [
    '/* Generated by `npm run tokens:generate` from `shared/tokens/tokens.json`.',
    '   Do not edit: change the token and regenerate.',
    '   `npm run check:tokens` fails when this file is stale, and it fails a',
    '   stylesheet that re-declares one of these properties by hand. */',
    '',
    '/* Aref Ruqaa is declared by hand rather than through `next/font/local`: the',
    '   site needs two faces backed by the same file, one for headings and one',
    '   restricted to digits. `unicode-range` is what lets numerals pick Aref Ruqaa',
    '   without changing the family of the surrounding Arabic text. */',
    ...fontFace(tokens.font.heading),
    '',
    ...fontFace(tokens.font.digits, { unicodeRange: true }),
    '',
    '@layer base {',
    '  :root {',
    '    /* Colour. HSL components, so a utility can compose alpha onto one:',
    '       `hsl(var(--primary) / 0.12)` (see `app/theme.css`). */',
  ];

  for (const [name, value] of Object.entries(tokens.color)) {
    lines.push(...commentFor(tokens, 'color', name), `    --${name}: ${value};`);
  }

  lines.push('', '    /* Radii. The scale above this is derived in `app/theme.css`. */');
  for (const [name, value] of Object.entries(tokens.radius)) {
    lines.push(...commentFor(tokens, 'radius', name), `    ${RADIUS_PROPERTIES[name]}: ${value};`);
  }

  lines.push('', '    /* Spacing. Fluid between its floor and its ceiling. */');
  for (const [name, entry] of Object.entries(tokens.space)) {
    lines.push(
      ...commentFor(tokens, 'space', name),
      `    ${SPACE_PROPERTIES[name]}: ${fluid(entry)};`
    );
  }

  lines.push(
    '',
    '    /* Families. The UI face is a `next/font` variable on the web and a bundled',
    '       face in the app; the other two are the calligraphic pair above. */',
    `    --family-ui: '${tokens.font.ui.family}';`,
    `    --family-heading: '${tokens.font.heading.family}';`,
    `    --family-digits: '${tokens.font.digits.family}';`
  );

  lines.push(
    '',
    '    /* Type scale. A step is one floor and one ceiling; the element rules in',
    '       `app/global.css` and the `.text-fluid-*` utilities both read these, so a',
    '       step cannot be right in one place and wrong in another. */'
  );
  for (const [step, entry] of Object.entries(tokens.type)) {
    lines.push(`    --type-${step}-size: ${fluid(entry.size)};`);
    if (entry.weight !== undefined) {
      lines.push(`    --type-${step}-weight: ${entry.weight};`);
    }
    if (entry.lineHeight !== undefined) {
      lines.push(`    --type-${step}-leading: ${entry.lineHeight};`);
    }
    if (entry.letterSpacing !== undefined) {
      lines.push(`    --type-${step}-tracking: ${entry.letterSpacing};`);
    }
  }

  lines.push('', '    /* Elevation. */');
  for (const [name, value] of Object.entries(tokens.shadow)) {
    lines.push(`    --shadow-${name}: ${value};`);
  }

  lines.push('', '    /* Motion. */');
  for (const [name, value] of Object.entries(tokens.motion.duration)) {
    lines.push(`    --duration-${name}: ${value};`);
  }
  for (const [name, value] of Object.entries(tokens.motion.easing)) {
    lines.push(`    --ease-${name}: ${value};`);
  }

  lines.push('  }', '}', '');
  return lines.join('\n');
}

/**
 * The shell's colours, resolved to Android's `#AARRGGBB`.
 *
 * An entry is either a `token` from the shared palette or a `hex` only the shell
 * needs, and either may carry an `alpha` — what the site writes as `bg-black/70`
 * or `border-border/60` and what Android needs flattened into the value itself.
 * Only the colours the shell actually draws are emitted, under the resource names
 * it already references, so adding a token cannot quietly add a resource.
 */
export function shellColors(tokens) {
  const colors = new Map();
  for (const [name, entry] of Object.entries(tokens.shell?.color ?? {})) {
    let value;
    if (entry.token !== undefined) {
      const triplet = tokens.color[entry.token];
      if (triplet === undefined) {
        throw new Error(
          `generate-tokens: shell colour "${name}" names unknown token "${entry.token}"`
        );
      }
      value = hslToArgbValue(triplet);
    } else if (entry.hex !== undefined) {
      const match = /^#([0-9A-Fa-f]{6})$/.exec(entry.hex);
      if (!match) {
        throw new Error(`generate-tokens: shell colour "${name}" is not a "#RRGGBB" value`);
      }
      value = 0xff000000 + parseInt(match[1], 16);
    } else {
      throw new Error(
        `generate-tokens: shell colour "${name}" has neither a "token" nor a "hex" value`
      );
    }

    const alpha = entry.alpha ?? 1;
    if (!(alpha >= 0 && alpha <= 1)) {
      throw new Error(`generate-tokens: shell colour "${name}" has an alpha outside 0-1`);
    }
    colors.set(
      `roy_${name.replace(/-/g, '_')}`,
      toAndroidColor(((value & 0x00ffffff) | (Math.round(alpha * 255) << 24)) >>> 0)
    );
  }
  return colors;
}

/** The app's resource palette: the colours the platform draws with. */
export function renderAndroidColors(tokens) {
  validate(tokens);

  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!--',
    '  Generated by `npm run tokens:generate` from `shared/tokens/tokens.json`.',
    '  Do not edit: change the token and regenerate.',
    '',
    "  The shell's dialogs, its launch skeleton and its update bar are drawn by",
    '  Android rather than by the WebView, so they cannot read a CSS custom',
    "  property (ADR-0054). A colour with a `token` is one of the site's own; one",
    '  with only a `hex` is a colour only the shell needs. `npm run check:tokens`',
    '  fails a stale copy, which is what keeps the two clients agreeing.',
    '-->',
    '<resources>',
  ];

  const colors = shellColors(tokens);
  for (const name of Object.keys(tokens.shell.color)) {
    const resource = `roy_${name.replace(/-/g, '_')}`;
    lines.push(...xmlComment(tokens, `shell.color.${name}`));
    lines.push(`    <color name="${resource}">${colors.get(resource)}</color>`);
  }

  lines.push('</resources>', '');
  return lines.join('\n');
}

export function weightRange(weight) {
  const parts = String(weight).trim().split(/\s+/).map(Number);
  if (parts.length === 0 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error(`generate-tokens: "${weight}" is not a weight or a range`);
  }
  return [parts[0], parts[parts.length - 1]];
}

/** `U+0030-0039` -> `[0x0030, 0x0039]`, the range the digits face supplies. */
function unicodeRange(range) {
  const match = /^U\+([0-9A-Fa-f]+)-U?\+?([0-9A-Fa-f]+)$/.exec(range.trim());
  if (!match) {
    throw new Error(`generate-tokens: "${range}" is not a two-ended unicode range`);
  }
  return [parseInt(match[1], 16), parseInt(match[2], 16)];
}

/** The app half: the same numbers, in the units Compose reads. */
export function renderKotlin(tokens) {
  validate(tokens);

  const lines = [
    '// Generated by `npm run tokens:generate` from `shared/tokens/tokens.json`.',
    '// Do not edit: change the token and regenerate.',
    '// `npm run check:tokens` fails when this file is stale.',
    'package com.royaraqamia.app.theme',
    '',
    '/**',
    ' * The design tokens the app draws from (ADR-0089). The web reads the same file',
    ' * as CSS custom properties (`app/tokens.css`), so a colour, a type step or a',
    ' * radius cannot exist in one client and not the other.',
    ' *',
    ' * Colours are opaque ARGB in a [Long]: `0xFFRRGGBB`. Compose wants an `Int`',
    ' * (`Color(argb.toInt())`), which is a cast, not a different value.',
    ' */',
    'object DesignTokens {',
    '    /** Surfaces, text and accents. */',
    '    object Colors {',
  ];

  for (const [name, value] of Object.entries(tokens.color)) {
    lines.push(`        const val ${camelCase(name)}: Long = ${hslToArgb(value)}`);
  }

  lines.push('    }', '');
  lines.push('    /** The one base radius; the CSS scale derives from it in `app/theme.css`. */');
  lines.push('    object Radii {');
  for (const [name, value] of Object.entries(tokens.radius)) {
    lines.push(`        const val ${camelCase(name)}: Float = ${float(remToDp(value))}`);
  }
  lines.push('    }', '');

  lines.push(
    '    /**',
    '     * Fluid spacing, in dp: a surface resolves `clamp([min], [preferred]vw,',
    "     * [max])` against the window's width, the way the stylesheet does, instead",
    '     * of picking one number that is wrong on a phone or on a tablet.',
    '     */',
    '    object Spacing {'
  );
  for (const [name, entry] of Object.entries(tokens.space)) {
    lines.push(`        const val ${camelCase(name)}Min: Float = ${float(remToDp(entry.min))}`);
    lines.push(
      `        const val ${camelCase(name)}Preferred: Float = ${float(vw(entry.preferred))}`
    );
    lines.push(`        const val ${camelCase(name)}Max: Float = ${float(remToDp(entry.max))}`);
  }
  lines.push('    }', '');

  lines.push('    /** Type scale, in sp. Letter spacing is a multiple of the size. */');
  lines.push('    object TypeScale {');
  for (const [step, entry] of Object.entries(tokens.type)) {
    lines.push(`        object ${pascalCase(step)} {`);
    lines.push(`            const val sizeMin: Float = ${float(remToDp(entry.size.min))}`);
    lines.push(`            const val sizePreferred: Float = ${float(vw(entry.size.preferred))}`);
    lines.push(`            const val sizeMax: Float = ${float(remToDp(entry.size.max))}`);
    if (entry.weight !== undefined) {
      lines.push(`            const val weight: Int = ${entry.weight}`);
    }
    lines.push(`            const val lineHeight: Float = ${float(entry.lineHeight)}`);
    if (entry.letterSpacing !== undefined) {
      lines.push(
        `            const val letterSpacingEm: Float = ${float(Number(entry.letterSpacing.replace('em', '')))}`
      );
    }
    lines.push('        }', '');
  }
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  lines.push('    }', '');

  const [digitsMin, digitsMax] = weightRange(tokens.font.digits.weight);
  const [rangeStart, rangeEnd] = tokens.font.digits.unicodeRange
    ? unicodeRange(tokens.font.digits.unicodeRange)
    : [];

  lines.push('    /** Families. The faces themselves are bundled resources. */');
  lines.push('    object Fonts {');
  lines.push(`        const val uiFamily = "${tokens.font.ui.family}"`);
  lines.push(`        const val headingFamily = "${tokens.font.heading.family}"`);
  lines.push(`        const val headingWeight = ${weightRange(tokens.font.heading.weight)[0]}`);
  lines.push(`        const val digitsFamily = "${tokens.font.digits.family}"`);
  lines.push(`        const val digitsWeightMin = ${digitsMin}`);
  lines.push(`        const val digitsWeightMax = ${digitsMax}`);
  if (rangeStart !== undefined) {
    lines.push(
      `        /** The code points the digits face supplies: only ever numerals. */`,
      `        const val digitsRangeStart = ${rangeStart}`,
      `        const val digitsRangeEnd = ${rangeEnd}`
    );
  }
  lines.push('    }', '');

  lines.push('    /** Durations, in milliseconds. Easing curves stay in the platform. */');
  lines.push('    object Motion {');
  for (const [name, value] of Object.entries(tokens.motion.duration)) {
    const seconds = Number(value.replace('s', ''));
    lines.push(`        const val ${camelCase(name)}Ms: Int = ${Math.round(seconds * 1000)}`);
  }
  lines.push('    }', '}', '');

  return lines.join('\n');
}

/** The token colours in Compose's `Color`, which is what the theme draws with. */
export function renderThemeColors(tokens) {
  validate(tokens);

  const lines = [
    '// Generated by `npm run tokens:generate` from `shared/tokens/tokens.json`.',
    '// Do not edit: change the token and regenerate.',
    '// `npm run check:tokens` fails when this file is stale.',
    'package com.royaraqamia.app.theme',
    '',
    'import androidx.compose.ui.graphics.Color',
    '',
    '/**',
    ' * Every colour the token source names, in the type Compose draws with',
    ' * (ADR-0089). [DesignTokens] holds the same numbers as `Long`s, which is what',
    ' * the generated resources and the Java the shell still carries read; this is',
    ' * that file in `Color`, which is what the theme and every screen read.',
    ' *',
    ' * The site is dark only — `app/global.css` declares its palette once in `:root`',
    ' * rather than under a `.dark` class (ADR-0054) — so there is one of these and no',
    ' * light sibling to keep in step.',
    ' */',
    'object RoyColors {',
  ];

  for (const name of Object.keys(tokens.color)) {
    const field = camelCase(name);
    lines.push(`    val ${field} = Color(DesignTokens.Colors.${field}.toInt())`);
  }

  lines.push('}', '');
  return lines.join('\n');
}

/** Every output, keyed by repo-relative path, without touching the disk. */
export async function generate() {
  const source = JSON.parse(await readFile(path.join(ROOT, SOURCE), 'utf8'));
  return new Map([
    [CSS_OUTPUT, renderCss(source)],
    [ANDROID_COLORS_OUTPUT, renderAndroidColors(source)],
    [KOTLIN_OUTPUT, renderKotlin(source)],
    [THEME_COLORS_OUTPUT, renderThemeColors(source)],
  ]);
}

/** Declarations of an owned property outside the generated stylesheet. */
export async function findHandEditedTokens(tokens) {
  const owned = new Set(ownedProperties(tokens));
  const findings = [];

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = path
        .relative(ROOT, path.join(directory, entry.name))
        .split(path.sep)
        .join('/');
      if (entry.isDirectory()) {
        await walk(path.join(directory, entry.name));
        continue;
      }
      if (!entry.name.endsWith('.css') || relative === CSS_OUTPUT) {
        continue;
      }
      const contents = await readFile(path.join(directory, entry.name), 'utf8');
      contents.split('\n').forEach((line, index) => {
        const match = /^\s*(--[a-z0-9-]+)\s*:/.exec(line);
        if (match && owned.has(match[1])) {
          findings.push(`${relative}:${index + 1}: ${match[1]}`);
        }
      });
    }
  }

  for (const directory of ['app', 'frontend']) {
    await walk(path.join(ROOT, directory));
  }
  return findings;
}

async function main(argv) {
  const check = argv.includes('--check');
  const source = JSON.parse(await readFile(path.join(ROOT, SOURCE), 'utf8'));
  const files = new Map([
    [CSS_OUTPUT, renderCss(source)],
    [ANDROID_COLORS_OUTPUT, renderAndroidColors(source)],
    [KOTLIN_OUTPUT, renderKotlin(source)],
    [THEME_COLORS_OUTPUT, renderThemeColors(source)],
  ]);

  if (!check) {
    validate(source);
    for (const [file, contents] of files) {
      const target = path.join(ROOT, file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, contents, 'utf8');
    }
    const findings = await findHandEditedTokens(source);
    if (findings.length > 0) {
      process.stderr.write(
        'A stylesheet re-declares a generated token. Move it into ' +
          `\`${SOURCE}\` and regenerate:\n${findings.map((line) => `  ${line}\n`).join('')}`
      );
      return 1;
    }
    return 0;
  }

  const stale = [];
  for (const [file, contents] of files) {
    let onDisk = null;
    try {
      onDisk = await readFile(path.join(ROOT, file), 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    if (onDisk !== contents) {
      stale.push(file);
    }
  }
  if (stale.length > 0) {
    process.stderr.write(
      `Generated tokens are stale: ${stale.join(', ')}\n` +
        'Run `npm run tokens:generate` and commit the result.\n'
    );
    return 1;
  }

  const findings = await findHandEditedTokens(source);
  if (findings.length > 0) {
    process.stderr.write(
      'A stylesheet re-declares a generated token. Move it into ' +
        `\`${SOURCE}\` and regenerate:\n${findings.map((line) => `  ${line}\n`).join('')}`
    );
    return 1;
  }

  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    }
  );
}
