import { test, expect, type Page } from '@playwright/test';

/**
 * The app-chrome split: the three primary routes keep the top nav and the
 * bottom tab bar, and every other page drops both for a floating back control.
 *
 * The chrome pieces are marked rather than classed — `data-app-navbar`,
 * `data-bottom-tabbar` and `data-secondary-header` — because a fixed bar's
 * presence is the whole observable effect of the change.
 */
const TOP_NAV = '[data-app-navbar]';
const BOTTOM_BAR = '[data-bottom-tabbar]';
const BACK_HEADER = '[data-secondary-header]';
const ACCOUNT_FOOTER = '[data-account-footer]';

/**
 * The user agent an installed shell sends (ADR-0046): the name a user reads,
 * then the counter the update check compares. A browser sends no token at all.
 */
const SHELL_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 RoyaraqamiaShell/1.0.7+20007';

const backControl = (page: Page) => page.locator(BACK_HEADER).getByRole('button', { name: 'رجوع' });

async function expectAppChrome(page: Page) {
  await expect(page.locator(TOP_NAV)).toBeVisible();
  await expect(page.locator(BOTTOM_BAR)).toBeVisible();
  await expect(page.locator(BACK_HEADER)).toHaveCount(0);
}

async function expectSecondaryChrome(page: Page) {
  await expect(page.locator(BACK_HEADER)).toBeVisible();
  await expect(page.locator(TOP_NAV)).toHaveCount(0);
  await expect(page.locator(BOTTOM_BAR)).toHaveCount(0);
}

test.describe('primary pages', () => {
  for (const path of ['/', '/community', '/account']) {
    test(`${path} keeps the top nav and the bottom tab bar`, async ({ page }) => {
      await page.goto(path);

      await expectAppChrome(page);
    });
  }

  test('the desktop bar is a fully rounded pill', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    const bar = page.locator(BOTTOM_BAR);
    await expect(bar).toBeVisible();

    const { radius, height } = await bar.evaluate((element) => ({
      radius: Number.parseFloat(getComputedStyle(element).borderTopLeftRadius),
      height: element.getBoundingClientRect().height,
    }));

    // `rounded-full` resolves to an effectively infinite radius; the fixed pill
    // it replaced (`rounded-2xl`, 16px) would not clear half the bar's height.
    expect(radius).toBeGreaterThan(height / 2);
  });
});

test.describe('secondary pages', () => {
  for (const path of ['/rates', '/privacy', '/terms', '/security', '/verify', '/app-info']) {
    test(`${path} drops the app chrome for a back header`, async ({ page }) => {
      await page.goto(path);

      await expectSecondaryChrome(page);
    });
  }

  test('the back control floats in the corner instead of a full-width bar', async ({ page }) => {
    await page.goto('/rates');

    const header = page.locator(BACK_HEADER);
    await expect(header).toBeVisible();

    // A corner control, not the edge-to-edge bar it replaced.
    const box = await header.boundingBox();
    expect(box?.width).toBeLessThan(80);

    await expect(header.getByRole('button', { name: 'رجوع' })).toBeVisible();
  });

  test('back goes up to the section when the page was opened cold', async ({ page }) => {
    await page.goto('/verify/UNKNOWN-CODE');

    await backControl(page).click();

    await expect(page).toHaveURL(/\/verify$/);
  });

  test('back steps over a folder that is not a page', async ({ page }) => {
    // `/consultation` holds `book/` and has no `page.tsx` of its own.
    await page.goto('/consultation/book');

    await backControl(page).click();

    await expect(page).toHaveURL(/\/$/);
  });

  test('back returns to the page the user came from', async ({ page }) => {
    await page.goto('/account');
    await expectAppChrome(page);

    // A hop from a primary page into a secondary one, without a reload.
    await page.locator('a[href^="/auth/login"]').first().click();
    await expect(page).toHaveURL(/\/auth\/login/);
    await expectSecondaryChrome(page);

    await backControl(page).click();

    // In-app history wins over the URL walk, which would answer `/`.
    await expect(page).toHaveURL(/\/account$/);
  });
});

/**
 * The version line is the installed app's own number, so it appears only where
 * the app is being set up — `/account` itself, not the pages behind it — and only
 * inside the shell, the one client whose user agent names a version (ADR-0046).
 */
test.describe('the installed app’s version', () => {
  test.describe('inside the shell', () => {
    test.use({ userAgent: SHELL_UA });

    test('names the app on the account area’s front page', async ({ page }) => {
      await page.goto('/account');

      // The name alone: the counter is what the update check compares, not what
      // a user is reading.
      await expect(page.locator(ACCOUNT_FOOTER)).toHaveText('1.0.7');
    });

    test('stays off the pages behind the front one', async ({ page }) => {
      await page.goto('/account/faq');

      await expect(page.locator(ACCOUNT_FOOTER)).toHaveCount(0);
    });
  });

  test('a browser shows no version at all', async ({ page }) => {
    await page.goto('/account');

    await expect(page.locator(ACCOUNT_FOOTER)).toHaveCount(0);
  });
});

test.describe('phone widths', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('primary pages keep both bars, flush to the bottom edge', async ({ page }) => {
    await page.goto('/');

    await expectAppChrome(page);

    // Below `lg` the bar is flush; the floating pill is desktop-only.
    const bar = await page.locator(BOTTOM_BAR).boundingBox();
    expect(bar).not.toBeNull();
    expect(Math.round((bar?.y ?? 0) + (bar?.height ?? 0))).toBe(844);
  });

  test('secondary pages get the same split on a phone', async ({ page }) => {
    await page.goto('/rates');

    await expectSecondaryChrome(page);
  });
});
