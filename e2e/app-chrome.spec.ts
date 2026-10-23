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
const NAVBAR_SPACER = '[data-navbar-spacer]';
const ACCOUNT_FOOTER = '[data-account-footer]';
const SITE_FOOTER = 'footer[data-flat-footer]';

/**
 * The user agent an installed shell sends (ADR-0046): the name a user reads,
 * then the counter the update check compares. A browser sends no token at all.
 */
const SHELL_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 RoyaraqamiaShell/1.0.7+20007';

const backControl = (page: Page) => page.locator(BACK_HEADER).getByRole('button', { name: 'رجوع' });

/**
 * What the floating control is sitting on: painted boxes and real text line rects
 * that intersect it. Block boxes alone would flag a centred heading whose text
 * never reaches the corner, so text is measured per line through a `Range`.
 */
async function coveredByControl(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const header = document.querySelector('[data-secondary-header]');
    if (!header) return ['no back control'];

    const control = header.getBoundingClientRect();
    const overlaps = (r: DOMRect) =>
      r.left < control.right &&
      r.right > control.left &&
      r.top < control.bottom &&
      r.bottom > control.top;
    const clipped = (el: Element) =>
      el === document.body ||
      el === document.documentElement ||
      el.closest('.sr-only') !== null ||
      el.closest('[aria-hidden="true"]') !== null;

    const hits: string[] = [];

    for (const el of Array.from(document.querySelectorAll('*'))) {
      if (header.contains(el) || clipped(el)) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0')
        continue;

      const bordered = Number.parseFloat(style.borderTopWidth) > 0;
      const media = el.tagName === 'IMG' || el.tagName === 'SVG';
      const filled =
        style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
      if (!bordered && !media && !filled) continue;

      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || !overlaps(r)) continue;
      // A full-width fill with no border and no media is a page background.
      if (!bordered && !media && r.width >= window.innerWidth * 0.95) continue;

      hits.push(`<${el.tagName.toLowerCase()}> ${(el.textContent ?? '').trim().slice(0, 40)}`);
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const parent = node.parentElement;
      if (!node.data.trim() || !parent || header.contains(parent) || clipped(parent)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      if (Array.from(range.getClientRects()).some(overlaps)) {
        hits.push(`text: ${node.data.trim().slice(0, 40)}`);
      }
    }

    return hits;
  });
}

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

  test('a primary shell keeps its content clear of the fixed bar', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/community');

    const main = await page.locator('#main-content').boundingBox();

    // The bar is 5rem tall at `lg`; the shell reserves that much flow space.
    expect(main?.y).toBeGreaterThanOrEqual(64);
  });
});

test.describe('a secondary child of a primary shell', () => {
  // `/account/faq` sits under `app/account/layout.tsx`, which is primary for
  // `/account`. The band that layout reserves belongs to the fixed top nav, and
  // this page has no nav — so the nav's spacer has to go with it, or the page
  // keeps an empty strip where a bar would have been. What stays is the back
  // control's own band, which every secondary page keeps (`app/global.css`).
  test('drops the nav band, keeping only the back control’s', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/account/faq');

    await expectSecondaryChrome(page);
    await expect(page.locator('[data-navbar-spacer]')).toHaveCount(0);

    const main = await page.locator('#main-content').boundingBox();
    const control = await backControl(page).boundingBox();
    expect(main?.y).toBeGreaterThanOrEqual((control?.y ?? 0) + (control?.height ?? 0));
  });
});

test.describe('secondary pages', () => {
  for (const path of [
    '/rates',
    '/privacy',
    '/terms',
    '/security',
    '/verify',
    '/app-info',
    '/news',
  ]) {
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
 * The control floats in the corner instead of sitting in a bar, so on its own it
 * lands on whatever a page starts with — a publisher chip, a profile card, a form
 * heading. `app/global.css` reserves the band it occupies; these are the routes
 * an audit caught it covering before that band existed.
 */
test.describe('the floating control never covers page content', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const path of [
    '/training/apply',
    '/consultation/book',
    '/hire',
    '/request-project',
    '/rates',
    '/account/faq',
    '/news',
  ]) {
    test(`${path} starts below it`, async ({ page }) => {
      await page.goto(path);

      await expectSecondaryChrome(page);
      expect(await coveredByControl(page)).toEqual([]);
    });
  }

  test('a post’s publisher chip stays clear of it', async ({ page }) => {
    await page.goto('/community');

    const post = page.locator('a[href^="/community/"]').first();
    await expect(post).toBeVisible();
    await page.goto((await post.getAttribute('href'))!);

    await expectSecondaryChrome(page);
    expect(await coveredByControl(page)).toEqual([]);
  });

  test('the band grows with the system bar', async ({ page }) => {
    await page.goto('/hire');

    // `env()` is a browser value no test can set, so the token every fixed
    // surface funnels it through stands in for a device that reports one
    // (`app/global.css`). The control moves down with the band; if the two read
    // different sources, the control lands back on the card.
    await page.addStyleTag({ content: ':root{--roy-safe-top:24px}' });

    await expectSecondaryChrome(page);
    expect(await coveredByControl(page)).toEqual([]);
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

/**
 * The site footer under `/account` is two centred lines, not chrome. `@layer
 * base` fills every unmarked `<footer>` with `hsl(var(--card) / 0.5)`, which
 * read as a grey band behind those lines; `data-flat-footer` is the opt-out,
 * and this is what losing the marker looks like.
 */
test.describe('the account site footer', () => {
  test('paints no band of its own', async ({ page }) => {
    await page.goto('/account');

    await expect(page.locator(SITE_FOOTER)).toBeVisible();
    await expect(page.locator(SITE_FOOTER)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
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

/**
 * The system-bar band.
 *
 * A device that draws the page edge-to-edge hands the page the inset through
 * `env()`; one that does not reports `0`, and the Android shell keeps the
 * WebView below the bars itself (`docs/mobile/android-shell.md`). `env()` is a
 * browser value no test can set, so the test sets the token every fixed surface
 * funnels it through instead (`app/global.css`).
 */
test.describe('the system-bar band', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  /** A status bar the size of a phone's. */
  const BAND = 24;
  /** The bar's own row, at the phone width (`h-16`). */
  const ROW = 64;

  const withSystemBar = (page: Page) =>
    page.addStyleTag({ content: `:root{--roy-safe-top:${BAND}px}` });

  test('the top bar fills the band and pushes its row below it', async ({ page }) => {
    await page.goto('/community');
    await withSystemBar(page);

    const nav = page.locator(TOP_NAV);
    const bar = await nav.boundingBox();

    // The surface still reaches the screen edge: the band is the bar's own
    // background, not a gap above it.
    expect(Math.round(bar?.y ?? -1)).toBe(0);
    await expect(nav).toHaveCSS('padding-top', `${BAND}px`);

    // ...and what the bar holds is clear of the clock.
    const logo = await nav.getByRole('link', { name: /رؤيَة/ }).boundingBox();
    expect(logo?.y ?? 0).toBeGreaterThanOrEqual(BAND);

    // The flow space the fixed bar reserves in the page grows with the band, so
    // a page's first row still lands below the bar.
    const spacer = await page.locator(NAVBAR_SPACER).boundingBox();
    expect(Math.round(spacer?.height ?? 0)).toBe(ROW + BAND);
  });

  test('the lone back control clears the band', async ({ page }) => {
    await page.goto('/rates');
    await withSystemBar(page);

    const back = await backControl(page).boundingBox();

    // `top-3` (12px) below the band.
    expect(Math.round(back?.y ?? -1)).toBe(BAND + 12);
  });

  test('a device that reports no insets reserves nothing', async ({ page }) => {
    await page.goto('/community');

    const nav = page.locator(TOP_NAV);
    await expect(nav).toHaveCSS('padding-top', '0px');

    const spacer = await page.locator(NAVBAR_SPACER).boundingBox();
    expect(Math.round(spacer?.height ?? 0)).toBe(ROW);
  });

  test('an engine that cannot resolve the inset keeps the reserved band', async ({ page }) => {
    await page.goto('/community');

    // Some Android WebViews give back an invalid value rather than `0`. The
    // band then has to collapse to nothing, not take the `calc()`s that consume
    // it down with it — a spacer that loses its base height puts the page's
    // first row back under the bar, on the devices least able to be tested.
    await page.addStyleTag({ content: ':root{--roy-safe-top-raw:initial}' });

    await expect(page.locator(TOP_NAV)).toHaveCSS('padding-top', '0px');

    const spacer = await page.locator(NAVBAR_SPACER).boundingBox();
    expect(Math.round(spacer?.height ?? 0)).toBe(ROW);
  });
});
