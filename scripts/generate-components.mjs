/**
 * One description of a component, emitted to both clients (#647, ADR-0099).
 *
 * `shared/tokens/tokens.json` makes a colour or a radius the same number in the
 * site and the app. It cannot make a *component* the same: the plan card drew
 * 8dp corners against the site's 16 because "a card" was a Tailwind string on one
 * side and a hand-picked Material shape on the other, and the same was true of its
 * padding, its skeleton blocks and the gap between two rows.
 *
 * `shared/components/recipes.json` is the description. This script reads it and
 * emits
 *
 *   - `app/components.css` — the site's class per primitive, built from the token
 *     custom properties, so a token change moves the component too;
 *   - `android/app/src/main/kotlin/com/royaraqamia/app/theme/Recipes.kt` — the
 *     same primitives in the types Compose draws with.
 *
 * Every output is committed, so a pull request that edits a recipe without
 * regenerating fails CI (`npm run check:components`), and a name that is not in
 * the token source is refused here rather than rendering as nothing.
 *
 * Usage:
 *
 *   node scripts/generate-components.mjs            # write both outputs
 *   node scripts/generate-components.mjs --check    # fail if they are stale
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const SOURCE = 'shared/components/recipes.json';
export const CSS_OUTPUT = 'app/components.css';
export const KOTLIN_OUTPUT = 'android/app/src/main/kotlin/com/royaraqamia/app/theme/Recipes.kt';

const REM = 16;

/** The radii the site's ladder names; `pill` is its `rounded-full`. */
const RADII = new Set(['sm', 'md', 'lg', 'xl', '2xl', 'pill']);

/** `2rem` -> `32`, in the unit each output reads (rem on the web, dp in the app). */
export function lengthToPx(value) {
  const match = /^(-?\d+(?:\.\d+)?)(rem|px)$/.exec(String(value).trim());
  if (!match) {
    throw new Error(`generate-components: "${value}" is not a rem or px length`);
  }
  return Math.round(Number(match[1]) * (match[2] === 'rem' ? REM : 1) * 100) / 100;
}

/** A Kotlin `Float` with the suffix the Compose API expects. */
export function float(value) {
  return `${Number(value)}f`;
}

/** `secondary-foreground` -> `secondaryForeground`, the name in the generated Kotlin. */
export function camelCase(value) {
  return value.replace(/[-_]([a-z0-9])/g, (_, letter) => letter.toUpperCase());
}

/** A radius step as the CSS custom property the site already draws from. */
export function radiusProperty(step) {
  if (!RADII.has(step)) {
    throw new Error(`generate-components: "${step}" is not a radius step`);
  }
  return step === 'pill' ? '9999px' : `var(--radius-${step})`;
}

/**
 * The same step in Compose. `RoyShape` names the two shapes a screen asks for by
 * what they are - a card's corner and a pill - and the recipe may only use those:
 * a Material step picked by number is what the card got wrong (ADR-0099).
 */
export function radiusShape(step) {
  if (step === '2xl') return 'RoyShape.card';
  if (step === 'pill') return 'RoyShape.pill';
  throw new Error(
    `generate-components: the app has no shape for radius "${step}"; add it to RoyShape`
  );
}

/** `card-padding` -> `var(--card-padding)`, the spacing custom property. */
export function spaceProperty(tokens, name) {
  if (!(name in tokens.space)) {
    throw new Error(`generate-components: "${name}" is not a spacing token`);
  }
  return `var(--${name})`;
}

/** A colour reference as `hsl(var(--token) / alpha)`; alpha 1 omits the slash. */
export function colorValue(tokens, ref) {
  if (!ref || typeof ref.color !== 'string') {
    throw new Error('generate-components: a colour is a token name plus an optional alpha');
  }
  if (!(ref.color in tokens.color)) {
    throw new Error(`generate-components: "${ref.color}" is not a colour token`);
  }
  const alpha = ref.alpha ?? 1;
  if (!(alpha > 0 && alpha <= 1)) {
    throw new Error(`generate-components: "${ref.color}" has an alpha outside 0-1`);
  }
  return alpha === 1 ? `hsl(var(--${ref.color}))` : `hsl(var(--${ref.color}) / ${alpha})`;
}

/** A type step, checked against the token source. */
function step(tokens, name) {
  if (!(name in tokens.type)) {
    throw new Error(`generate-components: "${name}" is not a type step`);
  }
  return name;
}

function borderDeclarations(tokens, border, fallback = 'solid') {
  if (!border) return ['border-width: 0'];
  if (!(border.width ?? '').toString().endsWith('px')) {
    throw new Error('generate-components: a border width is a px length');
  }
  const width = Number(String(border.width).replace('px', ''));
  return [`border: ${width}px ${fallback} ${colorValue(tokens, border)}`];
}

/**
 * The site's half: one class per primitive, with the primitive's own values
 * written against the token custom properties.
 */
export function renderCss(recipes, tokens) {
  const { card, skeleton, row } = recipes.primitives ?? {};
  const lines = [
    '/* Generated by `npm run components:generate` from `shared/components/recipes.json`.',
    '   Do not edit: change the recipe and regenerate.',
    '   `npm run check:components` fails a stale output or a name the token source',
    '   does not have (ADR-0099). */',
    '',
  ];

  if (card) {
    step(tokens, 'xs');
    lines.push(
      "/* A card: the site's `rounded-2xl card-padding border border-border/50 bg-card/60`. */",
      '.roy-card {',
      `  border-radius: ${radiusProperty(card.radius)};`,
      `  padding: ${spaceProperty(tokens, card.padding)};`,
      `  background-color: ${colorValue(tokens, card.surface)};`,
      ...borderDeclarations(tokens, card.border).map((line) => `  ${line};`),
      card.shadow === 'none' ? '  box-shadow: none;' : '',
      '  display: flex;',
      '  flex-direction: column;',
      `  gap: ${spaceProperty(tokens, card.gap)};`,
      '}',
      ''
    );
  }

  if (skeleton) {
    lines.push(
      `/* The loading state: ${skeleton.blocks.length} blocks that pulse while the read is out. */`,
      '.roy-skeleton {',
      `  border-radius: ${radiusProperty(skeleton.radius)};`,
      `  background-color: ${colorValue(tokens, skeleton.fill)};`,
      ...borderDeclarations(tokens, skeleton.border).map((line) => `  ${line};`),
      `  animation: roy-skeleton-pulse ${skeleton.pulse.durationMs}ms ease-in-out infinite alternate;`,
      '}',
      '',
      `@keyframes roy-skeleton-pulse {`,
      `  from { opacity: ${skeleton.pulse.from}; }`,
      `  to { opacity: ${skeleton.pulse.to}; }`,
      '}',
      ''
    );
    skeleton.blocks.forEach((height, index) => {
      lines.push(`.roy-skeleton--block-${index + 1} { height: ${lengthToPx(height)}px; }`, '');
    });
    lines.push(
      '.roy-skeletons {',
      '  display: flex;',
      '  flex-direction: column;',
      `  gap: ${lengthToPx(skeleton.gap)}px;`,
      '}',
      ''
    );
  }

  if (row) {
    step(tokens, row.label.step);
    step(tokens, row.value.step);
    lines.push(
      '/* One label and its numbers: muted at the start, bold and LTR at the end. */',
      '.roy-rows > * + * {',
      `  margin-top: ${lengthToPx(row.gap)}px;`,
      '}',
      '',
      '.roy-row {',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: space-between;',
      `  gap: ${spaceProperty(tokens, 'element-gap-sm')};`,
      '}',
      '',
      '.roy-row-label {',
      `  font-size: var(--type-${row.label.step}-size);`,
      `  line-height: var(--type-${row.label.step}-leading);`,
      `  color: ${colorValue(tokens, row.label)};`,
      '}',
      '',
      '.roy-row-value {',
      '  flex-shrink: 0;',
      `  font-size: var(--type-${row.value.step}-size);`,
      `  line-height: var(--type-${row.value.step}-leading);`,
      row.value.weight === undefined ? '' : `  font-weight: ${row.value.weight};`,
      `  color: ${colorValue(tokens, row.value)};`,
      row.value.digits ? '  font-family: var(--font-digits);' : '',
      row.value.direction ? `  direction: ${row.value.direction};` : '',
      '}',
      ''
    );
  }

  const glyph = recipes.primitives?.glyph;
  if (glyph) {
    lines.push(
      "/* An icon: drawn at the size the design gives it, from the site's own glyph. */",
      '.roy-glyph {',
      '  display: block;',
      '  flex-shrink: 0;',
      '}',
      ''
    );
    for (const [name, size] of Object.entries(glyph.sizes)) {
      lines.push(
        `.roy-glyph--${name} {`,
        `  width: ${lengthToPx(size)}px;`,
        `  height: ${lengthToPx(size)}px;`,
        '}',
        ''
      );
    }
  }

  return `${lines.filter((line) => line !== '').join('\n')}\n`;
}

/**
 * The app's half: the same primitives, in the types Compose draws with. Fluid
 * values stay functions of the resolved token scale, so the app asks the window
 * for its numbers exactly as the stylesheet's `clamp()` does.
 */
export function renderKotlin(recipes, tokens) {
  const { card, skeleton, row } = recipes.primitives ?? {};
  const lines = [
    '// Generated by `npm run components:generate` from',
    '// `shared/components/recipes.json`. Do not edit: change the recipe and',
    '// regenerate. `npm run check:components` fails when this file is stale.',
    'package com.royaraqamia.app.theme',
    '',
    'import androidx.compose.foundation.BorderStroke',
    'import androidx.compose.ui.graphics.Color',
    'import androidx.compose.ui.graphics.Shape',
    'import androidx.compose.ui.text.TextStyle',
    'import androidx.compose.ui.text.font.FontWeight',
    'import androidx.compose.ui.unit.Dp',
    'import androidx.compose.ui.unit.dp',
    '',
    '/**',
    ' * The components the app and the site share (#647, ADR-0099), from one recipe.',
    ' *',
    ' * A screen reads the primitive it draws - [Card], [Skeleton], [Row] - instead',
    ' * of typing a radius, a padding or a gap, so the two clients cannot pick',
    ' * different numbers for the same component. The site reads the same file as',
    ' * `app/components.css`.',
    ' */',
    'object Recipes {',
  ];

  if (card) {
    lines.push(
      "    /** A card: the site's `rounded-2xl card-padding border border-border/50 bg-card/60`. */",
      '    object Card {',
      `        val radius: Shape get() = ${radiusShape(card.radius)}`,
      `        fun padding(spacing: RoySpacing): Dp = spacing.${camelCase(card.padding)}`,
      `        fun gap(spacing: RoySpacing): Dp = spacing.${camelCase(card.gap)}`,
      `        val container: Color get() = RoyColors.${camelCase(card.surface.color)}.copy(alpha = ${float(card.surface.alpha)})`,
      `        val border: BorderStroke get() = BorderStroke(${float(lengthToPx(card.border.width))}.dp, RoyColors.${camelCase(card.border.color)}.copy(alpha = ${float(card.border.alpha)}))`,
      '    }',
      ''
    );
  }

  if (skeleton) {
    lines.push(
      '    /** The loading state: blocks that pulse while the read is out. */',
      '    object Skeleton {',
      `        val radius: Shape get() = ${radiusShape(skeleton.radius)}`,
      `        val blocks: List<Dp> = listOf(${skeleton.blocks.map((height) => `${float(lengthToPx(height))}.dp`).join(', ')})`,
      `        val gap: Dp = ${float(lengthToPx(skeleton.gap))}.dp`,
      `        val fill: Color get() = RoyColors.${camelCase(skeleton.fill.color)}.copy(alpha = ${float(skeleton.fill.alpha)})`,
      `        val border: BorderStroke get() = BorderStroke(${float(lengthToPx(skeleton.border.width))}.dp, RoyColors.${camelCase(skeleton.border.color)}.copy(alpha = ${float(skeleton.border.alpha)}))`,
      `        const val pulseFrom: Float = ${float(skeleton.pulse.from)}`,
      `        const val pulseTo: Float = ${float(skeleton.pulse.to)}`,
      `        const val pulseMs: Int = ${skeleton.pulse.durationMs}`,
      '    }',
      ''
    );
  }

  if (row) {
    lines.push(
      '    /** One label and its numbers: muted at the start, bold and LTR at the end. */',
      '    object Row {',
      `        val gap: Dp = ${float(lengthToPx(row.gap))}.dp`,
      `        fun label(scale: RoyTypeScale): TextStyle = scale.${row.label.step}`,
      `        val labelColor: Color get() = RoyColors.${camelCase(row.label.color)}`,
      `        fun value(scale: RoyTypeScale): TextStyle =`,
      `            scale.${row.value.step}.copy(fontWeight = FontWeight(${row.value.weight ?? 400}))` +
        (row.value.digits ? '.let { scale.digits(it) }' : ''),
      `        val valueColor: Color get() = RoyColors.${camelCase(row.value.color)}`,
      '    }',
      ''
    );
  }

  const glyph = recipes.primitives?.glyph;
  if (glyph) {
    lines.push(
      '    /** The size an icon is drawn at; the drawing is [com.royaraqamia.app.ui.vectors.LucideVectors]. */',
      '    object Glyph {'
    );
    for (const [name, size] of Object.entries(glyph.sizes)) {
      lines.push(`        val ${name}: Dp = ${float(lengthToPx(size))}.dp`);
    }
    lines.push('    }', '');
  }

  lines.push('}', '');
  return lines.join('\n');
}

/** Both outputs, keyed by repo-relative path, without touching the disk. */
export async function generate() {
  const tokens = JSON.parse(await readFile(path.join(ROOT, 'shared/tokens/tokens.json'), 'utf8'));
  const recipes = JSON.parse(await readFile(path.join(ROOT, SOURCE), 'utf8'));
  return new Map([
    [CSS_OUTPUT, renderCss(recipes, tokens)],
    [KOTLIN_OUTPUT, renderKotlin(recipes, tokens)],
  ]);
}

async function main(argv) {
  const check = argv.includes('--check');
  const files = await generate();

  if (!check) {
    for (const [file, contents] of files) {
      const target = path.join(ROOT, file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, contents, 'utf8');
    }
    return 0;
  }

  const stale = [];
  for (const [file, contents] of files) {
    let onDisk = null;
    try {
      onDisk = await readFile(path.join(ROOT, file), 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (onDisk !== contents) stale.push(file);
  }
  if (stale.length > 0) {
    process.stderr.write(
      `Generated components are stale: ${stale.join(', ')}\n` +
        'Run `npm run components:generate` and commit the result.\n'
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
