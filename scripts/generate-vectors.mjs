/**
 * The site's glyphs, as the app draws them (#647, ADR-0100).
 *
 * The plan card's padlock was drawn by hand and its retry had no icon at all: the
 * app carries no icon library, and the nearest Material glyph is a different
 * drawing. An icon is design, so it comes from the same source the site imports -
 * `lucide-react` - and is converted here rather than copied by eye.
 *
 * `shared/icons/icons.json` lists the glyphs a ported component draws. This script
 * reads each one's own module (they export `__iconData`: the SVG primitives lucide
 * renders), turns every primitive into path data, and emits one Compose
 * `ImageVector` per glyph with the site's stroke settings.
 *
 * Usage:
 *
 *   node scripts/generate-vectors.mjs            # write the Kotlin file
 *   node scripts/generate-vectors.mjs --check    # fail if it is stale
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const SOURCE = 'shared/icons/icons.json';
export const OUTPUT = 'android/app/src/main/kotlin/com/royaraqamia/app/ui/vectors/LucideVectors.kt';

/** `RotateCw` -> `rotate-cw`, the lucide module's own file name. */
export function slug(name) {
  return (
    name
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
      // A trailing digit is its own word in lucide's file names: `Link2` is
      // `link-2.mjs`, not `link2.mjs` (#647).
      .replace(/([a-z])(\d)/g, '$1-$2')
      .toLowerCase()
  );
}

/** One number, without a pointless `.0`. */
function n(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`generate-vectors: "${value}" is not a number`);
  }
  return Number.isInteger(number) ? String(number) : String(Math.round(number * 1000) / 1000);
}

/** `<circle cx cy r>` as two half arcs, which is how SVG's own circle is drawn. */
export function circleToPath({ cx, cy, r }) {
  const [x, y, radius] = [Number(cx), Number(cy), Number(r)];
  return `M${n(x - radius)} ${n(y)}a${n(radius)} ${n(radius)} 0 1 0 ${n(2 * radius)} 0a${n(radius)} ${n(radius)} 0 1 0 ${n(-2 * radius)} 0`;
}

/** `<ellipse cx cy rx ry>`, the stretched circle. */
export function ellipseToPath({ cx, cy, rx, ry }) {
  const [x, y, rx1, ry1] = [Number(cx), Number(cy), Number(rx), Number(ry)];
  return `M${n(x - rx1)} ${n(y)}a${n(rx1)} ${n(ry1)} 0 1 0 ${n(2 * rx1)} 0a${n(rx1)} ${n(ry1)} 0 1 0 ${n(-2 * rx1)} 0`;
}

/** `<rect x y width height rx ry>`, with lucide's rounded corners. */
export function rectToPath({ x, y, width, height, rx = 0, ry = 0 }) {
  const [left, top, w, h] = [Number(x), Number(y), Number(width), Number(height)];
  const radiusX = Number(rx) || 0;
  const radiusY = Number(ry) || 0;
  if (radiusX === 0 && radiusY === 0) {
    return `M${n(left)} ${n(top)}h${n(w)}v${n(h)}h${n(-w)}z`;
  }
  return [
    `M${n(left + radiusX)} ${n(top)}`,
    `h${n(w - 2 * radiusX)}`,
    `a${n(radiusX)} ${n(radiusY)} 0 0 1 ${n(radiusX)} ${n(radiusY)}`,
    `v${n(h - 2 * radiusY)}`,
    `a${n(radiusX)} ${n(radiusY)} 0 0 1 ${n(-radiusX)} ${n(radiusY)}`,
    `h${n(-(w - 2 * radiusX))}`,
    `a${n(radiusX)} ${n(radiusY)} 0 0 1 ${n(-radiusX)} ${n(-radiusY)}`,
    `v${n(-(h - 2 * radiusY))}`,
    `a${n(radiusX)} ${n(radiusY)} 0 0 1 ${n(radiusX)} ${n(-radiusY)}`,
    'z',
  ].join('');
}

/** `<line x1 y1 x2 y2>`. */
export function lineToPath({ x1, y1, x2, y2 }) {
  return `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`;
}

/**
 * `<polyline points>` and `<polygon points>` — the same, closed for a polygon.
 *
 * A `points` attribute is a flat list of numbers separated by spaces or commas
 * (`"3.29 7 12 12 20.71 7"`, `"1,2 3,4"`), not a list of pairs. Reading it as
 * pairs made every coordinate after the first `undefined`, which is how the
 * `Package` glyph failed to generate (#647).
 */
export function pointsToPath(points, closed = false) {
  const numbers = String(points)
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    numbers.length < 4 ||
    numbers.length % 2 !== 0 ||
    numbers.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(`generate-vectors: "<polyline points="${points}">" is not a list of pairs`);
  }
  const path = [`M${n(numbers[0])} ${n(numbers[1])}`];
  for (let index = 2; index < numbers.length; index += 2) {
    path.push(`L${n(numbers[index])} ${n(numbers[index + 1])}`);
  }
  return `${path.join('')}${closed ? 'z' : ''}`;
}

/** Every lucide primitive as path data, or a refusal the generator owns. */
export function primitiveToPath([tag, attrs]) {
  switch (tag) {
    case 'path':
      return attrs.d;
    case 'circle':
      return circleToPath(attrs);
    case 'ellipse':
      return ellipseToPath(attrs);
    case 'rect':
      return rectToPath(attrs);
    case 'line':
      return lineToPath(attrs);
    case 'polyline':
      return pointsToPath(attrs.points);
    case 'polygon':
      return pointsToPath(attrs.points, true);
    default:
      throw new Error(`generate-vectors: "<${tag}>" is a primitive this generator cannot place`);
  }
}

/** Load one lucide icon's own data: the same module the site imports. */
async function iconData(name) {
  const file = path.join(
    ROOT,
    'node_modules',
    'lucide-react',
    'dist',
    'esm',
    'icons',
    `${slug(name)}.mjs`
  );
  let module;
  try {
    module = await import(pathToFileURL(file).href);
  } catch (error) {
    throw new Error(
      `generate-vectors: "${name}" is not in lucide-react (expected ${path.relative(ROOT, file)}): ${error.message}`
    );
  }
  if (!module.__iconData) {
    throw new Error(`generate-vectors: "${name}" carries no __iconData`);
  }
  return module.__iconData;
}

/** The Kotlin file: one `ImageVector` per glyph, built from path data. */
export async function renderKotlin(manifest) {
  const strokeWidth = manifest.strokeWidth ?? 2;
  const icons = manifest.icons ?? [];
  if (icons.length === 0) {
    throw new Error('generate-vectors: the manifest lists no icons');
  }

  const lines = [
    '// Generated by `npm run vectors:generate` from `shared/icons/icons.json` and',
    '// the lucide modules the site imports. Do not edit: add the icon to the',
    '// manifest and regenerate. `npm run check:vectors` fails when this file is',
    '// stale.',
    'package com.royaraqamia.app.ui.vectors',
    '',
    'import androidx.compose.ui.graphics.Color',
    'import androidx.compose.ui.graphics.SolidColor',
    'import androidx.compose.ui.graphics.StrokeCap',
    'import androidx.compose.ui.graphics.StrokeJoin',
    'import androidx.compose.ui.graphics.vector.ImageVector',
    'import androidx.compose.ui.graphics.vector.addPathNodes',
    'import androidx.compose.ui.unit.dp',
    '',
    '/**',
    ' * The glyphs the site draws, converted from its own icon source (#647, ADR-0100).',
    ' *',
    ' * The site imports them from `lucide-react`; this file is that source, not a',
    ' * redrawing. A stroke in [Color.Black] is what `Icon` tints, so a glyph takes the',
    " * content colour of wherever it is placed, exactly as the site's `currentColor`",
    ' * does.',
    ' */',
    'object LucideVectors {',
    '    private val stroke = SolidColor(Color.Black)',
    '',
  ];

  for (const name of icons) {
    const data = await iconData(name);
    const paths = data.node.map(primitiveToPath).filter(Boolean);
    if (paths.length === 0) {
      throw new Error(`generate-vectors: "${name}" has no drawable primitives`);
    }
    lines.push(
      `    /** \`${data.name}\`, the site's own drawing. */`,
      `    val ${name}: ImageVector by lazy {`,
      '        ImageVector.Builder(',
      `            name = "${data.name}",`,
      `            defaultWidth = ${data.size}.dp,`,
      `            defaultHeight = ${data.size}.dp,`,
      `            viewportWidth = ${data.size}f,`,
      `            viewportHeight = ${data.size}f,`,
      '        ).apply {'
    );
    for (const pathData of paths) {
      lines.push(
        '            addPath(',
        `                addPathNodes("${pathData}"),`,
        '                stroke = stroke,',
        `                strokeLineWidth = ${n(strokeWidth)}f,`,
        '                strokeLineCap = StrokeCap.Round,',
        '                strokeLineJoin = StrokeJoin.Round,',
        '            )'
      );
    }
    lines.push('        }.build()', '    }', '');
  }

  lines.push('}', '');
  return lines.join('\n');
}

/** The generated file, without touching the disk. */
export async function generate() {
  const manifest = JSON.parse(await readFile(path.join(ROOT, SOURCE), 'utf8'));
  return new Map([[OUTPUT, await renderKotlin(manifest)]]);
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
      `Generated vectors are stale: ${stale.join(', ')}\n` +
        'Run `npm run vectors:generate` and commit the result.\n'
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
