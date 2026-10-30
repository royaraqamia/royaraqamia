import { describe, expect, it } from 'vitest';

import {
  circleToPath,
  generate,
  lineToPath,
  pointsToPath,
  primitiveToPath,
  rectToPath,
  renderKotlin,
  slug,
} from '../generate-vectors.mjs';

/**
 * The site's glyphs, converted rather than redrawn (#647, ADR-0100).
 *
 * The card's padlock was hand-drawn and its retry had no icon; the fix is not a
 * better drawing but the same drawing. These cases hold the converter: every
 * primitive lucide uses becomes path data, and a primitive it does not use fails
 * loudly instead of rendering as nothing.
 */
describe('lucide file names', () => {
  it('are the kebab-case the module uses', () => {
    expect(slug('Lock')).toBe('lock');
    expect(slug('RotateCw')).toBe('rotate-cw');
    expect(slug('ArrowLeft')).toBe('arrow-left');
    expect(slug('CircleDashed')).toBe('circle-dashed');
  });
});

describe('SVG primitives as path data', () => {
  it('draws a circle as two half arcs', () => {
    expect(circleToPath({ cx: 12, cy: 12, r: 10 })).toBe(
      'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0'
    );
  });

  it('draws a square rect without corners', () => {
    expect(rectToPath({ x: 3, y: 11, width: 18, height: 11 })).toBe('M3 11h18v11h-18z');
  });

  it('draws a rounded rect with arcs', () => {
    expect(rectToPath({ x: 3, y: 11, width: 18, height: 11, rx: 2, ry: 2 })).toBe(
      'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-7a2 2 0 0 1 2 -2z'
    );
  });

  it('draws a line, a polyline and a closed polygon', () => {
    expect(lineToPath({ x1: 1, y1: 2, x2: 3, y2: 4 })).toBe('M1 2L3 4');
    expect(pointsToPath('1,2 3,4')).toBe('M1 2L3 4');
    expect(pointsToPath('1,2 3,4', true)).toBe('M1 2L3 4z');
  });

  it('passes a path through unchanged', () => {
    expect(primitiveToPath(['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }])).toBe(
      'M7 11V7a5 5 0 0 1 10 0v4'
    );
  });

  it('refuses a primitive it cannot place', () => {
    expect(() => primitiveToPath(['text', { x: 1 }])).toThrow(/cannot place/);
  });
});

describe('the generated vectors', () => {
  it('carry every glyph in the manifest, with the site stroke settings', async () => {
    const manifest = JSON.parse(
      // The manifest is the source; reading it here keeps the expectation honest.
      (await import('node:fs')).readFileSync('shared/icons/icons.json', 'utf8')
    );
    const kotlin = await renderKotlin(manifest);

    for (const icon of manifest.icons) {
      expect(kotlin).toContain(`val ${icon}: ImageVector by lazy {`);
    }
    expect(kotlin).toContain('strokeLineWidth = 2f');
    expect(kotlin).toContain('strokeLineCap = StrokeCap.Round');
    expect(kotlin).toContain('stroke = stroke');
  });

  it('refuse an icon the site does not import', async () => {
    await expect(renderKotlin({ icons: ['NotAnIcon'], strokeWidth: 2 })).rejects.toThrow(
      /not in lucide-react/
    );
  });

  it('are deterministic and committed', async () => {
    const files = await generate();
    expect(files.size).toBe(1);
    expect([...(await generate()).entries()]).toEqual([...files.entries()]);
  });
});
