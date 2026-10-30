import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  camelCase,
  colorValue,
  generate,
  lengthToPx,
  radiusProperty,
  renderCss,
  renderKotlin,
} from '../generate-components.mjs';

/**
 * One description, two clients (#647, ADR-0099).
 *
 * The plan card's corners, padding, skeleton and row rhythm were typed once in
 * Tailwind and once in Compose; the two disagreed. These cases hold the seam: a
 * name the token source does not have is refused rather than rendered as nothing,
 * and both outputs carry the same value for the same field.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tokens = JSON.parse(readFileSync(join(ROOT, 'shared/tokens/tokens.json'), 'utf8'));

const recipes = {
  primitives: {
    card: {
      radius: '2xl',
      padding: 'card-padding',
      gap: 'element-gap-sm',
      surface: { color: 'card', alpha: 0.6 },
      border: { color: 'border', alpha: 0.5, width: '1px' },
      shadow: 'none',
    },
    skeleton: {
      radius: '2xl',
      gap: '0.75rem',
      blocks: ['8rem', '5rem'],
      fill: { color: 'muted', alpha: 0.4 },
      border: { color: 'border', alpha: 0.4, width: '1px' },
      pulse: { from: 1, to: 0.5, durationMs: 2000 },
    },
    badge: {
      radius: 'pill',
      border: { width: '1px' },
      type: { step: 'xs', weight: 700, tracking: '-0.025em' },
      sizes: {
        default: {
          height: '1.5rem',
          paddingX: '0.625rem',
          paddingY: '0.125rem',
          step: 'xs',
          gap: '0.375rem',
        },
        sm: {
          height: '1.25rem',
          paddingX: '0.5rem',
          paddingY: '0rem',
          step: 'xs',
          fontSize: '0.625rem',
          gap: '0.25rem',
        },
      },
      tones: {
        success: {
          surface: { color: 'success', alpha: 0.1 },
          border: { color: 'success', alpha: 0.3 },
          content: { color: 'success' },
        },
      },
    },
    row: {
      gap: '0.375rem',
      label: { step: 'xs', color: 'muted-foreground' },
      value: { step: 'xs', color: 'foreground', weight: 700, digits: true, direction: 'ltr' },
    },
  },
};

describe('resolving a recipe against the token source', () => {
  it('turns a radius step into the site property and the app shape', () => {
    expect(radiusProperty('2xl')).toBe('var(--radius-2xl)');
    expect(radiusProperty('pill')).toBe('9999px');
    expect(() => radiusProperty('fancy')).toThrow(/not a radius step/);
  });

  it('turns rem into the pixels each output reads', () => {
    expect(lengthToPx('8rem')).toBe(128);
    expect(lengthToPx('0.375rem')).toBe(6);
    expect(lengthToPx('1px')).toBe(1);
    expect(() => lengthToPx('3em')).toThrow(/not a rem or px length/);
  });

  it('refuses a colour the palette does not have', () => {
    expect(colorValue(tokens, { color: 'card' })).toBe('hsl(var(--card))');
    expect(colorValue(tokens, { color: 'card', alpha: 0.6 })).toBe('hsl(var(--card) / 0.6)');
    expect(() => colorValue(tokens, { color: 'chartreuse' })).toThrow(/not a colour token/);
    expect(() => colorValue(tokens, { color: 'card', alpha: 2 })).toThrow(/alpha outside 0-1/);
  });

  it('names a Kotlin field the way the token does', () => {
    expect(camelCase('card-padding')).toBe('cardPadding');
    expect(camelCase('secondary-foreground')).toBe('secondaryForeground');
  });
});

describe('the two outputs', () => {
  it('carry the same values for the same recipe', () => {
    const css = renderCss(recipes, tokens);
    const kotlin = renderKotlin(recipes, tokens);

    // The card's alpha is one number in the recipe and one in each client.
    expect(css).toContain('hsl(var(--card) / 0.6)');
    expect(kotlin).toContain('RoyColors.card.copy(alpha = 0.6f)');
    // The skeleton blocks are the same two heights.
    expect(css).toContain('height: 128px');
    expect(css).toContain('height: 80px');
    expect(kotlin).toContain('listOf(128f.dp, 80f.dp)');
    // Neither client invents a radius.
    expect(css).toContain('border-radius: var(--radius-2xl)');
    expect(kotlin).toContain('RoyShape.card');
    // The badge's pill, sizes and tones are one source too.
    expect(css).toContain('.roy-badge--default');
    expect(css).toContain('padding: 2px 10px');
    expect(kotlin).toContain('fun default(type: RoyTypeScale): Size =');
    expect(kotlin).toContain('RoyShape.pill');
  });

  it('refuse a name the token source does not have', () => {
    const broken = {
      primitives: { card: { ...recipes.primitives.card, padding: 'card-padding-huge' } },
    };
    expect(() => renderCss(broken, tokens)).toThrow(/not a spacing token/);
  });
});

describe('the committed outputs', () => {
  it('are current, and the generator is deterministic', async () => {
    const files = await generate();
    expect(files.size).toBe(2);
    expect([...files.keys()]).toEqual([
      'app/components.css',
      'android/app/src/main/kotlin/com/royaraqamia/app/theme/Recipes.kt',
    ]);
    expect([...(await generate()).entries()]).toEqual([...files.entries()]);
  });
});
