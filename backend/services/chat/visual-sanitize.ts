import { SaxesParser, type SaxesTagPlain } from 'saxes';

/**
 * The one gate every model-written SVG passes through (ADR-0215).
 *
 * A visual is data the member asked to see, not code this deployment runs. It
 * is parsed as XML through a whitelist of static drawing elements and
 * attributes, and rebuilt from that whitelist — not patched with regular
 * expressions, which leave injection paths open. Anything else refuses the
 * drawing and the turn answers with one sentence.
 */
const ALLOWED_TAGS = new Set([
  'svg',
  'g',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polygon',
  'polyline',
  'path',
  'text',
  'tspan',
  'defs',
  'linearGradient',
  'radialGradient',
  'stop',
  'title',
]);

const ALLOWED_ATTRS = new Set([
  'xmlns',
  'id',
  'viewBox',
  'width',
  'height',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'd',
  'points',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'transform',
  'font-family',
  'font-size',
  'font-weight',
  'text-anchor',
  'dominant-baseline',
  'dx',
  'dy',
  'offset',
  'stop-color',
  'stop-opacity',
]);

const MAX_DEPTH = 24;
const INTERNAL_REF = /url\(\s*#[\w-]+\s*\)/gi;

function unsafeValue(value: string): boolean {
  if (/javascript:|<\?|&#|<|>/i.test(value)) return true;
  const refs = value.match(/url\s*\([^)]*\)/gi) ?? [];
  return refs.some((ref) => !INTERNAL_REF.test(ref));
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Returns null for anything that is not a static SVG drawing. */
export function sanitizeVisualSvg(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('<svg') || !trimmed.endsWith('</svg>')) return null;

  const out: string[] = [];
  let depth = 0;
  let broken = false;

  const parser = new SaxesParser();
  parser.on('error', () => {
    broken = true;
  });
  parser.on('opentag', (tag: SaxesTagPlain) => {
    if (broken || depth >= MAX_DEPTH) {
      broken = true;
      return;
    }
    const name = tag.name;
    if (!ALLOWED_TAGS.has(name) || (depth === 0 && name !== 'svg')) {
      broken = true;
      return;
    }
    const attrs: string[] = [];
    for (const [key, value] of Object.entries(tag.attributes)) {
      if (!ALLOWED_ATTRS.has(key)) {
        broken = true;
        return;
      }
      const text = String(value);
      if (unsafeValue(text)) {
        broken = true;
        return;
      }
      attrs.push(`${key}="${escapeAttr(text)}"`);
    }
    out.push(`<${name}${attrs.length > 0 ? ` ${attrs.join(' ')}` : ''}>`);
    depth += 1;
  });
  parser.on('text', (text: string) => {
    if (!broken) out.push(escapeText(text));
  });
  parser.on('closetag', (tag: SaxesTagPlain) => {
    if (broken) return;
    depth -= 1;
    out.push(`</${tag.name}>`);
  });

  try {
    parser.write(trimmed).close();
  } catch {
    broken = true;
  }
  if (broken || depth !== 0 || out.length === 0 || !out[0]?.startsWith('<svg')) return null;
  return out.join('');
}

/**
 * The `id`s the sanitized drawing actually kept, so a motion track can only
 * target an element that exists. The animation never adds markup of its own.
 */
export function svgElementIds(svg: string): Set<string> {
  const ids = new Set<string>();
  const parser = new SaxesParser();
  parser.on('opentag', (tag: SaxesTagPlain) => {
    const id = tag.attributes.id;
    if (typeof id === 'string' && id.length > 0) ids.add(id);
  });
  try {
    parser.write(svg).close();
  } catch {
    return new Set();
  }
  return ids;
}
