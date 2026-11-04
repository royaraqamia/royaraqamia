import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { test, expect, type Page } from '@playwright/test';

import { signIn } from './sign-in';

/**
 * The plan card, rendered against its recipe (ADR-0099, ADR-0100).
 *
 * `check:components` proves both clients read one description; nothing proves the
 * *browser* paints that description. That is the gap this spec fills: every value
 * below is read from `shared/components/recipes.json` (and the token source it
 * names) and compared with what Chromium computed, so a component that drifts
 * from the recipe fails here instead of in a review.
 *
 * The app side of the pair is `PlanCard.kt`, which reads the same file at build
 * time, so a value that changes on both sides changes here once.
 *
 * Pixel-level rendering (font raster, optical placement) is not asserted: that is
 * the screenshot diff `docs/mobile/two-clients.md` still lists as owed.
 */
const ROOT = process.cwd();
const recipes = JSON.parse(
  readFileSync(join(ROOT, 'shared/components/recipes.json'), 'utf8')
).primitives;
const tokens = JSON.parse(readFileSync(join(ROOT, 'shared/tokens/tokens.json'), 'utf8'));

/** The phone width this gate is pinned to. */
const VIEWPORT = { width: 390, height: 844 };

/** `8rem` -> 128, `1px` -> 1: rem is 16px, as in the token generator. */
function px(value: string): number {
  const match = /^(-?\d+(?:\.\d+)?)(rem|px)$/.exec(value.trim());
  if (!match) throw new Error(`not a length: ${value}`);
  return Number(match[1]) * (match[2] === 'rem' ? 16 : 1);
}

/** A `clamp(min, preferred vw, max)` at [width], which is what the browser resolves. */
function clamp(entry: { min: string; preferred: string; max: string }, width: number): number {
  const preferred = Number(entry.preferred.replace('vw', '')) * (width / 100);
  return Math.max(px(entry.min), Math.min(preferred, px(entry.max)));
}

/** The recipe's radius step, resolved the way `app/theme.css` derives it. */
function radius(step: string): number {
  if (step === 'pill') return 9999;
  const offsets: Record<string, number> = { sm: -4, md: -2, lg: 0, xl: 4, '2xl': 8 };
  const offset = offsets[step];
  if (offset === undefined) throw new Error(`the site has no radius step "${step}"`);
  return px(tokens.radius.base) + offset;
}

/** `#9333EA` -> `rgb(147, 51, 234)`, the form a computed gradient takes. */
function hexToRgb(hex: string): string {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

async function styles(page: Page, selector: string) {
  const element = page.locator(selector).first();
  await expect(element).toBeVisible();
  return element.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      borderRadius: style.borderTopLeftRadius,
      paddingTop: style.paddingTop,
      paddingLeft: style.paddingLeft,
      marginTop: style.marginTop,
      rowGap: style.rowGap,
      columnGap: style.columnGap,
      backgroundColor: style.backgroundColor,
      borderTopWidth: style.borderTopWidth,
      boxShadow: style.boxShadow,
      width: style.width,
      height: style.height,
      backgroundImage: style.backgroundImage,
      direction: style.direction,
      fontFamily: style.fontFamily,
      transform: style.transform,
      transformOrigin: style.transformOrigin,
    };
  });
}

test.describe('the plan card renders the recipe', () => {
  test.use({ viewport: VIEWPORT, colorScheme: 'dark', locale: 'ar' });

  test('a guest gets the card, the mark and the pill at the recipe values', async ({ page }) => {
    await page.goto('/account/plan');

    const card = await styles(page, '.roy-card');
    expect(card.borderRadius).toBe(`${radius(recipes.card.radius)}px`);
    expect(parseFloat(card.paddingTop)).toBeCloseTo(
      clamp(tokens.space['card-padding'], VIEWPORT.width),
      0
    );
    expect(parseFloat(card.rowGap)).toBeCloseTo(
      clamp(tokens.space['element-gap-sm'], VIEWPORT.width),
      0
    );
    // `bg-card/60`: the card's own colour at the recipe's alpha, not an opaque fill.
    expect(card.backgroundColor).toMatch(
      new RegExp(`^rgba\\(.*, ${recipes.card.surface.alpha}\\)$`)
    );
    expect(parseFloat(card.borderTopWidth)).toBe(px(recipes.card.border.width));

    const mark = await styles(page, '.roy-guest-mark');
    expect(parseFloat(mark.width)).toBe(px(recipes.guestMark.size));
    expect(parseFloat(mark.height)).toBe(px(recipes.guestMark.size));
    expect(parseFloat(mark.borderRadius)).toBe(radius(recipes.guestMark.radius));
    expect(mark.boxShadow).toContain('inset');
    expect(mark.boxShadow).toContain(`${px(recipes.guestMark.shadow.blur)}px`);

    const glyph = await styles(page, '.roy-guest-mark .roy-glyph');
    expect(parseFloat(glyph.width)).toBe(px(recipes.glyph.sizes.md));

    const cta = await styles(page, '.roy-cta');
    expect(parseFloat(cta.height)).toBe(px(recipes.cta.height));
    expect(parseFloat(cta.borderRadius)).toBe(radius(recipes.cta.radius));
    expect(parseFloat(cta.paddingLeft)).toBe(px(recipes.cta.paddingX));
    const gradient = cta.backgroundImage.replace(/\s+/g, ' ').toLowerCase();
    for (const stop of recipes.cta.gradient.stops) {
      expect(gradient).toContain(hexToRgb(stop));
    }
  });

  test('a member gets the bar, the badge and the skeleton at the recipe values', async ({
    page,
    context,
  }) => {
    test.skip(
      !process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD,
      'E2E_TEST_EMAIL and E2E_TEST_PASSWORD are the fixture account'
    );

    await signIn(context, 'http://localhost:3000');

    // Hold the read open so the skeleton is what the first frame shows.
    await page.route('**/api/me/plan', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      await route.continue();
    });

    await page.goto('/account/plan');

    const skeleton = await styles(page, '.roy-skeleton');
    expect(parseFloat(skeleton.height)).toBe(px(recipes.skeleton.blocks[0]));
    expect(parseFloat(skeleton.borderRadius)).toBe(radius('2xl'));
    await expect(page.locator('.roy-skeleton')).toHaveCount(recipes.skeleton.blocks.length);
    const skeletonGap = await page
      .locator('.roy-skeletons')
      .evaluate((node) => getComputedStyle(node).rowGap);
    expect(parseFloat(skeletonGap)).toBeCloseTo(px(recipes.skeleton.gap), 0);

    const track = await styles(page, '.roy-progress-track');
    expect(parseFloat(track.height)).toBe(px(recipes.progress.height));
    expect(parseFloat(track.borderRadius)).toBe(radius(recipes.progress.radius));

    // The fill grows from the track's start edge, which is the right one in RTL:
    // the computed origin's x is the element's own width, not zero.
    const fill = await styles(page, '.roy-progress-fill');
    expect(parseFloat(fill.transformOrigin)).toBeCloseTo(parseFloat(fill.width), 0);
    expect(parseFloat(fill.height)).toBe(px(recipes.progress.height));

    // `hsl(var(--primary))` is the recipe's colour: resolve the token the way the
    // stylesheet does and compare, rather than hard-coding an RGB triplet here.
    const filled = await page
      .locator('.roy-progress-fill')
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    const expected = await page.evaluate((token) => {
      const probe = document.createElement('div');
      probe.style.backgroundColor = `hsl(${token})`;
      document.body.append(probe);
      const resolved = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return resolved;
    }, tokens.color.primary);
    expect(filled).toBe(expected);

    const value = await styles(page, '.roy-progress-value');
    expect(value.direction).toBe(recipes.progress.value.direction);
    expect(value.fontFamily).toContain('Aref Ruqaa');

    const badge = await styles(page, '.roy-badge');
    expect(parseFloat(badge.height)).toBe(px(recipes.badge.sizes.default.height));
    expect(parseFloat(badge.borderRadius)).toBe(radius(recipes.badge.radius));
    expect(parseFloat(badge.paddingLeft)).toBe(px(recipes.badge.sizes.default.paddingX));
  });
});
