import { test, expect, type Page } from '@playwright/test';
import { gotoUnderWorkerControl } from './worker-control';

/**
 * The offline pass at every web breakpoint (#396).
 *
 * The four `responsive-*` Playwright projects used to match no spec at all, so
 * they listed zero tests and proved nothing. This is the spec they run: each
 * project supplies one of the 320 / 375 / 428 / 768 px viewports, and every
 * assertion here is a property that used to hold only at desktop width.
 *
 * Gated behind PUBLIC_OFFLINE_E2E=1 for the same reason as
 * `public-offline.spec.ts`: the worker is only registered outside development,
 * so this needs a production build.
 *   npm run build && npm run start
 *   PUBLIC_OFFLINE_E2E=1 npx playwright test e2e/responsive-offline.spec.ts
 */

const ENABLED = process.env.PUBLIC_OFFLINE_E2E === '1';

// The projects already pin the viewport and device; only the worker permission
// has to be added for the test's own context.
test.use({ serviceWorkers: 'allow' });

test.skip(!ENABLED, 'requires PUBLIC_OFFLINE_E2E=1 (production build)');

const HERO_HEADING = 'شريكك الاستراتيجي';

/** Scrolls the portfolio into view so its lazy responsive images are fetched. */
async function warmPortfolioImages(page: Page): Promise<void> {
  await page.locator('#portfolio').scrollIntoViewIfNeeded();
  const images = page.locator('#portfolio img');
  await expect
    .poll(
      () =>
        images.evaluateAll(
          (nodes) =>
            nodes.filter((node) => {
              const image = node as HTMLImageElement;
              return image.complete && image.currentSrc !== '' && image.naturalWidth > 0;
            }).length
        ),
      { message: 'the portfolio should paint at least one real image' }
    )
    .toBeGreaterThan(0);

  // Bring the last card into view too. It is the one an online visit at a wider
  // breakpoint is least likely to have requested, so offline it exercises the
  // fallback rather than a cache hit.
  const last = images.last();
  await last.scrollIntoViewIfNeeded();
  await expect
    .poll(
      () =>
        last.evaluate((node) => {
          const image = node as HTMLImageElement;
          return image.complete ? image.naturalWidth : -1;
        }),
      { message: 'the last portfolio image should settle instead of staying broken' }
    )
    .toBeGreaterThan(0);
}

/**
 * An `img` that has finished loading with no intrinsic size is the browser's
 * broken-image state. The scope is the viewport on purpose: an off-screen
 * `loading="lazy"` image that has not been requested yet also reports
 * `complete` with a zero intrinsic size in Chromium, and that is not a failure —
 * only an image the visitor can actually see is.
 */
async function brokenImages(page: Page): Promise<string[]> {
  return page.locator('img').evaluateAll((nodes) =>
    nodes
      .filter((node) => {
        const image = node as HTMLImageElement;
        if (!image.complete || image.currentSrc === '' || image.naturalWidth > 0) return false;
        const box = image.getBoundingClientRect();
        return (
          box.right > 0 &&
          box.left < window.innerWidth &&
          box.bottom > 0 &&
          box.top < window.innerHeight
        );
      })
      .map((node) => (node as HTMLImageElement).currentSrc)
  );
}

function collectImageFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on('response', (response) => {
    const url = response.url();
    if (response.status() !== 503) return;
    if (response.request().resourceType() === 'image' || url.includes('/_next/image')) {
      failures.push(url);
    }
  });
  return failures;
}

test('a visited public page paints offline with its heading, content and images', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const imageFailures = collectImageFailures(page);

  await gotoUnderWorkerControl(page, '/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(HERO_HEADING);
  await expect(page.getByText('نبني منتجات رقميَّة', { exact: false })).toBeVisible();
  await warmPortfolioImages(page);

  // Radio off: both the document and the responsive images must come from cache.
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { level: 1 })).toContainText(HERO_HEADING);
  await expect(page.getByText('نبني منتجات رقميَّة', { exact: false })).toBeVisible();
  await warmPortfolioImages(page);

  expect(await brokenImages(page)).toEqual([]);
  expect(imageFailures).toEqual([]);
});

test('a width first used offline falls back gracefully, never with a 503', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const imageFailures = collectImageFailures(page);

  await gotoUnderWorkerControl(page, '/');
  await warmPortfolioImages(page);

  await context.setOffline(true);

  // 3840 is the largest candidate Next emits and none of the four breakpoints
  // selects it, so its variant cannot have been fetched by the online visit.
  // Before #396 this answered 503 and the browser drew a broken-image glyph.
  const firstOfflineWidth = await page.evaluate(async () => {
    const response = await fetch('/_next/image?url=%2F01.webp&w=3840&q=75');
    return {
      status: response.status,
      contentType: response.headers.get('content-type') ?? '',
    };
  });
  expect(firstOfflineWidth.status).toBe(200);
  expect(firstOfflineWidth.contentType).toContain('image/');

  // A new viewport selects a different `srcset` candidate; the reload is where
  // the layout has to hold with only cached or placeholder images available.
  const current = page.viewportSize();
  expect(current).not.toBeNull();
  await page.setViewportSize(
    current!.width < 768 ? { width: 768, height: 1024 } : { width: 320, height: 568 }
  );
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { level: 1 })).toContainText(HERO_HEADING);
  await warmPortfolioImages(page);
  expect(await brokenImages(page)).toEqual([]);
  expect(imageFailures).toEqual([]);
});

test('in-session owned-data navigation paints offline; a cold reload is the offline page', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);

  const bottomTab = (path: string) =>
    page.locator(`nav[aria-label="التَّنقُّل السُّفليّ"] a[href="${path}"]`);

  await gotoUnderWorkerControl(page, '/');

  // Warm `/account` online. It is in the worker's never-cache list (ADR-0031),
  // so its document is never written to Cache Storage; the in-session router
  // cache and the static chunks are what carry the offline navigation below.
  await bottomTab('/account').click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText('سجِّل الدُّخول إلى حسابك')).toBeVisible();
  await bottomTab('/').click();
  await expect(page).toHaveURL(/\/$/);

  await context.setOffline(true);
  await bottomTab('/account').click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText('سجِّل الدُّخول إلى حسابك')).toBeVisible();

  // A cold reload has no document to serve: the never-cache rule answers the
  // navigation with the cached `/offline` page. This is the documented limit in
  // docs/specs/offline-first.md ("Limits of instant"), not a regression.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /غير متَّصل/ })).toBeVisible();
});
