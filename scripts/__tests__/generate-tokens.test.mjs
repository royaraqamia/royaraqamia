import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  commentFor,
  fluid,
  generate,
  hslToArgb,
  ownedProperties,
  remToDp,
  renderAndroidColors,
  renderCss,
  renderKotlin,
  shellColors,
  weightRange,
} from '../generate-tokens.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const tokens = JSON.parse(await readFile(path.join(ROOT, 'shared/tokens/tokens.json'), 'utf8'));

/**
 * The token block exactly as `app/global.css` carried it before the migration
 * (#647). The generator's first job is to reproduce it value for value — a
 * stylesheet that renders differently after a refactor is the failure this
 * ticket exists to prevent, and a test that only reads the new file could not
 * see it.
 */
const BEFORE = `
    --background: 240 10% 8%;
    --foreground: 0 0% 96%;
    --card: 240 8% 11%;
    --card-foreground: 0 0% 96%;
    --popover: 240 8% 11%;
    --popover-foreground: 0 0% 96%;
    --primary: 256 70% 67%;
    --primary-foreground: 0 0% 100%;
    --secondary: 240 6% 16%;
    --secondary-foreground: 0 0% 96%;
    --muted: 240 5% 18%;
    --muted-foreground: 0 0% 68%;
    --accent: 240 6% 16%;
    --accent-foreground: 0 0% 96%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5% 22%;
    --input: 240 5% 22%;
    --ring: 256 70% 67%;
    --radius: 0.5rem;
    --section-spacing: clamp(3.75rem, 8vw, 6rem);
    --section-spacing-sm: clamp(2.5rem, 6vw, 4rem);
    --container-padding: clamp(1rem, 4vw, 2rem);
    --card-padding: clamp(1.5rem, 3vw, 2rem);
    --element-gap: clamp(1rem, 2vw, 1.5rem);
    --element-gap-sm: clamp(0.75rem, 1.5vw, 1rem);
    --success: 142 76% 36%;
    --success-foreground: 0 0% 100%;
    --warning: 45 100% 51%;
    --warning-foreground: 0 0% 10%;
    --accent-indigo: 239 84% 67%;
    --accent-indigo-foreground: 0 0% 100%;
    --accent-purple: 256 80% 55%;
    --accent-purple-foreground: 0 0% 100%;
    --selected: 256 70% 61%;
    --selected-foreground: 0 0% 100%;
    --info: 199 89% 48%;
    --info-foreground: 0 0% 100%;
    --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.05);
    --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06);
    --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.06);
    --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05);
    --shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.1), 0 10px 10px rgba(0, 0, 0, 0.04);
    --shadow-elevated: 0 20px 40px rgba(99, 102, 241, 0.12);
    --shadow-hover: 0 8px 25px rgba(99, 102, 241, 0.15);
    --shadow-focus: 0 0 0 3px rgba(99, 102, 241, 0.1);
    --shadow-primary: 0 4px 14px rgba(99, 102, 241, 0.25);
    --shadow-success: 0 4px 14px rgba(16, 185, 129, 0.2);
    --shadow-warning: 0 4px 14px rgba(245, 158, 11, 0.2);
    --shadow-error: 0 4px 14px rgba(239, 68, 68, 0.2);
    --duration-fast: 0.15s;
    --duration-normal: 0.3s;
    --duration-slow: 0.6s;
    --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
    --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
    --ease-smooth: cubic-bezier(0.25, 0.46, 0.45, 0.94);
    --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
`;

/** `--name: value;` pairs from a stylesheet fragment. */
function declarations(block) {
  return new Map(
    [...block.matchAll(/^\s*(--[a-z0-9-]+):\s*(.+);$/gm)].map((match) => [match[1], match[2]])
  );
}

describe('the source', () => {
  it('is what the committed outputs were generated from', async () => {
    const files = await generate();
    for (const [file, expected] of files) {
      expect(await readFile(path.join(ROOT, file), 'utf8'), file).toBe(expected);
    }
  });
});

describe('renderCss', () => {
  const css = renderCss(tokens);

  it('reproduces every custom property the stylesheet used to declare', () => {
    const before = declarations(BEFORE);
    const emitted = declarations(css);
    expect(before.size).toBeGreaterThan(50);
    for (const [name, value] of before) {
      expect(emitted.get(name), name).toBe(value);
    }
  });

  it('declares the two faces, with the digit range only on the digit face', () => {
    const faces = [...css.matchAll(/@font-face \{([\s\S]*?)\}/g)].map((match) => match[1]);
    expect(faces).toHaveLength(2);
    expect(faces[0]).toContain("font-family: 'Aref Ruqaa'");
    expect(faces[0]).not.toContain('unicode-range');
    expect(faces[1]).toContain("font-family: 'Aref Ruqaa Digits'");
    expect(faces[1]).toContain('unicode-range: U+0030-0039');
    expect(faces[0]).toContain('ArefRuqaa-Bold.woff2');
    expect(faces[1]).toContain('ArefRuqaa-Bold.woff2');
  });

  it('carries the type scale the utilities and the elements both read', () => {
    expect(css).toContain('--type-h1-size: clamp(2rem, 5vw, 4rem);');
    expect(css).toContain('--type-h1-tracking: -0.02em;');
    expect(css).toContain('--type-body-leading: 1.6;');
    // `small` and `xs` carry no weight of their own, so no property is invented.
    expect(css).not.toContain('--type-small-weight');
  });

  it('keeps a token note beside the token it explains', () => {
    expect(commentFor(tokens, 'color', 'selected').join('\n')).toContain('issue #148');
    expect(css.indexOf('--selected:')).toBeGreaterThan(css.indexOf('issue #148'));
  });

  it('owns every property it emits, so a hand edit can be found', () => {
    const emitted = declarations(css);
    for (const name of emitted.keys()) {
      expect(ownedProperties(tokens), name).toContain(name);
    }
  });
});

describe('renderKotlin', () => {
  const kotlin = renderKotlin(tokens);

  it('is a file the app module compiles', () => {
    expect(kotlin.startsWith('// Generated by')).toBe(true);
    expect(kotlin).toContain('package com.royaraqamia.app.theme');
    expect(kotlin).toContain('object DesignTokens {');
    // A `Long` literal: Compose's `Color` takes the same bits as an `Int`.
    expect(kotlin).toContain('const val primary: Long = 0xFF8F70E6');
  });

  it('reads radii and spacing in dp, and the type scale in sp', () => {
    expect(kotlin).toContain('const val base: Float = 8f');
    expect(kotlin).toContain('const val sectionMin: Float = 60f');
    expect(kotlin).toContain('const val sectionMax: Float = 96f');
    expect(kotlin).toContain('const val sizeMin: Float = 32f');
    expect(kotlin).toContain('const val sizeMax: Float = 64f');
    expect(kotlin).toContain('const val weight: Int = 700');
    // Nothing in the app's copy may carry a unit only a browser understands.
    expect(kotlin).not.toMatch(/\d(rem|vw|em)[^a-zA-Z]/);
  });

  it('names the digits face and the range it supplies', () => {
    expect(kotlin).toContain('const val digitsFamily = "Aref Ruqaa Digits"');
    expect(kotlin).toContain('const val digitsWeightMin = 100');
    expect(kotlin).toContain('const val digitsWeightMax = 900');
    expect(kotlin).toContain('const val digitsRangeStart = 48');
    expect(kotlin).toContain('const val digitsRangeEnd = 57');
  });
});

/**
 * The shell's palette exactly as `res/values/colors.xml` carried it before the
 * migration (#647). Every name is an `@color/roy_*` reference a layout, a
 * drawable, a style or `ShellBatteryPrompt` resolves against, so a dropped or
 * renamed entry would be a build failure or a wrong colour rather than a diff.
 */
const SHELL_COLORS = new Map([
  ['roy_background', '#FF121216'],
  ['roy_border_hairline', '#9935353B'],
  ['roy_border', '#FF35353B'],
  ['roy_track', '#FF26262B'],
  ['roy_foreground', '#FFF5F5F5'],
  ['roy_muted_foreground', '#FFADADAD'],
  ['roy_subtle', '#FF8A8A8A'],
  ['roy_primary', '#FF8F70E6'],
  ['roy_primary_foreground', '#FFFFFFFF'],
  ['roy_gradient_start', '#FF8B5CF6'],
  ['roy_gradient_mid', '#FF7C3AED'],
  ['roy_gradient_end', '#FF6366F1'],
  ['roy_primary_glow', '#809333EA'],
  ['roy_ripple_on_primary', '#33FFFFFF'],
  ['roy_ripple_on_surface', '#1FFFFFFF'],
  ['roy_scrim', '#B3000000'],
  ['roy_launch_background', '#FF0F172A'],
  ['roy_skeleton_card', '#FF1B2334'],
  ['roy_skeleton_shape', '#FF2C3A55'],
  ['roy_skeleton_hairline', '#FF22304A'],
]);

describe('renderAndroidColors', () => {
  const xml = renderAndroidColors(tokens);
  const emitted = new Map(
    [...xml.matchAll(/<color name="([a-z0-9_]+)">(#[0-9A-F]{8})<\/color>/g)].map((match) => [
      match[1],
      match[2],
    ])
  );

  it('reproduces the palette the resources used to declare by hand', () => {
    expect([...emitted.entries()]).toEqual([...SHELL_COLORS.entries()]);
  });

  it('is a resource file, not a description of one', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
    expect(xml).toContain('<resources>');
    expect(xml.trimEnd().endsWith('</resources>')).toBe(true);
    // `launch-skeleton.test.mjs` reads this entry with a single-line pattern.
    expect(xml).toMatch(/<color name="roy_launch_background">#[0-9A-F]{8}<\/color>/);
  });

  it('follows the token a colour is named after', () => {
    const edited = structuredClone(tokens);
    edited.color.primary = '0 0% 50%';
    edited.color.secondary = '0 0% 40%';
    const colors = shellColors(edited);
    expect(colors.get('roy_primary')).toBe('#FF808080');
    // `track` is the site's `secondary`, not a second copy of it.
    expect(colors.get('roy_track')).toBe('#FF666666');
    // A change to one token leaves the rest alone.
    expect(colors.get('roy_background')).toBe('#FF121216');
  });

  it('flattens the alpha the site writes as a slash', () => {
    const colors = shellColors(tokens);
    expect(colors.get('roy_border_hairline')).toBe('#9935353B'); // border at 60%
    expect(colors.get('roy_primary_glow')).toBe('#809333EA'); // 50%
    expect(colors.get('roy_ripple_on_surface')).toBe('#1FFFFFFF'); // 12%
    expect(colors.get('roy_scrim')).toBe('#B3000000'); // black at 70%
  });

  it('refuses a shell colour it cannot resolve', () => {
    const unknownToken = structuredClone(tokens);
    unknownToken.shell.color.scrim = { token: 'scrim' };
    expect(() => shellColors(unknownToken)).toThrow(/unknown token/);

    const badHex = structuredClone(tokens);
    badHex.shell.color.scrim = { hex: 'black' };
    expect(() => shellColors(badHex)).toThrow(/#RRGGBB/);

    const noSource = structuredClone(tokens);
    noSource.shell.color.scrim = { alpha: 0.5 };
    expect(() => shellColors(noSource)).toThrow(/neither a "token" nor a "hex"/);
  });
});

describe('units', () => {
  it('converts an HSL triplet to opaque ARGB', () => {
    expect(hslToArgb('0 0% 100%')).toBe('0xFFFFFFFF');
    expect(hslToArgb('0 0% 0%')).toBe('0xFF000000');
    // The token the destructive foreground sits on: hsl(0 84.2% 60.2%) is #EF4444.
    expect(hslToArgb('0 84.2% 60.2%')).toBe('0xFFEF4444');
  });

  it('refuses a colour it cannot read', () => {
    expect(() => hslToArgb('#ffffff')).toThrow(/H S% L%/);
  });

  it('converts a rem length to dp and refuses any other unit', () => {
    expect(remToDp('0.5rem')).toBe(8);
    expect(remToDp('1.125rem')).toBe(18);
    expect(() => remToDp('16px')).toThrow(/rem length/);
  });

  it('renders a fluid token as a clamp between its floor and its ceiling', () => {
    expect(fluid({ min: '1rem', preferred: '2vw', max: '1.5rem' })).toBe(
      'clamp(1rem, 2vw, 1.5rem)'
    );
  });

  it('reads a weight and a weight range the same way', () => {
    expect(weightRange('700')).toEqual([700, 700]);
    expect(weightRange('100 900')).toEqual([100, 900]);
  });
});
